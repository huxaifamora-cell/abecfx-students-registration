const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const countries = require("./countries");
const countryCodes = require("./countryCodes");
const states = require("./states.json"); // country -> list of states / provinces / regions
const store = require("./sheets");
const idrules = require("./idrules");
const grading = require("./grading");
const { buildStats, drill, quizEntry } = require("./stats");
const crypto = require("crypto");
const quizToken = require("./quiztoken");
const session = require("./session");
const handbook = require("./handbook-content");
const progress = require("./handbook-progress");
const pdfLink = require("./pdflink");
const links = require("./links");
const videos = require("./videos");

// The quiz runs inside the student portal in a frame. QUIZ_APP_URL is the quiz service's own web
// address (https only); the security policy below lets the portal frame that one address and no other.
function httpsOrigin(u) {
  try {
    const x = new URL(String(u || ""));
    return x.protocol === "https:" ? x.origin : "";
  } catch (e) {
    return "";
  }
}
const QUIZ_APP_ORIGIN = httpsOrigin(process.env.QUIZ_APP_URL);

const app = express();
const PORT = process.env.PORT || 3000;
const PROGRAMMES = ["Forex Mentorship"];
const GENDERS = ["Male", "Female"];

app.set("trust proxy", 1); // Render sits behind a proxy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // national flags on the ID card come from flagcdn.com
        "img-src": ["'self'", "data:", "https://flagcdn.com"],
        // the quiz is shown inside the student portal
        "frame-src": ["'self'", "https://www.youtube-nocookie.com", ...(QUIZ_APP_ORIGIN ? [QUIZ_APP_ORIGIN] : [])],
      },
    },
  })
);
app.use(express.json({ limit: "100kb" })); // registration includes a small passport photo
app.use(express.static(path.join(__dirname, "public")));

// Year of admission, based on Lagos time -> "26"
function admissionYY() {
  const y = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
  }).format(new Date());
  return y.slice(-2);
}

function lagosTimestamp() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());
}

// Serialise registrations so two people can never get the same number.
let queue = Promise.resolve();
function exclusive(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function clean(v, max = 120) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

// The browser shrinks the photo to 320x400 JPEG (about 20-35 KB). Accept only that kind of file.
function checkPhoto(p) {
  if (typeof p !== "string" || p.length < 1500 || p.length > 46000) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p)) return null;
  const head = Buffer.from(p.slice(0, 8), "base64");
  if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) return null; // JPEG signature
  return p;
}

// Date of birth as YYYY-MM-DD: a real calendar date, not in the future, not before 1920.
function validDob(v, todayISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = +m[1], mo = +m[2], da = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return false;
  return y >= 1920 && v <= todayISO;
}

function validate(body) {
  const d = {
    country: clean(body.country),
    state: clean(body.state, 60),
    programme: clean(body.programme),
    fullName: clean(body.fullName),
    email: clean(body.email, 254).toLowerCase(),
    whatsapp: clean(body.whatsapp, 25),
    gender: clean(body.gender),
    dob: clean(body.dob, 10),
    mentorshipCode: clean(body.mentorshipCode, 40).toUpperCase(),
    photo: checkPhoto(body.photo),
  };
  const errors = {};
  if (!countries.includes(d.country)) errors.country = "Please select your country.";
  if (!errors.country) {
    const list = states[d.country];
    if (list) {
      if (!list.includes(d.state)) errors.state = "Please select your state or region.";
    } else if (d.state.length < 2) {
      errors.state = "Please enter your state, province or region.";
    }
  }
  if (!PROGRAMMES.includes(d.programme)) errors.programme = "Please select a programme.";
  if (d.fullName.length < 3 || !/\s/.test(d.fullName))
    errors.fullName = "Please enter your full name (first and last name).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email))
    errors.email = "Please enter a valid email address.";
  const digits = d.whatsapp.replace(/[^\d]/g, "");
  if (!/^\+?[\d\s\-()]+$/.test(d.whatsapp) || digits.length < 7 || digits.length > 15)
    errors.whatsapp = "Enter a valid WhatsApp number with country code, e.g. +234 801 234 5678.";
  if (!d.dob) errors.dob = "Please enter your date of birth.";
  else if (!validDob(d.dob, idrules.lagosToday())) errors.dob = "Enter a real date of birth (not in the future), e.g. 1995-03-27.";
  if (!GENDERS.includes(d.gender)) errors.gender = "Please select your gender.";
  if (!d.mentorshipCode) errors.mentorshipCode = "Enter the mentorship code you were given.";
  else if (!/^[A-Z0-9_-]{4,40}$/.test(d.mentorshipCode))
    errors.mentorshipCode = "That mentorship code is not valid. Check it and try again.";
  if (!d.photo) errors.photo = "Add a passport photograph. Choose a clear photo of your face.";
  return { d, errors };
}

