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
const quizcodes = require("./quizcodes");
const session = require("./session");
const handbook = require("./handbook-content");
const progress = require("./handbook-progress");
const pdfLink = require("./pdflink");
const links = require("./links");
const videos = require("./videos");
const adminDatabase = require("./admin-database");
const team = require("./team");

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
const PROGRAMMES = ["Forex Course"];
// Students who registered before the rename have "Forex Mentorship" stored; they are shown as "Forex Course".
const programmeName = (v) => (/^forex mentorship$/i.test(String(v || "").trim()) ? "Forex Course" : String(v || ""));
const GENDERS = ["Male", "Female"];

app.set("trust proxy", 1); // Render sits behind a proxy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // national flags on the ID card come from flagcdn.com
        "img-src": ["'self'", "data:", "https://flagcdn.com"],
        // the portal's Download ID card button reads the card's flag and fonts to draw the picture
        "connect-src": ["'self'", "https://flagcdn.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        // the quiz is shown inside the student portal
        "frame-src": ["'self'", "https://www.youtube-nocookie.com", ...(QUIZ_APP_ORIGIN ? [QUIZ_APP_ORIGIN] : [])],
      },
    },
  })
);
app.use(express.json({ limit: "200kb" })); // registration includes a small passport photo and signature
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

// The browser draws or cleans up the signature into a small transparent PNG (a few KB). Accept only that kind of file.
function checkSignature(p) {
  if (typeof p !== "string" || p.length < 200 || p.length > 46000) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p)) return null;
  const head = Buffer.from(p.slice(0, 12), "base64");
  if (!(head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)) return null; // PNG signature
  return p;
}

// The latest date of birth that still meets the age requirement today (6 years ago, as YYYY-MM-DD).
function dobCutoff(todayISO) {
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayISO);
  return t ? String(+t[1] - 6).padStart(4, "0") + "-" + t[2] + "-" + t[3] : todayISO;
}

// Date of birth as YYYY-MM-DD: a real calendar date, not before 1920, and at least 6 years ago.
function validDob(v, todayISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = +m[1], mo = +m[2], da = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return false;
  // A failure gets the same generic message as any other bad date.
  return y >= 1920 && v <= dobCutoff(todayISO);
}

