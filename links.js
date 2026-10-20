// Social links, affiliate link, contact number and "About" text shown on the website.
// The editor changes them on /admin; they are stored on the "Site Links" sheet tab.
// Only https links and a plain phone number are accepted, so a typo (or a bad paste) cannot put a
// script or odd address on the public pages.

const FIELDS = [
  { key: "facebook", label: "Facebook", kind: "url", hint: "https://www.facebook.com/yourpage" },
  { key: "whatsapp", label: "WhatsApp channel or group", kind: "url", hint: "https://whatsapp.com/channel/..." },
  { key: "tiktok", label: "TikTok", kind: "url", hint: "https://www.tiktok.com/@yourname" },
  { key: "x", label: "X (Twitter)", kind: "url", hint: "https://x.com/yourname" },
  { key: "telegram", label: "Telegram", kind: "url", hint: "https://t.me/yourname" },
  { key: "youtube", label: "YouTube", kind: "url", hint: "https://youtube.com/@yourchannel" },
  { key: "communityWhatsapp", label: "WhatsApp community group link", kind: "url", hint: "https://chat.whatsapp.com/...", group: "community" },
  { key: "communityTelegram", label: "Telegram community group link", kind: "url", hint: "https://t.me/+...", group: "community" },
  { key: "deriv", label: "Deriv affiliate link (new users open their account with this)", kind: "url", hint: "https://track.deriv.com/..." },
  { key: "contact", label: "Contact phone / WhatsApp number", kind: "phone", hint: "+234 801 234 5678" },
  { key: "about", label: "About text", kind: "text", hint: "A short paragraph about ABEC-FX", max: 700 },
];

const DEFAULTS = {
  facebook: "https://www.facebook.com/abeconsultfx",
  whatsapp: "https://whatsapp.com/channel/0029VbBeZr96WaKfNHoIDt3O",
  tiktok: "https://vm.tiktok.com/ZS9U586qKTYaw-5t9YY",
  x: "",
  telegram: "https://t.me/Abecfx",
  youtube: "https://youtube.com/@adebassbaseedgeconsultfx?si=zMhsWqnN9_9Jnm9f",
  // Empty on purpose: the student Community page shows a button only once someone with the Community access sets the group.
  communityWhatsapp: "",
  communityTelegram: "",
  deriv: "https://track.deriv.com/_ccXdteH9J4T1hit6RV3zsGNd7ZgqdRLk/1/",
  contact: "+23408162563346",
  about:
    "Adebass Base Edge Consult (ABEC-FX) runs a forex mentorship that teaches students how to trade with discipline, " +
    "risk control and a clear edge. Register to get your student number, ID card and the Mentorship Handbook.",
};

function oneLine(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

// Returns { values, errors }. Missing keys become "" (the icon is then hidden on the site).
function sanitize(input) {
  const src = input && typeof input === "object" ? input : {};
  const values = {};
  const errors = {};
  for (const f of FIELDS) {
    if (!(f.key in src)) { values[f.key] = ""; continue; }
    if (f.kind === "text") {
      values[f.key] = String(src[f.key] == null ? "" : src[f.key]).replace(/\r/g, "").trim().slice(0, f.max || 700);
      continue;
    }
    const v = oneLine(src[f.key], 500);
    if (!v) { values[f.key] = ""; continue; }
    if (f.kind === "phone") {
      const digits = v.replace(/\D/g, "");
      if (!/^\+?[\d\s\-()]+$/.test(v) || digits.length < 7 || digits.length > 15) {
        errors[f.key] = "Enter a phone number with country code, e.g. +234 801 234 5678.";
      } else values[f.key] = v;
      continue;
    }
    let u;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v); } catch (e) { u = null; }
    if (!u || u.protocol !== "https:" || !u.hostname.includes(".")) {
      errors[f.key] = "Enter a full web address starting with https://";
    } else values[f.key] = u.href;
  }
  return { values, errors };
}

// Finds a field by its sheet key, ignoring capitals (the keys are camelCase, e.g. communityWhatsapp).
function fieldFor(key) {
  const k = String(key || "").trim().toLowerCase();
  return FIELDS.find((f) => f.key.toLowerCase() === k) || null;
}

// Rows from the sheet tab: [key, label, value]. Unknown keys are ignored; empty tab -> defaults.
function fromRows(rows) {
  const out = {};
  const seen = new Set();
  for (const r of rows || []) {
    const f = fieldFor(r && r[0]);
    if (f) { seen.add(f.key); out[f.key] = (r[2] == null ? "" : String(r[2])).trim(); }
  }
  const { values } = sanitize(out);
  // a hand-typed value that fails the checks is dropped rather than shown
  for (const f of FIELDS) if (!seen.has(f.key)) values[f.key] = "";
  return values;
}

function toRows(values) {
  return FIELDS.map((f) => [f.key, f.label, values[f.key] || ""]);
}

// The links that are only for signed-in students: kept out of the public /api/links so the group invites are not
// handed to anyone who visits the site.
const STUDENT_ONLY = ["communityWhatsapp", "communityTelegram"];
function publicView(values) {
  const out = { ...values };
  for (const k of STUDENT_ONLY) delete out[k];
  return out;
}

// Which fields belong to which dashboard tab. The "Site links" tab (links access) has everything without a group;
// the "Community" tab (community access) has the two student group links. Each tab saves only its own fields.
const COMMUNITY_KEYS = FIELDS.filter((f) => f.group === "community").map((f) => f.key);
const siteFields = () => FIELDS.filter((f) => f.group !== "community");
const communityFields = () => FIELDS.filter((f) => f.group === "community");
const pick = (values, keys) => Object.fromEntries(keys.map((k) => [k, (values && values[k]) || ""]));
const siteKeys = () => siteFields().map((f) => f.key);

// What the student Community page offers: only the groups someone set on the dashboard (no fallback).
function communityFor(values) {
  const v = values || {};
  return { whatsapp: v.communityWhatsapp || "", telegram: v.communityTelegram || "" };
}

module.exports = {
  fieldFor, FIELDS, DEFAULTS, STUDENT_ONLY, COMMUNITY_KEYS, sanitize, fromRows, toRows, publicView, communityFor,
  siteFields, communityFields, pick, siteKeys,
};
