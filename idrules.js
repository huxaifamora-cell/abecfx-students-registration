// ID card rules: who gets an expiry date, and the date maths behind it.
// An ID card is one of four kinds: Uncertified, Certified, Team Member or Alumni Member.
// Certified students are graduates (their ID card says "Certified Graduate"). Only Uncertified students have IDs
// that are valid for 2 months from the issue date. Certified, Team Member and Alumni Member have no expiry.
// "Graduate" is no longer a status of its own. Rows that still hold it in the sheet are read as Certified.
// Old Mentor, Staff Member and CEO rows are read as Team Member.
const LEGACY_STATUS = { graduate: "Certified", mentor: "Team Member", "staff member": "Team Member", ceo: "Team Member" };
function normalizeStatus(v) {
  const s = String(v == null ? "" : v).trim();
  return LEGACY_STATUS[s.toLowerCase()] || s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EXPIRING_STATUSES = ["Uncertified"];
const VALID_MONTHS = 2;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, "0");

// Today's date in Lagos as YYYY-MM-DD.
function lagosToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
}

// Issue date as YYYY-MM-DD. Uses the "ID Issue Date" column when it holds one; otherwise reads the
// "13 Oct 2026, 14:20:11" text in "Registered At", so students registered before this column existed still work.
function parseIssued(row) {
  const explicit = String(row[11] || "").trim();
  if (ISO.test(explicit)) return explicit;
  return parseRegistered(row);
}

// Date the student joined, as YYYY-MM-DD, read from "Registered At" ("13 Oct 2026, 14:20:11").
// Unlike the ID issue date, this never changes when an editor renews an ID.
function parseRegistered(row) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})/.exec(String(row[1] || "").trim());
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}`;
  }
  return "";
}

// Add whole months, keeping the day of month where possible (31 Dec + 2 months = 28/29 Feb).
function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = m - 1 + n;
  const ny = y + Math.floor(t / 12);
  const nm = ((t % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, lastDay))}`;
}

function formatISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000);
}

// expiryKind: "none" (never expires), "date" (has an expiry date), "unknown" (should expire but no issue date).
// An ID is valid through its expiry date and counts as expired from the day after.
function expiryInfo(status, issuedISO, todayISO) {
  if (!EXPIRING_STATUSES.includes(status)) {
    return { expiryKind: "none", expires: "", expired: false, daysLeft: null };
  }
  if (!issuedISO) return { expiryKind: "unknown", expires: "", expired: false, daysLeft: null };
  const exp = addMonthsISO(issuedISO, VALID_MONTHS);
  const daysLeft = daysBetween(todayISO, exp);
  return { expiryKind: "date", expires: formatISO(exp), expired: daysLeft < 0, daysLeft };
}

module.exports = {
  normalizeStatus, lagosToday, parseIssued, parseRegistered, addMonthsISO, formatISO, daysBetween, expiryInfo, EXPIRING_STATUSES };