// Someone already registered whose saved date of birth is too recent (younger than 6, or in the future).
function dobTooRecent(dob) {
  const v = String(dob || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v > dobCutoff(idrules.lagosToday());
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
    signature: checkSignature(body.signature),
    terms: body.terms === true,
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
  if (!d.terms) errors.terms = "Please tick the box to agree to the Terms and Conditions.";
  if (!d.signature) errors.signature = "Add your signature. Sign in the box, or upload a picture of it.";
  return { d, errors };
}

// What the public ID card is allowed to show. Email and WhatsApp number are never included.
function cardFromRow(r) {
  const raw = idrules.normalizeStatus(r[9]); // an old "Graduate" row counts as Certified
  const status = store.STATUSES.includes(raw) ? raw : "Uncertified";
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
    programme: programmeName(r[3]),
    admitted: Number.isNaN(yy) ? "" : 2000 + yy,
    issued: issuedISO ? idrules.formatISO(issuedISO) : (r[1] || "").split(",")[0],
    status,
    teamRole: status === "Team Member" ? (r[14] || "").trim() : "",
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
      // The signature is saved the same way: it shows on the student's own ID card.
      try {
        await store.setSignature(reg, d.signature);
      } catch (e1) {
        try {
          await store.setSignature(reg, d.signature);
        } catch (e2) {
          console.error("Signature save failed for", reg, e2.message);
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
        errors: { email: "This email address is already registered with ABEC-FX." },
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

// Never let a photo-tab hiccup stop a student signing in: if it cannot be read, the button just shows.
async function photoUsed(reg) {
  try { return !!(await store.photoChanged(reg)); } catch (e) { return false; }
}

// A student whose date of birth on file is under the age requirement gets a notice in the portal. They may
// correct it ONCE themselves (every correction is kept on the "DOB Changes" tab), after that only a mentor can.
async function dobNotice(row, reg) {
  const dob = String((row && row[13]) || "").trim();
  if (!dobTooRecent(dob)) return null;
  let used = false;
  try { used = (await store.tabRows("dobchanges")).some((x) => String(x.cells[0] || "").trim().toUpperCase() === reg); } catch (e) { /* assume not used */ }
  return { dob, canUpdate: !used };
}

// A mentor typed "Yes" in the student's "Photo To Redo" cell: they must send a new passport photo.
function photoRedo(row) {
  return String((row && row[15]) || "").trim().toLowerCase() === "yes";
}

// True when the student has no signature on file yet (a read problem never nags them).
async function signatureMissing(reg) {
  try { return !(await store.getSignature(reg)); } catch (e) { return false; }
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
    res.json({ token: session.sign(reg, secret), card: cardFromRow(r), photoChanged: await photoUsed(reg), dobNotice: await dobNotice(r, reg), signatureMissing: await signatureMissing(reg), photoRedo: photoRedo(r) });
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
    res.json({ ...cardFromRow(r), photoChanged: await photoUsed(req.studentReg), dobNotice: await dobNotice(r, req.studentReg), signatureMissing: await signatureMissing(req.studentReg), photoRedo: photoRedo(r) });
  } catch (err) {
    console.error("Portal card failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// A signed-in student replaces their own passport photo. The reg number comes from the sign-in token,
// never from the request, so a student can only ever change their own photo.
const photoEditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tries. Please try again in an hour." },
});
const ALREADY_CHANGED = "You have already changed your photo once. A photo can only be changed one time.";
const photoEditing = new Set(); // regs being saved right now, so two quick taps cannot both pass the check
app.put("/api/portal/photo", photoEditLimiter, studentAuth, async (req, res) => {
  const photo = checkPhoto((req.body || {}).photo);
  if (!photo) return res.status(400).json({ error: "That photo could not be used. Choose a clear photo of your face (JPG or PNG)." });
  const reg = req.studentReg;
  if (photoEditing.has(reg)) return res.status(429).json({ error: "Your photo is already being saved." });
  photoEditing.add(reg);
  try {
    // A student a mentor asked for a new photo may send one even if they already used their one change;
    // that upload uses it up again and clears the request.
    const row = (await store.readAll()).find((x) => String(x[0] || "").trim().toUpperCase() === reg);
    const redo = photoRedo(row);
    const result = await store.setPhoto(reg, photo, redo);
    if (result === "already") return res.status(403).json({ error: ALREADY_CHANGED, photoChanged: true });
    if (redo) {
      try {
        await exclusive(async () => {
          const hit = (await store.tabRows("students")).find((x) => String(x.cells[0] || "").trim().toUpperCase() === reg);
          if (hit) await store.writeTabCells("students", hit.n, { 15: "" });
        });
      } catch (e) { console.error("Could not clear the photo request for", reg, e.message); }
    }
    res.json({ ok: true, photoChanged: true });
  } catch (err) {
    console.error("Photo update failed for", reg, err.message);
    res.status(500).json({ error: "We could not save your photo. Please try again shortly." });
  } finally {
    photoEditing.delete(reg);
  }
});

// ---- Handbook (signed-in students only) ----
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
    return res.status(401).type("text/plain").send("This link has expired. Open the Handbook in your student portal and try again.");
  }
  res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
  res.type("application/pdf");
  res.sendFile(path.join(__dirname, "private", "handbook.pdf"), {
    headers: { "Content-Disposition": 'inline; filename="ABEC-FX-Edge-Handbook.pdf"' },
  });
});

// Chapter workbooks (Word files, one per chapter). Like the PDF they live in private/, and a signed-in
// student downloads them with a short-lived signed link.
const WORKBOOK_DIR = path.join(__dirname, "private", "workbooks");
function workbookFile(id) {
  if (!/^\d{2}$/.test(id)) return null;
  try {
    const f = require("fs").readdirSync(WORKBOOK_DIR).find((n) => n.startsWith("Workbook_" + id + "_") && n.endsWith(".docx"));
    return f || null;
  } catch (e) { return null; }
}

app.get("/api/workbooks", handbookLimiter, studentAuth, (_req, res) => {
  const items = handbook.CHAPTERS.map((c) => ({ id: c.id, title: c.title, available: !!workbookFile(c.id) }));
  res.json({ workbooks: items });
});

app.get("/api/workbooks/link", handbookLimiter, studentAuth, (req, res) => {
  const id = String(req.query.id || "");
  if (!workbookFile(id)) return res.status(404).json({ error: "That workbook is not available yet." });
  res.json({ url: "/workbook/" + id + "?t=" + encodeURIComponent(pdfLink.sign(req.studentReg, sessionSecret())) });
});

app.get("/workbook/:id", handbookLimiter, (req, res) => {
  const secret = sessionSecret();
  const reg = secret ? pdfLink.verify(String(req.query.t || ""), secret) : null;
  if (!reg) {
    return res.status(401).type("text/plain").send("This link has expired. Open the Workbook page in your student portal and try again.");
  }
  const file = workbookFile(String(req.params.id));
  if (!file) return res.status(404).type("text/plain").send("That workbook is not available yet.");
  res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
  res.sendFile(path.join(WORKBOOK_DIR, file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="ABEC-FX-' + file.replace(/^Workbook_/, "Workbook-").replace(/_/g, "-") + '"',
    },
  });
});

const signatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120, // the portal reads it each time the card opens; saving is a handful of tries
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tries. Please try again in a while." },
});

const dobLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tries. Please try again in a while." },
});

// A flagged student corrects their own date of birth, once. The reg number comes from the sign-in token.
app.put("/api/portal/dob", dobLimiter, studentAuth, async (req, res) => {
  const dob = clean((req.body || {}).dob, 10);
  const reg = req.studentReg;
  try {
    const out = await exclusive(async () => {
      const hit = (await store.tabRows("students")).find((x) => String(x.cells[0] || "").trim().toUpperCase() === reg);
      if (!hit) return { status: 401, body: { error: "Please sign in to your student portal." } };
      const old = String(hit.cells[13] || "").trim();
      if (!dobTooRecent(old)) return { status: 403, body: { error: "Your date of birth does not need updating." } };
      const used = (await store.tabRows("dobchanges")).some((x) => String(x.cells[0] || "").trim().toUpperCase() === reg);
      if (used) return { status: 403, body: { error: "You have already updated your date of birth once. Please contact your mentor.", canUpdate: false } };
      if (!validDob(dob, idrules.lagosToday())) {
        return { status: 400, body: { error: "That date of birth does not meet our age requirements. Check your documents and enter the date on them." } };
      }
      await store.writeTabCells("students", hit.n, { 13: dob });
      const record = [reg, old, dob, lagosTimestamp()];
      try {
        await store.appendTabRows("dobchanges", [record]);
      } catch (e1) {
        try { await store.appendTabRows("dobchanges", [record]); } catch (e2) { console.error("DOB change record failed for", reg, e2.message); }
      }
      return { status: 200, body: { ok: true } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("DOB update failed for", reg, err.message);
    res.status(500).json({ error: "We could not save your date of birth just now. Please try again." });
  }
});

// A student's own signature. It is only ever sent to that student (the reg number comes from the sign-in
// token), so it does not appear on the public find-a-student card.
app.get("/api/portal/signature", signatureLimiter, studentAuth, async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ signature: (await store.getSignature(req.studentReg)) || "" });
  } catch (err) {
    console.error("Signature read failed for", req.studentReg, err.message);
    res.status(500).json({ error: "We could not load your signature just now." });
  }
});

