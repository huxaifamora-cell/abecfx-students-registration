// Multi-FX: the unlock code rules, the quiz engine, progress, and the whole course over HTTP against the real server.js
// (in-memory sheet, see test/support/fake-sheets.js). Run with:  npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { createMemoryStore, student } = require("./support/memory-store");
const multifxcodes = require("../multifxcodes");
const multifx = require("../multifx");
const quiz = require("../multifx-quiz");
const content = require("../multifx-content");
const pdfLink = require("../pdflink");
const { boot, A, B, C } = require("./support/boot-server");

const A_ = "ABECFX/26/0001", B_ = "ABECFX/26/0002";
const mk = () => {
  const store = createMemoryStore({ students: [student(1), student(2)] });
  const codes = multifxcodes.create(store, { now: () => "t", studentExists: async (r) => /ABECFX\/26\/000[12]/.test(r) });
  return { store, codes };
};

test("codes: a code unlocks one student for good and is spent", async () => {
  const { codes } = mk();
  const [c] = (await codes.generate({ count: 1 }, { username: "owner" })).codes;
  assert.match(c.code, /^MF-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal((await codes.accessFor(A_, { fresh: true })).unlocked, false);
  assert.deepEqual(await codes.redeem(c.code.toLowerCase().replace(/-/g, " "), A_), { unlocked: true, already: false });
  assert.equal((await codes.accessFor(A_, { fresh: true })).unlocked, true);
  await assert.rejects(codes.redeem(c.code, B_), (e) => e.status === 400 && e.message === multifxcodes.BAD_CODE);
  assert.equal((await codes.accessFor(B_, { fresh: true })).unlocked, false);
});

test("codes: a student who already has Multi-FX does not burn a second code", async () => {
  const { codes } = mk();
  const [c1, c2] = (await codes.generate({ count: 2 }, null)).codes;
  await codes.redeem(c1.code, A_);
  assert.deepEqual(await codes.redeem(c2.code, A_), { unlocked: true, already: true });
  await codes.redeem(c2.code, B_); // still unused, so student B can use it
  assert.equal((await codes.accessFor(B_, { fresh: true })).unlocked, true);
});

test("codes: made for one student, revoked, and unknown codes give the same message", async () => {
  const { codes } = mk();
  const [forB] = (await codes.generate({ count: 1, forReg: B_ }, null)).codes;
  await assert.rejects(codes.redeem(forB.code, A_), (e) => e.message === multifxcodes.BAD_CODE);
  await assert.rejects(codes.redeem("MF-NOPE-NOPE", A_), (e) => e.message === multifxcodes.BAD_CODE);
  await codes.redeem(forB.code, B_);
  const r = await codes.revoke(forB.code, { username: "x" });
  assert.equal(r.hadAccess, true);
  assert.equal((await codes.accessFor(B_, { fresh: true })).unlocked, false);
  await assert.rejects(codes.generate({ count: 0 }), (e) => !!e.fields.count);
  await assert.rejects(codes.generate({ count: 1, forReg: "ABECFX/26/0999" }), (e) => !!e.fields.forReg);
  const [two] = (await codes.generate({ count: 1 }, null)).codes;
  assert.equal((await codes.revoke(two.code, null)).hadAccess, false);
  await assert.rejects(codes.redeem(two.code, A_), (e) => e.status === 400);
});

test("codes: two students entering the same code at once: only one wins", async () => {
  const { codes } = mk();
  const [c] = (await codes.generate({ count: 1 }, null)).codes;
  const res = await Promise.allSettled([codes.redeem(c.code, A_), codes.redeem(c.code, B_)]);
  assert.equal(res.filter((x) => x.status === "fulfilled").length, 1);
});

test("progress: handbook and workbook are counted separately and tolerate hand edits", async () => {
  const store = createMemoryStore({ students: [student(1)] });
  const m = multifx.create(store, { now: () => "t", progressTtl: 0 });
  assert.equal((await m.progressFor(A_)).percent, 0);
  let v = await m.saveProgress(A_, "Ada", "handbook", "00", true);
  assert.equal(v.handbook.count, 1);
  v = await m.saveProgress(A_, "Ada", "workbook", "03", true);
  assert.deepEqual([v.handbook.count, v.workbook.count], [1, 1]);
  assert.equal(v.percent, Math.round((2 / (content.IDS.length * 2)) * 100));
  assert.equal(await m.saveProgress(A_, "Ada", "handbook", "99", true), null);
  assert.equal(await m.saveProgress(A_, "Ada", "other", "01", true), null);
  v = await m.saveProgress(A_, "Ada", "handbook", "00", false);
  assert.equal(v.handbook.count, 0);
  assert.equal(store.data.mfxprogress.length, 1, "one row per student");
  store.data.mfxprogress[0][2] = "1, 02,zz";
  assert.deepEqual((await m.progressFor(A_)).handbook.ids, ["01", "02"]);
  assert.deepEqual(multifx.parseIds("11 3 x"), ["03", "11"]);
});

test("media: video addresses and links are checked and only good ones reach students", async () => {
  const store = createMemoryStore({});
  const m = multifx.create(store, { now: () => "t", mediaTtl: 0 });
  await assert.rejects(m.saveMedia({ "01": { video: "https://example.com/x" } }, {}), (e) => !!e.fields["01"].video);
  await assert.rejects(m.saveMedia({ "01": { link: "http://insecure.example.com" } }, {}), (e) => !!e.fields["01"].link);
  await m.saveMedia({ "01": { video: "https://www.youtube.com/watch?v=abc123XYZ_0", link: "https://drive.google.com/x", linkTitle: "Worksheet" } }, { "01": "Forex" });
  const out = m.forStudents(await m.readMedia(true));
  assert.equal(out["01"].video, "abc123XYZ_0");
  assert.deepEqual(out["01"].resource, { title: "Worksheet", url: "https://drive.google.com/x" });
  assert.equal(out["02"].video, "");
  assert.equal(out["02"].resource, null);
  await m.saveMedia({ "01": { video: "", link: "" } }, { "01": "Forex" }); // clearing works
  assert.equal(m.forStudents(await m.readMedia(true))["01"].video, "");
});

test("quiz: an attempt hides the answers, grades on the server, and cannot be tampered with", () => {
  const secret = "s3cret";
  const a = quiz.startAttempt(A_, secret);
  assert.equal(a.questions.length, quiz.PER_ATTEMPT);
  assert.ok(a.questions.every((q) => q.options.length === 4 && !("a" in q) && !("why" in q)));
  const attempt = quiz.readToken(a.token, secret);
  assert.equal(attempt.reg, A_);
  // answer everything correctly by reading the plan
  const right = attempt.plan.map(([id, perm]) => perm.indexOf(quiz.BANK.find((q) => q.id === id).a));
  const g = quiz.grade(attempt, right);
  assert.equal(g.score, a.total);
  assert.equal(quiz.grade(attempt, right.map(() => null)).score, 0);
  assert.equal(quiz.grade(attempt, right.slice(1)), null, "wrong number of answers");
  // what the student was shown matches the plan
  attempt.plan.forEach(([id, perm], i) => assert.deepEqual(a.questions[i].options, perm.map((o) => quiz.BANK.find((q) => q.id === id).o[o])));
  // tampering, wrong secret, expiry
  const [p, s] = a.token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), r: B_ })).toString("base64url") + "." + s;
  assert.equal(quiz.readToken(forged, secret), null);
  assert.equal(quiz.readToken(a.token, "other"), null);
  assert.equal(quiz.readToken(a.token, secret, Date.now() + quiz.TOKEN_TTL_MS + 1000), null);
  assert.equal(quiz.readToken("junk", secret), null);
});

