// The Multi-FX course routes (a supplementary course under Mentorship, unlocked with a one-time code).
// server.js calls mount() once with the pieces it already has (sign-in checks, limiters, the sheet).
//
// Student routes live under /api/portal/multifx. Everything except "status" and "unlock" needs the student to have
// Multi-FX unlocked; the website decides that on every request (a cancelled code takes effect within seconds).
// Dashboard routes live under /api/admin/multifx and need the "multifx" access.
const path = require("path");
const multifxcodes = require("./multifxcodes");
const multifxLib = require("./multifx");
const content = require("./multifx-content");
const quiz = require("./multifx-quiz");

const LOCKED_MESSAGE = "Multi-FX is locked. Enter the one-time Multi-FX code from your mentor or ABEC-FX to open it.";

function mount(d) {
  const { app, store, rateLimit, studentAuth, requirePerm, adminLimiter, lookupLimiter, lagosTimestamp, sessionSecret, pdfLink, links, attendanceLib, grading, clean } = d;
  const PURPOSE = "multifxpdf";

  const codes = multifxcodes.create(store, {
    now: lagosTimestamp,
    studentExists: async (reg) => (await store.readCached(5000)).some((r) => (r[0] || "").toUpperCase() === reg),
  });
  const course = multifxLib.create(store, { now: lagosTimestamp });
  const classes = attendanceLib.create(store, { now: lagosTimestamp, tabs: { classes: "mfxclasses", attendance: "mfxattendance" } });
  setInterval(() => { classes.flush().catch((e) => console.error("Multi-FX attendance save failed:", e.message)); }, 3 * 60 * 1000).unref();

  const multifxAuth = requirePerm("multifx");
  const titles = Object.fromEntries(content.SECTIONS.map((s) => [s.id, s.title]));
  const studentRow = async (reg) => (await store.readCached(5000)).find((r) => (r[0] || "").toUpperCase() === reg) || null;

  // ---- limiters ----
  const byStudent = (req) => req.studentReg;
  const unlockLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 8, skipSuccessfulRequests: true, keyGenerator: byStudent,
    standardHeaders: true, legacyHeaders: false, message: { error: "Too many wrong codes. Please wait a few minutes and try again." },
  });
  const readLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 200, keyGenerator: byStudent, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please try again in a few minutes." } });
  const saveLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 120, keyGenerator: byStudent, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please try again in a few minutes." } });
  const quizLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, keyGenerator: byStudent, standardHeaders: true, legacyHeaders: false, message: { error: "Too many quiz requests. Please try again later." } });
  const beatLimiter = rateLimit({ windowMs: 60 * 1000, max: 8, keyGenerator: byStudent, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } });
  const pdfLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } });

  // ---- wrappers ----
  function handle(handler) {
    return async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        await handler(req, res);
      } catch (err) {
        if (err instanceof multifxcodes.MultifxCodeError || err instanceof attendanceLib.AttendanceError || err.status) {
          return res.status(err.status || 400).json({ error: err.message, ...(err.fields ? { errors: err.fields } : {}) });
        }
        console.error("Multi-FX request failed:", err.message);
        res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
      }
    };
  }
  // Only for students who have Multi-FX. `fresh` makes it read the sheet instead of a few-seconds-old copy.
  const gate = (fresh) => async (req, res, next) => {
    try {
      const access = await codes.accessFor(req.studentReg, { fresh: !!fresh });
      if (!access.unlocked) return res.status(403).json({ error: LOCKED_MESSAGE, locked: true });
      next();
    } catch (err) {
      console.error("Multi-FX access check failed:", err.message);
      res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
    }
  };
  const P = "/api/portal/multifx";
  const A = "/api/admin/multifx";

  // ================= Students =================

  // Does this student have Multi-FX? Also the overall progress when they do.
  app.get(P, lookupLimiter, studentAuth, handle(async (req, res) => {
    const access = await codes.accessFor(req.studentReg);
    if (!access.unlocked) return res.json({ unlocked: false });
    res.json({ unlocked: true, progress: await course.progressFor(req.studentReg) });
  }));

  // A student enters the one-time code.
  app.post(P + "/unlock", studentAuth, unlockLimiter, handle(async (req, res) => {
    if (!(await studentRow(req.studentReg))) return res.status(404).json({ error: "No student found with that registration number." });
    res.json(await codes.redeem((req.body || {}).code, req.studentReg));
  }));

  // The handbook: every section with its text, and the student's progress.
  app.get(P + "/handbook", readLimiter, studentAuth, gate(false), handle(async (req, res) => {
    res.json({ sections: content.SECTIONS, final: content.FINAL, progress: await course.progressFor(req.studentReg) });
  }));

  // Mark a handbook section as read, or a workbook as done (or undo it).
  app.post(P + "/progress", saveLimiter, studentAuth, gate(false), handle(async (req, res) => {
    const b = req.body || {};
    if (typeof b.done !== "boolean") return res.status(400).json({ error: "That could not be saved." });
    const row = await studentRow(req.studentReg);
    if (!row) return res.status(401).json({ error: "Please sign in to your student portal." });
    const out = await course.saveProgress(req.studentReg, row[4] || "", String(b.kind), clean(b.id, 4), b.done);
    if (!out) return res.status(400).json({ error: "That section could not be found." });
    res.json(out);
  }));

  // The handbook PDF: a short-lived signed link, made only for a student who has Multi-FX.
  app.get(P + "/pdf-link", readLimiter, studentAuth, gate(true), handle(async (req, res) => {
    res.json({ url: "/multifx-handbook.pdf?t=" + encodeURIComponent(pdfLink.sign(req.studentReg, sessionSecret(), Date.now(), PURPOSE)) });
  }));

  app.get("/multifx-handbook.pdf", pdfLimiter, async (req, res) => {
    const secret = sessionSecret();
    const reg = secret ? pdfLink.verify(String(req.query.t || ""), secret, Date.now(), PURPOSE) : null;
    if (!reg) return res.status(401).type("text/plain").send("This link has expired. Open Multi-FX in your student portal and try again.");
    try {
      if (!(await codes.accessFor(reg, { fresh: true })).unlocked) return res.status(403).type("text/plain").send(LOCKED_MESSAGE);
    } catch (err) {
      console.error("Multi-FX PDF access check failed:", err.message);
      return res.status(500).type("text/plain").send("Something went wrong. Please try again shortly.");
    }
    res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
    res.type("application/pdf");
    res.sendFile(path.join(__dirname, "private", "multifx-handbook.pdf"), { headers: { "Content-Disposition": 'inline; filename="Multi-FX-Trading-Strategy-Guide.pdf"' } });
  });

  // The workbook of every section, with the video and extra link the editor set.
  app.get(P + "/workbook", readLimiter, studentAuth, gate(false), handle(async (req, res) => {
    let media = {};
    try { media = course.forStudents(await course.readMedia(false)); } catch (e) { console.error("Multi-FX media read failed:", e.message); media = course.forStudents({}); }
    const items = content.WORKBOOKS.map((w) => ({ ...w, title: titles[w.id], video: media[w.id].video, resource: media[w.id].resource }));
    res.json({ items, progress: await course.progressFor(req.studentReg) });
  }));

  app.get(P + "/community", readLimiter, studentAuth, gate(false), handle(async (_req, res) => {
    try { res.json(links.multifxFor(await store.readLinks())); } catch (e) { console.error("Multi-FX community read failed:", e.message); res.json(links.multifxFor({})); }
  }));

  // Live class (its own series, separate from the main course).
  app.get(P + "/class", readLimiter, studentAuth, gate(false), handle(async (req, res) => {
    res.json(await classes.forStudent(req.studentReg));
  }));
  app.post(P + "/class/heartbeat", beatLimiter, studentAuth, gate(false), handle(async (req, res) => {
    res.json(await classes.heartbeat(req.studentReg, (req.body || {}).classId));
  }));

  // Quiz.
  const quizEntry = (cells) => ({
    at: cells[0], score: Number(cells[3]), total: Number(cells[4]), pct: Number(cells[5]), grade: cells[6], attempt: Number(cells[7]),
  });
  const myAttempts = async (reg) => (await store.tabRows("mfxquiz")).filter((r) => String(r.cells[1] || "").trim().toUpperCase() === reg);

  app.get(P + "/quiz", readLimiter, studentAuth, gate(false), handle(async (req, res) => {
    const attempts = (await myAttempts(req.studentReg)).map((r) => quizEntry(r.cells)).reverse(); // newest first
    const best = attempts.reduce((b, a) => (!b || a.pct > b.pct ? a : b), null);
    res.json({ bank: quiz.BANK.length, perAttempt: Math.min(quiz.PER_ATTEMPT, quiz.BANK.length), attempts, latest: attempts[0] || null, best, scale: grading.SCALE });
  }));

  app.post(P + "/quiz/start", quizLimiter, studentAuth, gate(true), handle(async (req, res) => {
    const secret = sessionSecret();
    if (!secret) return res.status(503).json({ error: "Student sign-in is not set up on the website yet." });
    const a = quiz.startAttempt(req.studentReg, secret);
    res.json({ token: a.token, total: a.total, questions: a.questions.map(({ id, q, options }) => ({ id, q, options })) });
  }));

  let quizChain = Promise.resolve();
  const quizQueued = (task) => { const run = quizChain.then(task, task); quizChain = run.catch(() => {}); return run; };

  app.post(P + "/quiz/submit", quizLimiter, studentAuth, gate(true), handle(async (req, res) => {
    const secret = sessionSecret();
    const b = req.body || {};
    const attempt = quiz.readToken(String(b.token || ""), secret);
    if (!attempt || attempt.reg !== req.studentReg) return res.status(400).json({ error: "This quiz attempt has expired. Please start the quiz again." });
    const graded = quiz.grade(attempt, b.answers);
    if (!graded) return res.status(400).json({ error: "Your answers could not be read. Please start the quiz again." });
    const row = await studentRow(req.studentReg);
    if (!row) return res.status(401).json({ error: "Please sign in to your student portal." });
    const out = await quizQueued(async () => {
      const mine = await myAttempts(req.studentReg);
      if ((await store.tabRows("mfxquiz")).some((r) => r.cells[8] === attempt.attemptId)) {
        return { status: 409, body: { error: "This attempt was already submitted. Start a new quiz to try again." } };
      }
      const pct = grading.percent(graded.score, graded.total);
      const g = grading.gradeFor(pct);
      const attemptNo = mine.length + 1;
      await store.appendTabRows("mfxquiz", [[lagosTimestamp(), req.studentReg, row[4] || "", String(graded.score), String(graded.total), String(pct), g.grade, String(attemptNo), attempt.attemptId, JSON.stringify(graded.breakdown), new Date().toISOString()]]);
      return { status: 200, body: { score: graded.score, total: graded.total, pct, grade: g.grade, label: g.label, attempt: attemptNo, breakdown: graded.breakdown, review: graded.review } };
    });
    res.status(out.status).json(out.body);
  }));

  // ================= Dashboard =================

  app.get(A + "/codes", adminLimiter, multifxAuth, handle(async (_req, res) => {
    const list = await codes.list();
    const students = await store.readCached(5000);
    const names = new Map(students.map((r) => [(r[0] || "").toUpperCase(), r[4] || ""]));
    res.json({ codes: list.map((c) => ({ ...c, usedByName: names.get(c.usedBy) || "" })) });
  }));
  app.post(A + "/codes", adminLimiter, multifxAuth, handle(async (req, res) => {
    res.json(await codes.generate(req.body, req.admin));
  }));
  app.post(A + "/codes/revoke", adminLimiter, multifxAuth, handle(async (req, res) => {
    res.json(await codes.revoke((req.body || {}).code, req.admin));
  }));

  app.get(A + "/media", adminLimiter, multifxAuth, handle(async (_req, res) => {
    res.json({ sections: content.SECTIONS.map((s) => ({ id: s.id, title: s.title })), values: await course.readMedia(true) });
  }));
  app.put(A + "/media", adminLimiter, multifxAuth, handle(async (req, res) => {
    res.json({ ok: true, values: await course.saveMedia(req.body, titles) });
  }));

  app.get(A + "/attendance", adminLimiter, multifxAuth, handle(async (_req, res) => { res.json(await classes.list()); }));
  app.post(A + "/attendance/start", adminLimiter, multifxAuth, handle(async (req, res) => { res.json(await classes.start(req.body, req.admin)); }));
  app.post(A + "/attendance/end", adminLimiter, multifxAuth, handle(async (req, res) => { res.json(await classes.end(req.admin)); }));
  app.get(A + "/attendance/report", adminLimiter, multifxAuth, handle(async (req, res) => {
    const out = await classes.report(String(req.query.id || ""));
    const rows = await store.readCached(5000);
    const byReg = new Map(rows.map((r) => [(r[0] || "").toUpperCase(), r]));
    const people = out.people.map((p) => ({ ...p, name: (byReg.get(p.reg) || [])[4] || "" }));
    // Students who have Multi-FX but never joined are listed as absent.
    const joined = new Set(out.people.map((p) => p.reg));
    const absent = [...(await codes.unlockedRegs())].filter((reg) => !joined.has(reg))
      .map((reg) => ({ reg, name: (byReg.get(reg) || [])[4] || "", minutes: 0, percent: 0, present: false }));
    res.json({ ...out, people: people.concat(absent) });
  }));

  app.get(A + "/quiz-results", adminLimiter, multifxAuth, handle(async (_req, res) => {
    const rows = (await store.tabRows("mfxquiz")).map((r) => ({ reg: r.cells[1], name: r.cells[2], ...quizEntry(r.cells) })).reverse();
    res.json({ results: rows.slice(0, 1000), total: rows.length });
  }));

  return { codes, course, classes };
}

module.exports = { mount, LOCKED_MESSAGE };