app.put("/api/portal/signature", signatureLimiter, studentAuth, async (req, res) => {
  const sig = checkSignature((req.body || {}).signature);
  if (!sig) return res.status(400).json({ error: "That signature could not be used. Sign again, or upload a clearer picture." });
  try {
    await store.setSignature(req.studentReg, sig);
    res.json({ ok: true });
  } catch (err) {
    console.error("Signature save failed for", req.studentReg, err.message);
    res.status(500).json({ error: "We could not save your signature just now. Please try again." });
  }
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

// The editor dashboard has named accounts with roles (see team.js):
//   owner      signs in as "owner" with ADMIN_PASSWORD on Render. Always works; cannot be removed.
//   admin      everything, including the team and roles.
//   editor     everything except the team: statistics, site links, chapter videos and the Database.
//   moderator  statistics, student lists and quiz results only (read only).
//   custom     roles an admin creates on the dashboard, with the access they pick (see team.js).
// Signing in returns a token (12 hours). It only says WHO you are; your role is looked up on every request,
// so a role change, a disable or a removal takes effect straight away. Sending ADMIN_PASSWORD itself as the
// Bearer token still works and counts as the owner, so existing bookmarks and scripts keep working.
// Only failed sign-ins (401) count toward the lock-out; a 403 (role not allowed) does not.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});
const teamService = team.create(store, { now: lagosTimestamp });

function requirePerm(perm) {
  return async (req, res, next) => {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return res.status(503).json({ error: "The editor dashboard is not set up yet. Set ADMIN_PASSWORD on Render." });
    const given = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    try {
      let who = null;
      const username = team.verifyToken(given, pw);
      if (username) who = await teamService.lookup(username);
      else if (given && safeEqual(given, pw)) who = { username: team.OWNER, name: "Owner", role: "owner" };
      if (!who) return res.status(401).json({ error: "Please sign in again." });
      const perms = await teamService.permsOf(who.role);
      if (!perms.includes(perm)) return res.status(403).json({ error: "Your role does not allow this." });
      req.admin = { ...who, perms };
      next();
    } catch (err) {
      console.error("Admin sign-in check failed:", err.message);
      res.status(500).json({ error: "Could not reach the sheet. Please try again shortly." });
    }
  };
}
const adminAuth = requirePerm("view"); // statistics, student lists and quiz results
const linksAuth = requirePerm("links"); // site links
const communityAuth = requirePerm("community"); // the student WhatsApp / Telegram groups
const videosAuth = requirePerm("videos"); // chapter videos
const quizCodesAuth = requirePerm("quizcodes"); // one-time quiz codes
const databaseAuth = requirePerm("database"); // the Database tab
const teamAuth = requirePerm("team"); // team accounts and roles

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
    res.json(links.publicView(await store.readLinks())); // the student community links are not part of this
  } catch (err) {
    console.error("Links read failed:", err.message);
    res.json(links.publicView(links.DEFAULTS)); // the sheet is unreachable: show the starting links rather than none
  }
});

// Student portal: the community WhatsApp and Telegram groups. Only for signed-in students, so the invite
// links are not public. Only the groups set on the dashboard's Community tab are offered (no fallback).
app.get("/api/community", linksLimiter, studentAuth, async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(links.communityFor(await store.readLinks()));
  } catch (err) {
    console.error("Community links read failed:", err.message);
    res.json(links.communityFor({}));
  }
});

// ---- One-time quiz codes ----
// The quiz is locked until a student enters a code made by an admin (or a role with the "quizcodes" access).
// A code opens the quiz for that student until their result is saved; then the quiz locks again and the next
// attempt needs a new code. The rules live in quizcodes.js; the codes are kept on the "Quiz Codes" sheet tab.
// The quiz service and the Telegram bot are not in this project, so the website enforces the lock at the points
// it controls: handing out the portal quiz pass (/api/quiz/session) and saving a result (/api/quiz/result).
const quizCodes = quizcodes.create(store, {
  now: lagosTimestamp,
  studentExists: async (reg) => (await store.readCached(5000)).some((r) => (r[0] || "").toUpperCase() === reg),
});
// Optional, off by default: also make the Telegram quiz need a code. Set QUIZ_CODE_FOR_TELEGRAM=on once the bot
// shows the error text it gets back (a 403 with an "error" message) to the student.
const TELEGRAM_NEEDS_CODE = /^(1|on|true|yes)$/i.test(process.env.QUIZ_CODE_FOR_TELEGRAM || "");
const QUIZ_LOCKED_MESSAGE = "The quiz is locked. Enter a one-time quiz code from your mentor or ABEC-FX to take it.";