test("quiz bank: every section has a workbook and the questions point at real sections", () => {
  const ids = content.IDS;
  assert.equal(content.WORKBOOKS.length, ids.length);
  assert.deepEqual(content.WORKBOOKS.map((w) => w.id), ids);
  for (const q of quiz.BANK) assert.ok(ids.includes(q.s), q.id);
  for (const s of content.SECTIONS) assert.ok(s.pdf[0] >= 1 && s.pdf[1] <= 47 && s.pdf[0] <= s.pdf[1], s.id);
});

test("pdf links are tied to their course", () => {
  const t = pdfLink.sign(A_, "k", Date.now(), "multifxpdf");
  assert.equal(pdfLink.verify(t, "k", Date.now(), "multifxpdf"), A_);
  assert.equal(pdfLink.verify(t, "k"), null, "a Multi-FX link cannot open the main handbook");
  assert.equal(pdfLink.verify(pdfLink.sign(A_, "k"), "k", Date.now(), "multifxpdf"), null, "and the reverse");
});

test("Multi-FX over HTTP: locked, unlock, handbook, workbook, community, class, quiz, dashboard", async (t) => {
  const s = await boot({ SESSION_SECRET: "http-secret" });
  t.after(() => s.stop());
  const admin = await s.adminToken();
  const a = await s.studentToken(A);
  const b = await s.studentToken(B);
  const P = "/api/portal/multifx";

  // locked
  assert.deepEqual((await s.call("GET", P, { token: a })).body, { unlocked: false });
  for (const u of ["/handbook", "/workbook", "/community", "/class", "/quiz", "/pdf-link"]) {
    const r = await s.call("GET", P + u, { token: a });
    assert.equal(r.status, 403, u);
    assert.equal(r.body.locked, true);
  }
  assert.equal((await s.call("POST", P + "/quiz/start", { token: a })).status, 403);
  assert.equal((await s.call("GET", P)).status, 401);
  assert.equal((await s.call("POST", "/api/admin/multifx/codes", { token: a, body: { count: 1 } })).status, 401, "a student token is not an admin");

  // admin makes a code
  let r = await s.call("POST", "/api/admin/multifx/codes", { token: admin, body: { count: 2 } });
  assert.equal(r.status, 200);
  const [c1, c2] = r.body.codes.map((c) => c.code);

  // a wrong code, then the right one
  r = await s.call("POST", P + "/unlock", { token: a, body: { code: "MF-AAAA-BBBB" } });
  assert.equal(r.status, 400);
  r = await s.call("POST", P + "/unlock", { token: a, body: { code: c1 } });
  assert.equal(r.status, 200);
  assert.equal((await s.call("GET", P, { token: a })).body.unlocked, true);
  assert.equal((await s.call("GET", P, { token: b })).body.unlocked, false, "another student stays locked");
  assert.equal((await s.call("POST", P + "/unlock", { token: b, body: { code: c1 } })).status, 400, "one-time");

  // handbook and progress
  r = await s.call("GET", P + "/handbook", { token: a });
  assert.equal(r.body.sections.length, content.IDS.length);
  assert.equal(r.body.progress.percent, 0);
  r = await s.call("POST", P + "/progress", { token: a, body: { kind: "handbook", id: "08", done: true } });
  assert.equal(r.body.handbook.count, 1);
  r = await s.call("POST", P + "/progress", { token: a, body: { kind: "workbook", id: "08", done: true } });
  assert.equal(r.body.workbook.count, 1);
  assert.equal((await s.call("POST", P + "/progress", { token: a, body: { kind: "handbook", id: "77", done: true } })).status, 400);
  assert.equal((await s.call("GET", P + "/handbook", { token: a })).body.progress.handbook.count, 1);

  // pdf: link works for A, not forged, not for the main handbook, and stops when the code is cancelled
  r = await s.call("GET", P + "/pdf-link", { token: a });
  assert.match(r.body.url, /^\/multifx-handbook\.pdf\?t=/);
  const pdfUrl = r.body.url;
  let pdf = await fetch(s.base + r.body.url);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal((await fetch(s.base + "/multifx-handbook.pdf?t=abc")).status, 401);
  const mainLink = (await s.call("GET", "/api/handbook/pdf-link", { token: a })).body.url.split("?t=")[1];
  assert.equal((await fetch(s.base + "/multifx-handbook.pdf?t=" + mainLink)).status, 401);

  // workbook with video and an extra link set by the dashboard
  r = await s.call("PUT", "/api/admin/multifx/media", { token: admin, body: { "03": { video: "https://youtu.be/abc123XYZ_0", link: "https://example.com/sheet", linkTitle: "Worksheet" } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await s.call("PUT", "/api/admin/multifx/media", { token: admin, body: { "03": { video: "https://nope.example/v" } } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors["03"].video);
  await s.call("PUT", "/api/admin/multifx/media", { token: admin, body: { "03": { video: "https://youtu.be/abc123XYZ_0", link: "https://example.com/sheet", linkTitle: "Worksheet" } } });
  r = await s.call("GET", P + "/workbook", { token: a });
  const wb3 = r.body.items.find((w) => w.id === "03");
  assert.equal(wb3.video, "abc123XYZ_0");
  assert.equal(wb3.resource.url, "https://example.com/sheet");
  assert.ok(wb3.check.length && wb3.title);
  assert.equal(r.body.progress.workbook.count, 1);

  // community: its own two groups
  assert.deepEqual((await s.call("GET", P + "/community", { token: a })).body, { whatsapp: "", telegram: "" });
  r = await s.call("PUT", "/api/admin/community", { token: admin, body: { multifxWhatsapp: "https://chat.whatsapp.com/mfx", multifxTelegram: "https://t.me/+mfx" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual((await s.call("GET", P + "/community", { token: a })).body, { whatsapp: "https://chat.whatsapp.com/mfx", telegram: "https://t.me/+mfx" });
  assert.equal(JSON.stringify((await s.call("GET", "/api/links")).body).includes("chat.whatsapp.com/mfx"), false, "never on the public links");
  assert.equal(JSON.stringify((await s.call("GET", "/api/community", { token: b })).body).includes("mfx"), false, "nor on the mentorship community page");

  // live class: separate from the main course
  r = await s.call("GET", P + "/class", { token: a });
  assert.equal(r.body.live, null);
  r = await s.call("POST", "/api/admin/multifx/attendance/start", { token: admin, body: { title: "Multi-FX week 1", link: "https://meet.google.com/abc-defg-hij" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await s.call("GET", P + "/class", { token: a });
  assert.equal(r.body.live.title, "Multi-FX week 1");
  const classId = r.body.live.id;
  assert.equal((await s.call("GET", "/api/portal/attendance", { token: a })).body.live, null, "the main course has no class live");
  assert.equal((await s.call("POST", P + "/class/heartbeat", { token: a, body: { classId } })).body.live, true);
  assert.equal((await s.call("POST", P + "/class/heartbeat", { token: b, body: { classId } })).status, 403);
  await s.call("POST", "/api/admin/multifx/attendance/end", { token: admin, body: {} });
  r = await s.call("GET", "/api/admin/multifx/attendance/report?id=" + encodeURIComponent(classId), { token: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.people.filter((p) => p.reg === A).length, 1);
  assert.equal(r.body.people.some((p) => p.reg === B), false, "only students with Multi-FX are listed as absent");

  // quiz
  r = await s.call("GET", P + "/quiz", { token: a });
  assert.equal(r.body.attempts.length, 0);
  r = await s.call("POST", P + "/quiz/start", { token: a });
  assert.equal(r.status, 200);
  assert.equal(r.body.questions.length, quiz.PER_ATTEMPT);
  assert.equal(JSON.stringify(r.body).includes('"why"'), false);
  const token = r.body.token;
  const plan = quiz.readToken(token, "http-secret").plan;
  const right = plan.map(([id, perm]) => perm.indexOf(quiz.BANK.find((q) => q.id === id).a));
  // someone else cannot submit my attempt
  assert.equal((await s.call("POST", P + "/quiz/submit", { token: b, body: { token, answers: right } })).status, 403);
  const wrong = right.map((x, i) => (i < 5 ? (x + 1) % 4 : x));
  r = await s.call("POST", P + "/quiz/submit", { token: a, body: { token, answers: wrong } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.score, quiz.PER_ATTEMPT - 5);
  assert.equal(r.body.pct, 75);
  assert.equal(r.body.grade, "A");
  assert.equal(r.body.review.length, quiz.PER_ATTEMPT);
  assert.equal(r.body.attempt, 1);
  assert.equal((await s.call("POST", P + "/quiz/submit", { token: a, body: { token, answers: right } })).status, 409, "an attempt counts once");
  assert.equal((await s.call("POST", P + "/quiz/submit", { token: a, body: { token: "junk", answers: right } })).status, 400);
  r = await s.call("GET", P + "/quiz", { token: a });
  assert.equal(r.body.attempts.length, 1);
  assert.equal(r.body.best.score, 15);
  r = await s.call("GET", "/api/admin/multifx/quiz-results", { token: admin });
  assert.equal(r.body.total, 1);
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.attempts.length, 0, "main quiz results are untouched");

  // dashboard list, then cancel: access goes away at once
  r = await s.call("GET", "/api/admin/multifx/codes", { token: admin });
  const used = r.body.codes.find((c) => c.code === c1);
  assert.equal(used.status, "Redeemed");
  assert.equal(used.usedBy, A);
  assert.ok(used.usedByName);
  assert.equal(r.body.codes.find((c) => c.code === c2).status, "Unused");
  r = await s.call("POST", "/api/admin/multifx/codes/revoke", { token: admin, body: { code: c1 } });
  assert.equal(r.body.hadAccess, true);
  assert.equal((await s.call("GET", P + "/handbook", { token: a })).status, 403);
  assert.equal((await s.call("GET", P + "/pdf-link", { token: a })).status, 403);
  assert.equal((await fetch(s.base + pdfUrl)).status, 403, "an old PDF link stops working too");
});

test("Multi-FX dashboard access: owner and admin have it, editor and moderator do not", async (t) => {
  const s = await boot({ SESSION_SECRET: "http-secret" });
  t.after(() => s.stop());
  const admin = await s.adminToken();
  const staff = require("../staff");
  assert.ok(staff.PERM_KEYS.includes("multifx"));
  assert.ok(staff.can("admin", "multifx") && staff.can("owner", "multifx"));
  assert.ok(!staff.can("editor", "multifx") && !staff.can("moderator", "multifx"));
  const r = await s.call("GET", "/api/admin/me", { token: admin });
  assert.ok(r.body.perms.includes("multifx"));
});
