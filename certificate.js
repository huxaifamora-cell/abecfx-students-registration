// Certificates of completion.
//
// A student gets a certificate once their status is Certified. Everything printed on it comes from here, so the
// public page, the student portal and the dashboard all show the same thing:
//   - the certificate number is the student's own registration number (ABECFX/26/0001), so each one is unique and
//     can be checked by typing it in, or by scanning the QR code on the certificate
//   - the award date is the date the student became Certified (the "Status Date" in the sheet), written as
//     "1st June 2026" everywhere
//   - who signs it (name, title, signature picture), the organisation name and the CAC RC number are set on the
//     dashboard's Certificates tab and appear on every certificate
// Only a Certified student has a certificate. Anyone can look one up by registration number and see it, but only
// the student (signed in) and the dashboard can download it.

const ELIGIBLE = ["Certified"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_INDEX = {};
MONTHS.forEach((m, i) => { MONTH_INDEX[m.toLowerCase()] = i + 1; MONTH_INDEX[m.slice(0, 3).toLowerCase()] = i + 1; });
MONTH_INDEX.sept = 9;

function realDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return String(y) + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

// Reads the dates people type into the sheet: 2026-06-01, 1 June 2026, 1 Jun 2026, June 1, 2026, 01/06/2026
// (day first, like the rest of the site), with or without a time after it. Returns YYYY-MM-DD, or "" when unreadable.
function parseDate(text) {
  const t = String(text == null ? "" : text).trim().replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\b|T)/.exec(t);
  if (m) return realDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})/.exec(t);
  if (m && MONTH_INDEX[m[2].toLowerCase()]) return realDate(+m[3], MONTH_INDEX[m[2].toLowerCase()], +m[1]);
  m = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/.exec(t);
  if (m && MONTH_INDEX[m[1].toLowerCase()]) return realDate(+m[3], MONTH_INDEX[m[1].toLowerCase()], +m[2]);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
  if (m) return realDate(+m[3], +m[2], +m[1]);
  return "";
}

// "2026-06-01" -> "1st June 2026" (the one date style used on every certificate)
function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  return n + (["th", "st", "nd", "rd"][n % 10] || "th");
}
function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? ordinal(Number(m[3])) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : "";
}

const oneLine = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

function isEligible(status) {
  return ELIGIBLE.includes(status);
}

// The certificate for one student, or null when they are not Certified.
// card: what cardFromRow returns. settings: the certificate fields from the site links sheet.
function forCard(card, settings) {
  if (!card || !isEligible(card.status)) return null;
  const s = settings || {};
  const iso = parseDate(card.statusDate);
  // Never print a made-up date: if the sheet's date cannot be read, show what it says, and if it is empty, none.
  const awarded = iso ? longDate(iso) : oneLine(card.statusDate, 40);
  const yy = parseInt(String(card.regNumber || "").split("/")[1], 10);
  const year = iso ? Number(iso.slice(0, 4)) : Number.isNaN(yy) ? "" : 2000 + yy;
  return {
    certNo: card.regNumber,
    regNumber: card.regNumber,
    fullName: oneLine(card.fullName, 80).toUpperCase(),
    awarded,
    awardedISO: iso,
    year,
    org: oneLine(s.certOrg, 60).toUpperCase(),
    rc: oneLine(s.certRc, 20),
    signerName: oneLine(s.certSigner, 60),
    signerTitle: oneLine(s.certSignerTitle, 40),
  };
}

// Setting names the dashboard may change.
const SETTING_KEYS = ["certSigner", "certSignerTitle", "certOrg", "certRc"];

module.exports = { ELIGIBLE, SETTING_KEYS, parseDate, longDate, isEligible, forCard };
