// ID card rules: who gets an expiry date, and the date maths behind it.
// An ID card is one of four kinds: Uncertified, Certified, Staff Member or Alumni Member.
// Certified students are graduates (their ID card says "Certified"). Only Uncertified students have IDs
// that are valid for 2 months from the issue date. Certified, Staff Member and Alumni Member have no expiry.
// "Graduate" is no longer a status of its own. Rows that still hold it in the sheet are read as Certified.
// Old Mentor, Team Member and CEO rows are read as Staff Member.
const LEGACY_STATUS = { graduate: "Certified", mentor: "Staff Member", "team member": "Staff Member", "staff member": "Staff Member", ceo: "Staff Member" };
function normalizeStatus(v) {
  const s = String(v == null ? "" : v).trim();
  return LEGACY_STATUS[s.toLowerCase()] || s;
}

// ---- Which ID cards a person has -------------------------------------------------------------------------------
// A person can hold more than one card. The editor decides which, by what is ticked in the Students sheet:
//   Column J "Status": Uncertified, Certified or Not a student. This is the Student ID card (and the certificate,
//     which only a Certified student has). "Not a student" means no Student ID at all.
//   Column Q "Staff Member": Yes gives a Staff ID card. Works with any column J value, including Not a student.
//   Column R "Alumni Member": Yes gives an Alumni ID card.
// Old rows that still hold Staff Member or Alumni Member in column J keep working as before: that person has only
// that one card (no Student ID) until the editor ticks more.
const TICK = /^(yes|y|true|1|x|tick|ticked|\u2713|\u2714)$/i;
function isTick(v) {
  return TICK.test(String(v == null ? "" : v).trim());
}
// row: one Students row. Returns { student: "Uncertified" | "Certified" | "", staff: boolean, alumni: boolean }.
function idKinds(row) {
  const raw = normalizeStatus(row[9]);
  const legacyStaff = raw === "Staff Member";
  const legacyAlumni = raw === "Alumni Member";
  const none = raw === "Not a student" || legacyStaff || legacyAlumni;
  return {
    student: none ? "" : raw === "Certified" ? "Certified" : "Uncertified",
    staff: isTick(row[16]) || legacyStaff,
    alumni: isTick(row[17]) || legacyAlumni,
  };
}
// The cards a person has, in the order the dropdown lists them: ["student", "alumni", "staff"] (only those they hold).
function idCards(row) {
  const k = idKinds(row);
  return [k.student && "student", k.alumni && "alumni", k.staff && "staff"].filter(Boolean);
}
// The status that one kind of card shows: "Uncertified" / "Certified", "Alumni Member" or "Staff Member".
function kindStatus(kind, row) {
  const k = idKinds(row);
  return kind === "staff" ? "Staff Member" : kind === "alumni" ? "Alumni Member" : k.student || "Uncertified";
}
// The one status that stands for the person where a single status is needed (the portal, the dashboard counts):
// their student standing first, then alumni, then staff.
function primaryStatus(row) {
  const k = idKinds(row);
  return k.student || (k.alumni ? "Alumni Member" : k.staff ? "Staff Member" : "Uncertified");
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
  isTick, idKinds, idCards, kindStatus, primaryStatus,
  normalizeStatus, lagosToday, parseIssued, parseRegistered, addMonthsISO, formatISO, daysBetween, expiryInfo, EXPIRING_STATUSES };