// A wrong code counts against the student (not their network, which many students share). Only failures count.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.studentReg,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many wrong codes. Please wait a few minutes and try again." },
});

// Student portal: enter a quiz code to open the quiz.
app.post("/api/quiz/unlock", studentAuth, unlockLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const reg = req.studentReg; // taken from the sign-in, never from the page
  try {
    const rows = await store.readCached(5000);
    if (!rows.some((row) => (row[0] || "").toUpperCase() === reg)) {
      return res.status(404).json({ error: "No student found with that registration number." });
    }
    res.json(await quizCodes.redeem((req.body || {}).code, reg));
  } catch (err) {
    if (err instanceof quizcodes.QuizCodeError) return res.status(err.status).json({ error: err.message });
    console.error("Quiz unlock failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// Student portal: open the quiz inside the portal. Returns the quiz address with a short-lived,
// signed pass for this registration number (in the part after #, which is never sent to a server).
// Only while the student's quiz is unlocked with a code.
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
    if (!(await quizCodes.accessFor(reg, { fresh: true })).unlocked) {
      return res.status(403).json({ error: QUIZ_LOCKED_MESSAGE, locked: true });
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
    if (TELEGRAM_NEEDS_CODE && !(await quizCodes.accessFor(reg, { fresh: true })).unlocked) {
      return res.status(403).json({ error: QUIZ_LOCKED_MESSAGE + " Get your code, enter it in your student portal, then come back here.", locked: true });
    }
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
        return { status: 403, body: { error: "This registration number is linked to a Telegram account. Please take the quiz on Telegram, or contact ABEC-FX." } };
      }
      if (!viaPortal && owner && owner[8] !== tgId) {
        return { status: 403, body: { error: "This registration number is already linked to another Telegram account. Contact ABEC-FX." } };
      }
      // Ignore an accidental double submit (same result within 2 minutes).
      const prev = mine[mine.length - 1];
      if (prev && Number(prev[3]) === score && Number(prev[4]) === total && prev[10] &&
          Date.now() - Date.parse(prev[10]) < 120000) {
        return { status: 200, body: { ...quizEntry(prev), duplicate: true } };
      }

      // The quiz must have been unlocked with a code. This is what makes a code work for ONE quiz: even if a
      // student keeps an old quiz page open and tries again, the second result is refused here.
      // (Checked after the double-submit rule above, so sending the same finished result twice is still fine.)
      const unlocked = (await quizCodes.accessFor(reg, { fresh: true })).unlocked;
      if (!unlocked && (viaPortal || TELEGRAM_NEEDS_CODE)) {
        return { status: 403, body: { error: QUIZ_LOCKED_MESSAGE, locked: true } };
      }

      const pct = grading.percent(score, total);
      const g = grading.gradeFor(pct);
      const attempt = mine.length + 1;
      await store.appendQuiz([
        lagosTimestamp(), reg, stu[4] || "", score, total, pct, g.grade, attempt, tgId, breakdown, new Date().toISOString(),
      ]);
      // The result is saved, so the code is spent and the quiz locks again. Saved first on purpose: a failure
      // here must never cost a student their result. One retry, then it is logged for an admin to cancel by hand.
      if (unlocked) {
        try {
          await quizCodes.complete(reg);
        } catch (e1) {
          try {
            await quizCodes.complete(reg);
          } catch (e2) {
            console.error("Could not close the quiz code for", reg, e2.message);
          }
        }
      }
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
    const [rows, access] = await Promise.all([store.readQuiz(), quizCodes.accessFor(reg)]);
    const attempts = rows.filter((q) => q[1] === reg).map(quizEntry).reverse(); // newest first
    const best = attempts.reduce((b, a) => (!b || a.pct > b.pct ? a : b), null);
    // `unlocked`: has this student entered a quiz code that is still open? (The portal shows the code box when not.)
    res.json({ regNumber: reg, attempts, latest: attempts[0] || null, best, scale: grading.SCALE, unlocked: access.unlocked });
  } catch (err) {
    console.error("Results lookup failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again shortly." });
  }
});