// What the public ID card is allowed to show. Email and WhatsApp number are never included.
function cardFromRow(r) {
  const status = store.STATUSES.includes(r[9]) ? r[9] : "Uncertified";
  const reg = r[0] || "";
  const yy = parseInt((reg.split("/")[1] || ""), 10);
  const issuedISO = idrules.parseIssued(r);
  const expiry = idrules.expiryInfo(status, issuedISO, idrules.lagosToday());
  return {
    regNumber: reg,
    fullName: r[4] || "",
    gender: r[7] || "",
    country: r[2] || "",
    state: r[12] || "",
    countryCode: countryCodes[r[2]] || "",
    programme: r[3] || "",
    admitted: Number.isNaN(yy) ? "" : 2000 + yy,
    issued: issuedISO ? idrules.formatISO(issuedISO) : (r[1] || "").split(",")[0],
    status,
    statusDate: status === "Uncertified" ? "" : r[10] || "",
    ...expiry, // expiryKind, expires, expired, daysLeft
  };
}

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/api/countries", (_req, res) => res.json(countries));
// States / regions for a country. An empty list means the form shows a free-text box instead.
app.get("/api/states", (req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.json(states[clean(req.query.country)] || []);
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

app.post("/api/register", limiter, async (req, res) => {
  // Honeypot field: real people never fill this in.
  if (req.body && req.body.website) return res.json({ regNumber: "ABECFX/00/0000" });

  const { d, errors } = validate(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const card = await exclusive(async () => {
      const rows = await store.readAll();

      if (rows.some((r) => (r[5] || "").toLowerCase() === d.email)) {
        const err = new Error("duplicate");
        err.code = "DUPLICATE";
        throw err;
      }

      // The mentorship code is required, works once, and is checked here (inside the queue) so two
      // people can never use the same code at the same time.
      const free = await store.findFreeCode(d.mentorshipCode);
      if (!free) {
        const err = new Error("badcode");
        err.code = "BADCODE";
        throw err;
      }

      const yy = admissionYY();
      const prefix = `ABECFX/${yy}/`;
      let max = 0;
      for (const r of rows) {
        if ((r[0] || "").startsWith(prefix)) {
          const n = parseInt(r[0].slice(prefix.length), 10);
          if (n > max) max = n;
        }
      }
      const reg = prefix + String(max + 1).padStart(4, "0");

      const row = [
        reg,
        lagosTimestamp(),
        d.country,
        d.programme,
        d.fullName,
        d.email,
        d.whatsapp,
        d.gender,
        free.code,
        "Uncertified",
        "",
        idrules.lagosToday(), // ID Issue Date. An editor can set a new date here to renew an expired ID.
        d.state,
        d.dob, // Date of Birth (column N). Never shown on the public ID card or the dashboard lists.
      ];
      await store.appendRow(row);
      try {
        await store.markCodeUsed(free.sheetRow, reg, lagosTimestamp());
      } catch (e) {
        console.error("Could not mark mentorship code used for", reg, e.message);
      }

      // The student row is saved. Save the photo too, retrying once; if it still fails the
      // registration stands and the ID card shows the student's initials instead.
      try {
        await store.appendPhoto(reg, d.photo);
      } catch (e1) {
        try {
          await store.appendPhoto(reg, d.photo);
        } catch (e2) {
          console.error("Photo save failed for", reg, e2.message);
        }
      }
      return cardFromRow(row);
    });

    // A student who has just registered is signed in straight away.
    const secret = sessionSecret();
    res.json({
      regNumber: card.regNumber,
      fullName: card.fullName,
      card,
      token: secret ? session.sign(card.regNumber, secret) : "",
    });
  } catch (err) {
    if (err.code === "BADCODE") {
      return res.status(400).json({
        errors: { mentorshipCode: "This mentorship code is not valid or has already been used. Ask your mentor for a new one." },
      });
    }
    if (err.code === "DUPLICATE") {
      return res.status(409).json({
        errors: { email: "This email address is already registered with ABECFX." },
      });
    }
    console.error("Registration failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// ---- Public student ID card: look up a student by registration number ----
const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many searches. Please try again in a few minutes." },
});
// Photos are the most sensitive part of a card, so they get a tighter limit.
const photoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests.",
});

function normaliseReg(v) {
  const reg = clean(v, 20).toUpperCase().replace(/\s+/g, "");
  return /^ABECFX\/\d{2}\/\d{4}$/.test(reg) ? reg : null;
}

// Pages: "/" is the student portal, "/register" is the sign-up form, "/status" finds any student's ID.
const page = (name) => (_req, res) => res.sendFile(path.join(__dirname, "public", name));
app.get("/", page("portal.html"));
app.get("/portal", (_req, res) => res.redirect(301, "/"));
app.get("/register", page("register.html"));
app.get("/status", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "status.html"))
);
app.get("/verify", (req, res) =>
  res.redirect(301, "/status" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""))
);

