const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const countries = require("./countries");
const countryCodes = require("./countryCodes");
const states = require("./states.json"); // country -> list of states / provinces / regions
const store = require("./sheets");
const idrules = require("./idrules");

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

function validate(body) {
  const d = {
    country: clean(body.country),
    state: clean(body.state, 60),
    programme: clean(body.programme),
    fullName: clean(body.fullName),
    email: clean(body.email, 254).toLowerCase(),
    whatsapp: clean(body.whatsapp, 25),
    gender: clean(body.gender),
    promoCode: clean(body.promoCode, 30).toUpperCase(),
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
  if (!GENDERS.includes(d.gender)) errors.gender = "Please select your gender.";
  if (d.promoCode && !/^[A-Z0-9_-]{2,30}$/.test(d.promoCode))
    errors.promoCode = "Promo code can only contain letters, numbers, - and _.";
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
        d.promoCode,
        "Uncertified",
        "",
        idrules.lagosToday(), // ID Issue Date. An editor can set a new date here to renew an expired ID.
        d.state,
      ];
      await store.appendRow(row);

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

    res.json({ regNumber: card.regNumber, fullName: card.fullName, card });
  } catch (err) {
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

app.listen(PORT, async () => {
  console.log(`ABECFX registration running on port ${PORT}`);
  try {
    await store.init();
    console.log("Google Sheet ready.");
  } catch (err) {
    console.error("Google Sheet setup problem:", err.message);
  }
});