// Editor dashboard
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// ---- Team accounts ----
const teamLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});
async function meOf(who) {
  const info = who.role === "owner" ? { label: team.ROLES.owner.label, perms: team.ROLES.owner.perms } : await teamService.roleInfo(who.role);
  return { username: who.username, name: who.name, role: who.role, roleLabel: info ? info.label : who.role, perms: info ? info.perms : [], canChangePassword: who.role !== "owner" };
}

function teamRoute(handler) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof team.TeamError) {
        return res.status(err.status).json({ error: err.message, ...(err.fields ? { errors: err.fields } : {}) });
      }
      console.error("Team request failed:", err.message);
      res.status(500).json({ error: "Could not reach the sheet. Please try again shortly." });
    }
  };
}

// The sign-in page's "Sign in as" drop-down: role names only (no usernames).
app.get("/api/admin/login-users", adminLimiter, teamRoute(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await teamService.loginChoices());
}));

app.post("/api/admin/login", teamLoginLimiter, teamRoute(async (req, res) => {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new team.TeamError(503, "The editor dashboard is not set up yet. Set ADMIN_PASSWORD on Render.");
  const b = req.body || {};
  const given = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  let who = null;
  if (b.role) {
    // Signing in as a role: the role name is the username. Try the accounts with that role.
    let lastErr = null;
    for (const name of await teamService.loginNames(clean(b.role, 40))) {
      try { who = await teamService.login(name, given, pw, safeEqual); break; } catch (e) { lastErr = e; if (!(e instanceof team.TeamError) || e.status !== 401) throw e; }
    }
    if (!who) throw lastErr || new team.TeamError(401, "Wrong username or password.");
  } else {
    who = await teamService.login(clean(b.username, 40), given, pw, safeEqual);
  }
  res.json({ token: team.signToken(who.username, pw), me: await meOf(who) });
}));

app.get("/api/admin/me", adminLimiter, adminAuth, teamRoute(async (req, res) => res.json(await meOf(req.admin))));

app.post("/api/admin/me/password", adminLimiter, adminAuth, teamRoute(async (req, res) => {
  if (req.admin.role === "owner") throw new team.TeamError(400, "The owner password is set as ADMIN_PASSWORD on Render.");
  const b = req.body || {};
  res.json(await teamService.changeOwnPassword(req.admin.username, b.current, b.next));
}));

// ID cards: an admin (anyone with the "team" access) can find any student or team member and see their card.
// The cards carry the same details as the public ID card (never email or WhatsApp number).
app.get("/api/admin/id-cards", adminLimiter, teamAuth, async (req, res) => {
  try {
    const q = clean(req.query.q, 80).toLowerCase();
    const rows = (await store.readCached()).filter((r) => r && r[0]);
    const hit = q ? rows.filter((r) => [r[0], r[4], r[2], r[9], r[12]].some((v) => String(v || "").toLowerCase().includes(q))) : rows;
    const limit = 40;
    // newest first (the sheet is in registration order)
    const cards = hit.slice().reverse().slice(0, limit).map(cardFromRow);
    res.json({ total: hit.length, shown: cards.length, cards });
  } catch (err) {
    console.error("ID card list failed:", err.message);
    res.status(500).json({ error: "Could not read the student list. Please try again shortly." });
  }
});

// The signature shown on a student's card in the admin ID cards view (same access as the cards themselves).
app.get("/api/admin/id-cards/signature", adminLimiter, teamAuth, async (req, res) => {
  const reg = normaliseReg(req.query.reg);
  if (!reg) return res.status(400).json({ error: "Not a valid registration number." });
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ signature: (await store.getSignature(reg)) || "" });
  } catch (err) {
    console.error("Admin signature read failed for", reg, err.message);
    res.status(500).json({ error: "Could not load the signature." });
  }
});