app.get("/api/lookup", lookupLimiter, async (req, res) => {
  const reg = normaliseReg(req.query.reg);
  if (!reg) {
    return res
      .status(400)
      .json({ error: "Enter a valid registration number, e.g. ABECFX/26/0001." });
  }
  try {
    const rows = await store.readCached();
    const r = rows.find((row) => (row[0] || "").toUpperCase() === reg);
    if (!r) {
      return res.status(404).json({ error: "No student found with that registration number." });
    }
    res.json(cardFromRow(r));
  } catch (err) {
    console.error("Lookup failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// ---- Student portal sign-in ----
// The portal is for registered students only. A student signs in with their registration number
// and the email they registered with. Find-a-student (/status, /api/lookup, /api/photo) stays public.
// The signing secret is SESSION_SECRET, or QUIZ_API_KEY when SESSION_SECRET is not set.
function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.QUIZ_API_KEY || "";
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true, // only wrong attempts count
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again in a few minutes." },
});

function studentAuth(req, res, next) {
  res.set("Cache-Control", "no-store");
  const secret = sessionSecret();
  if (!secret) return res.status(503).json({ error: "Student sign-in is not set up on the website yet." });
  const given = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const reg = session.verify(given, secret);
  if (!reg) return res.status(401).json({ error: "Please sign in to your student portal." });
  req.studentReg = reg;
  next();
}

app.post("/api/portal/login", loginLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const secret = sessionSecret();
  if (!secret) return res.status(503).json({ error: "Student sign-in is not set up on the website yet." });
  const reg = normaliseReg((req.body || {}).reg);
  const email = clean((req.body || {}).email, 254).toLowerCase();
  if (!reg || !email) {
    return res.status(400).json({ error: "Enter your registration number and the email you registered with." });
  }
  try {
    const rows = await store.readCached(5000);
    const r = rows.find((row) => (row[0] || "").toUpperCase() === reg);
    // One message for "no such number" and "wrong email", so nobody can probe which numbers exist.
    if (!r || !safeEqual((r[5] || "").toLowerCase(), email)) {
      return res.status(401).json({ error: "That registration number and email do not match our records." });
    }
    res.json({ token: session.sign(reg, secret), card: cardFromRow(r) });
  } catch (err) {
    console.error("Portal sign-in failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// The signed-in student's own card.
app.get("/api/portal/me", lookupLimiter, studentAuth, async (req, res) => {
  try {
    const rows = await store.readCached();
    const r = rows.find((row) => (row[0] || "").toUpperCase() === req.studentReg);
    if (!r) return res.status(401).json({ error: "Please sign in to your student portal." });
    res.json(cardFromRow(r));
  } catch (err) {
    console.error("Portal card failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// ---- Mentorship Handbook (signed-in students only) ----
// The handbook text is served from the website and each student's progress is kept in the sheet tab
// "Handbook Progress". Progress = chapters marked as read / total chapters.
const handbookLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a few minutes." },
});

// Saves for different students never wait on registrations, only on each other.
let progressQueue = Promise.resolve();
function exclusiveProgress(task) {
  const run = progressQueue.then(task, task);
  progressQueue = run.catch(() => {});
  return run;
}

async function progressFor(reg, ttlMs) {
  return progress.summary(progress.parseRead(await store.getProgressCell(reg, ttlMs)));
}

// The student's own progress only (the home page shows it as a small summary).
app.get("/api/handbook/progress", handbookLimiter, studentAuth, async (req, res) => {
  try {
    res.json(await progressFor(req.studentReg));
  } catch (err) {
    console.error("Handbook progress read failed:", err.message);
    res.status(500).json({ error: "We could not load your progress just now. Please try again." });
  }
});

// The handbook chapters plus the student's progress.
app.get("/api/handbook", handbookLimiter, studentAuth, async (req, res) => {
  try {
    let vids = {};
    try { vids = videos.forStudents(await store.readVideos()); } catch (e) { console.error("Chapter videos read failed:", e.message); }
    res.json({ chapters: handbook.CHAPTERS, final: handbook.FINAL, progress: await progressFor(req.studentReg), videos: vids });
  } catch (err) {
    console.error("Handbook read failed:", err.message);
    res.status(500).json({ error: "We could not load the handbook just now. Please try again." });
  }
});

// Mark one chapter as read (or unread). The student comes from the sign-in, never from the page.
app.post("/api/handbook/progress", handbookLimiter, studentAuth, async (req, res) => {
  const b = req.body || {};
  const chapter = clean(b.chapter, 4);
  if (!handbook.IDS.includes(chapter) || typeof b.read !== "boolean") {
    return res.status(400).json({ error: "That chapter could not be found." });
  }
  const reg = req.studentReg;
  try {
    const out = await exclusiveProgress(async () => {
      const students = await store.readCached(5000);
      const stu = students.find((r) => (r[0] || "").toUpperCase() === reg);
      if (!stu) return { status: 401, body: { error: "Please sign in to your student portal." } };
      const current = progress.parseRead(await store.getProgressCell(reg, 0)); // fresh, so two devices never overwrite each other
      const next = progress.setRead(current, chapter, b.read);
      const sum = progress.summary(next);
      if (next.join(",") !== current.join(",")) {
        await store.saveProgress(reg, stu[4] || "", sum.read, sum.total, sum.percent, lagosTimestamp());
      }
      return { status: 200, body: sum };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("Handbook progress save failed:", err.message);
    res.status(500).json({ error: "We could not save your progress just now. Please try again." });
  }
});

// The full handbook PDF (with the workbook pages). It is not in the public folder: a signed-in student
// asks for a link that works for 10 minutes, and the PDF is only served for a valid link.
app.get("/api/handbook/pdf-link", handbookLimiter, studentAuth, (req, res) => {
  res.json({ url: "/handbook.pdf?t=" + encodeURIComponent(pdfLink.sign(req.studentReg, sessionSecret())) });
});

app.get("/handbook.pdf", handbookLimiter, (req, res) => {
  const secret = sessionSecret();
  const reg = secret ? pdfLink.verify(String(req.query.t || ""), secret) : null;
  if (!reg) {
    return res.status(401).type("text/plain").send("This link has expired. Open the Mentorship Handbook in your student portal and try again.");
  }
  res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
  res.type("application/pdf");
  res.sendFile(path.join(__dirname, "private", "handbook.pdf"), {
    headers: { "Content-Disposition": 'inline; filename="ABECFX-Edge-Handbook.pdf"' },
  });
});

app.get("/api/photo", photoLimiter, async (req, res) => {
  const reg = normaliseReg(req.query.reg);
  if (!reg) return res.status(400).end();
  try {
    const b64 = await store.getPhoto(reg);
    if (!b64) return res.status(404).end();
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" });
    res.send(Buffer.from(b64, "base64"));
  } catch (err) {
    console.error("Photo lookup failed:", err.message);
    res.status(500).end();
  }
});

// =====================================================================
// Quiz results (written by the Telegram quiz bot) and the editor dashboard
// =====================================================================
function safeEqual(a, b) {
  const h = (v) => crypto.createHash("sha256").update(String(v)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

// The quiz bot proves who it is with a shared secret in the x-quiz-key header (QUIZ_API_KEY).
function botAuth(req, res, next) {
  const key = process.env.QUIZ_API_KEY;
  if (!key) return res.status(503).json({ error: "The quiz link is not set up on the website yet." });
  if (!safeEqual(req.get("x-quiz-key") || "", key)) return res.status(401).json({ error: "Not allowed." });
  next();
}

// The editor dashboard is protected by one password (ADMIN_PASSWORD), sent as a Bearer token.
// Only failed attempts count toward the rate limit.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});
function adminAuth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return res.status(503).json({ error: "The editor dashboard is not set up yet. Set ADMIN_PASSWORD on Render." });
  const given = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(given, pw)) return res.status(401).json({ error: "Wrong password." });
  next();
}

app.get("/api/config", (_req, res) =>
  res.json({
    quizUrl: process.env.QUIZ_BOT_URL || "",
    quizEmbed: Boolean(QUIZ_APP_ORIGIN && process.env.QUIZ_API_KEY),
  })
);

// Social icons, affiliate link, contact number and About text. Public (they are shown to everyone).
const linksLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.get("/api/links", linksLimiter, async (_req, res) => {
  res.set("Cache-Control", "no-cache");
  try {
    res.json(await store.readLinks());
  } catch (err) {
    console.error("Links read failed:", err.message);
    res.json(links.DEFAULTS); // the sheet is unreachable: show the starting links rather than none
  }
});

// Student portal: open the quiz inside the portal. Returns the quiz address with a short-lived,
// signed pass for this registration number (in the part after #, which is never sent to a server).
app.get("/api/quiz/session", lookupLimiter, studentAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!QUIZ_APP_ORIGIN || !process.env.QUIZ_API_KEY) {
    return res.status(503).json({ error: "The quiz is not available inside the portal yet." });
  }
  const reg = req.studentReg; // taken from the sign-in, never from the page
  try {
    const rows = await store.readCached(5000);
    if (!rows.some((row) => (row[0] || "").toUpperCase() === reg)) {
      return res.status(404).json({ error: "No student found with that registration number." });
    }
    const token = quizToken.sign(reg, process.env.QUIZ_API_KEY);
    res.json({ url: QUIZ_APP_ORIGIN + "/#t=" + token });
  } catch (err) {
    console.error("Quiz session failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// Quiz bot: look up a student's name by registration number (so the quiz can greet and label them).
app.get("/api/quiz/student", botAuth, async (req, res) => {
  const reg = normaliseReg(req.query.reg);
  if (!reg) return res.status(400).json({ error: "Enter a valid registration number, e.g. ABECFX/26/0001." });
  try {
    const rows = await store.readCached(5000);
    const r = rows.find((row) => (row[0] || "").toUpperCase() === reg);
    if (!r) return res.status(404).json({ error: "No student found with that registration number." });
    res.json({ regNumber: r[0], fullName: r[4] || "" });
  } catch (err) {
    console.error("Quiz student lookup failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// Quiz bot: save a finished quiz. The grade is worked out here, not trusted from the bot.
app.post("/api/quiz/result", botAuth, async (req, res) => {
  const b = req.body || {};
  const reg = normaliseReg(b.reg);
  const score = Number(b.score);
  const total = Number(b.total);
  const viaPortal = b.source === "portal"; // sent by the quiz service for a quiz taken inside the portal
  const tgId = viaPortal ? "portal" : clean(b.telegramId, 20);
  if (!reg || !Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 500 || score < 0 || score > total) {
    return res.status(400).json({ error: "That result could not be read." });
  }
  if (!viaPortal && !/^\d{1,20}$/.test(tgId)) return res.status(400).json({ error: "Missing Telegram account." });
  let breakdown = "";
  try { breakdown = JSON.stringify(b.breakdown || {}).slice(0, 3000); } catch (e) { breakdown = ""; }

  try {
    const out = await exclusive(async () => {
      const students = await store.readAll();
      const stu = students.find((r) => (r[0] || "").toUpperCase() === reg);
      if (!stu) return { status: 404, body: { error: "No student found with that registration number." } };

      const quizRows = await store.readQuiz(0);
      const mine = quizRows.filter((q) => q[1] === reg);
      // First Telegram account to take the quiz for a number keeps it, so others can't post results under it.
      // A portal quiz is not tied to a Telegram account, so it cannot be used to get around that link.
      const owner = mine.find((q) => /^\d+$/.test(q[8] || ""));
      if (viaPortal && owner) {
        return { status: 403, body: { error: "This registration number is linked to a Telegram account. Please take the quiz on Telegram, or contact ABECFX." } };
      }
      if (!viaPortal && owner && owner[8] !== tgId) {
        return { status: 403, body: { error: "This registration number is already linked to another Telegram account. Contact ABECFX." } };
      }
      // Ignore an accidental double submit (same result within 2 minutes).
      const prev = mine[mine.length - 1];
      if (prev && Number(prev[3]) === score && Number(prev[4]) === total && prev[10] &&
          Date.now() - Date.parse(prev[10]) < 120000) {
        return { status: 200, body: { ...quizEntry(prev), duplicate: true } };
      }

      const pct = grading.percent(score, total);
      const g = grading.gradeFor(pct);
      const attempt = mine.length + 1;
      await store.appendQuiz([
        lagosTimestamp(), reg, stu[4] || "", score, total, pct, g.grade, attempt, tgId, breakdown, new Date().toISOString(),
      ]);
      return { status: 200, body: { regNumber: reg, fullName: stu[4] || "", score, total, pct, grade: g.grade, label: g.label, attempt } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("Quiz result save failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// Student portal: a student's own quiz results.
app.get("/api/results", lookupLimiter, studentAuth, async (req, res) => {
  const reg = req.studentReg; // a student can only ever see their own results
  try {
    const rows = await store.readQuiz();
    const attempts = rows.filter((q) => q[1] === reg).map(quizEntry).reverse(); // newest first
    const best = attempts.reduce((b, a) => (!b || a.pct > b.pct ? a : b), null);
    res.json({ regNumber: reg, attempts, latest: attempts[0] || null, best, scale: grading.SCALE });
  } catch (err) {
    console.error("Results lookup failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// Editor dashboard
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.get("/api/admin/stats", adminLimiter, adminAuth, async (_req, res) => {
  try {
    const [rows, quiz] = await Promise.all([store.readCached(), store.readQuiz()]);
    res.json({ ...buildStats(rows, quiz, idrules.lagosToday()), generatedAt: lagosTimestamp() });
  } catch (err) {
    console.error("Admin stats failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

// The list behind one dashboard number, e.g. ?kind=gender&value=Female. Editor only; no email or phone.
app.get("/api/admin/drill", adminLimiter, adminAuth, async (req, res) => {
  const kind = clean(req.query.kind, 30);
  const value = clean(req.query.value, 120);
  try {
    const [rows, quiz] = await Promise.all([store.readCached(), store.readQuiz()]);
    const out = drill(rows, quiz, kind, value);
    if (!out) return res.status(400).json({ error: "That statistic could not be found." });
    res.set("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    console.error("Admin drill failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

// The editor reads and changes the site links here.
app.get("/api/admin/links", adminLimiter, adminAuth, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ fields: links.FIELDS, values: await store.readLinks(0) });
  } catch (err) {
    console.error("Admin links read failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

app.put("/api/admin/links", adminLimiter, adminAuth, async (req, res) => {
  const { values, errors } = links.sanitize(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", errors });
  try {
    await store.saveLinks(values);
    res.json({ ok: true, values });
  } catch (err) {
    console.error("Admin links save failed:", err.message);
    res.status(500).json({ error: "Could not save to the sheet. Please try again shortly." });
  }
});

// The editor reads and changes the chapter video addresses here.
app.get("/api/admin/videos", adminLimiter, adminAuth, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ chapters: videos.VIDEO_CHAPTERS, values: await store.readVideos(0) });
  } catch (err) {
    console.error("Admin videos read failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

app.put("/api/admin/videos", adminLimiter, adminAuth, async (req, res) => {
  const { values, errors } = videos.sanitize(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", errors });
  try {
    await store.saveVideos(values);
    res.json({ ok: true, values });
  } catch (err) {
    console.error("Admin videos save failed:", err.message);
    res.status(500).json({ error: "Could not save to the sheet. Please try again shortly." });
  }
});

app.get("/api/admin/results", adminLimiter, adminAuth, async (_req, res) => {
  try {
    const quiz = await store.readQuiz();
    res.json({ results: quiz.map(quizEntry).reverse(), scale: grading.SCALE });
  } catch (err) {
    console.error("Admin results failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

app.listen(PORT, async () => {
  console.log(`ABECFX registration running on port ${PORT}`);
  const ka = require("./keepalive").startKeepAlive();
  if (ka) console.log("Keep-alive pings on:", ka.target);
  try {
    await store.init();
    console.log("Google Sheet ready.");
  } catch (err) {
    console.error("Google Sheet setup problem:", err.message);
  }
});