app.get("/api/admin/team", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json({ members: await teamService.members(), roles: await teamService.roles(req.admin), permissions: team.PERMS });
}));

// Roles: create one and pick its access; change a custom role's name or access; remove a custom role nobody uses.
app.post("/api/admin/roles", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json(await teamService.addRole(req.body, req.admin));
}));

app.put("/api/admin/roles/:key", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json(await teamService.updateRole(String(req.params.key).toLowerCase(), req.body, req.admin));
}));

app.post("/api/admin/roles/:key/delete", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json(await teamService.removeRole(String(req.params.key).toLowerCase(), req.admin));
}));

app.post("/api/admin/team", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json(await teamService.add(req.body, req.admin));
}));

app.put("/api/admin/team/:username", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json(await teamService.update(req.params.username, req.body, req.admin));
}));

app.post("/api/admin/team/:username/delete", adminLimiter, teamAuth, teamRoute(async (req, res) => {
  res.json(await teamService.remove(req.params.username, req.admin));
}));

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
app.get("/api/admin/links", adminLimiter, linksAuth, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ fields: links.siteFields(), values: links.pick(await store.readLinks(0), links.siteKeys()) });
  } catch (err) {
    console.error("Admin links read failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

// Site links never touch the student community groups: those belong to the Community tab and its own access.
app.put("/api/admin/links", adminLimiter, linksAuth, async (req, res) => {
  const body = { ...(req.body && typeof req.body === "object" ? req.body : {}) };
  links.COMMUNITY_KEYS.forEach((k) => delete body[k]);
  const { values, errors } = links.sanitize(body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", errors });
  try {
    const current = await store.readLinks(0);
    const merged = { ...values, ...links.pick(current, links.COMMUNITY_KEYS) };
    await store.saveLinks(merged);
    res.json({ ok: true, values: links.pick(merged, links.siteKeys()) });
  } catch (err) {
    console.error("Admin links save failed:", err.message);
    res.status(500).json({ error: "Could not save to the sheet. Please try again shortly." });
  }
});

// The student community: the WhatsApp and Telegram groups the portal's Community page opens.
// Anyone whose role has the "community" access can set them; it does not give access to the other site links.
app.get("/api/admin/community", adminLimiter, communityAuth, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ fields: links.communityFields(), values: links.pick(await store.readLinks(0), links.COMMUNITY_KEYS) });
  } catch (err) {
    console.error("Admin community read failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

app.put("/api/admin/community", adminLimiter, communityAuth, async (req, res) => {
  const src = req.body && typeof req.body === "object" ? req.body : {};
  const body = {};
  links.COMMUNITY_KEYS.forEach((k) => { body[k] = src[k]; });
  const { values, errors } = links.sanitize(body);
  const mine = Object.fromEntries(Object.entries(errors).filter(([k]) => links.COMMUNITY_KEYS.includes(k)));
  if (Object.keys(mine).length) return res.status(400).json({ error: "Please fix the highlighted fields.", errors: mine });
  try {
    const current = await store.readLinks(0);
    const merged = { ...current, ...links.pick(values, links.COMMUNITY_KEYS) };
    await store.saveLinks(merged);
    res.json({ ok: true, values: links.pick(merged, links.COMMUNITY_KEYS) });
  } catch (err) {
    console.error("Admin community save failed:", err.message);
    res.status(500).json({ error: "Could not save to the sheet. Please try again shortly." });
  }
});

// The editor reads and changes the chapter video addresses here.
app.get("/api/admin/videos", adminLimiter, videosAuth, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ chapters: videos.VIDEO_CHAPTERS, values: await store.readVideos(0) });
  } catch (err) {
    console.error("Admin videos read failed:", err.message);
    res.status(500).json({ error: "Could not read the sheet. Please try again shortly." });
  }
});

app.put("/api/admin/videos", adminLimiter, videosAuth, async (req, res) => {
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

// ---- Quiz codes: make, list and cancel the one-time codes (admin, or any role given the "quizcodes" access) ----
function quizCodeRoute(handler) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof quizcodes.QuizCodeError) {
        return res.status(err.status).json({ error: err.message, ...(err.fields ? { errors: err.fields } : {}) });
      }
      console.error("Quiz codes request failed:", err.message);
      res.status(500).json({ error: "Could not reach the sheet. Please try again shortly." });
    }
  };
}

app.get("/api/admin/quiz-codes", adminLimiter, quizCodesAuth, quizCodeRoute(async (_req, res) => {
  const [codes, students] = await Promise.all([quizCodes.list(), store.readCached(5000)]);
  const names = new Map(students.map((r) => [(r[0] || "").toUpperCase(), r[4] || ""]));
  res.json({
    codes: codes.map((c) => ({ ...c, usedByName: names.get(c.usedBy) || "", forName: names.get(c.forReg) || "" })),
    max: quizcodes.MAX_AT_ONCE,
  });
}));

app.post("/api/admin/quiz-codes", adminLimiter, quizCodesAuth, quizCodeRoute(async (req, res) => {
  const out = await quizCodes.generate(req.body, req.admin);
  const names = new Map((await store.readCached(5000)).map((r) => [(r[0] || "").toUpperCase(), r[4] || ""]));
  res.json({ codes: out.codes.map((c) => ({ ...c, forName: names.get(c.forReg) || "" })) });
}));

app.post("/api/admin/quiz-codes/revoke", adminLimiter, quizCodesAuth, quizCodeRoute(async (req, res) => {
  res.json(await quizCodes.revoke((req.body || {}).code, req.admin));
}));

// ---- Database view: the editor browses, adds, edits and deletes records from /admin ----
// What may be changed, and the checks on every change, live in admin-database.js. Only a WRONG password counts
// toward the lock-out here (a mistyped value must not lock the editor out of editing); a second limiter just
// stops floods, because every call here reads from Google.
const database = adminDatabase.create(store);
app.use(
  "/api/admin/database",
  rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please wait a moment." } }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode !== 401,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again in a few minutes." },
  }),
  databaseAuth
);

function databaseRoute(handler) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof adminDatabase.AdminError) {
        return res.status(err.status).json({ error: err.message, ...(err.fields ? { errors: err.fields } : {}) });
      }
      console.error("Admin database failed:", err.message);
      res.status(500).json({ error: "Could not reach the sheet. Please try again shortly." });
    }
  };
}
// Changes wait their turn with registrations (or handbook saves), so a row number never moves under a running save.
const inQueue = (key, task) => (key === "progress" ? exclusiveProgress : exclusive)(task);

app.get("/api/admin/database", databaseRoute(async (_req, res) => res.json(database.meta())));

app.get("/api/admin/database/:key", databaseRoute(async (req, res) => res.json(await database.read(req.params.key))));

app.put("/api/admin/database/:key/rows/:n", databaseRoute(async (req, res) => {
  const b = req.body || {};
  res.json(await inQueue(req.params.key, () => database.update(req.params.key, req.params.n, b.original, b.values)));
}));

app.post("/api/admin/database/:key/rows", databaseRoute(async (req, res) => {
  res.json(await inQueue(req.params.key, () => database.create(req.params.key, req.body)));
}));

app.post("/api/admin/database/:key/rows/:n/delete", databaseRoute(async (req, res) => {
  res.json(await inQueue(req.params.key, () => database.remove(req.params.key, req.params.n, (req.body || {}).original)));
}));

app.listen(PORT, async () => {
  console.log(`ABEC-FX registration running on port ${PORT}`);
  const ka = require("./keepalive").startKeepAlive();
  if (ka) console.log("Keep-alive pings on:", ka.target);
  try {
    await store.init();
    console.log("Google Sheet ready.");
  } catch (err) {
    console.error("Google Sheet setup problem:", err.message);
  }
});
