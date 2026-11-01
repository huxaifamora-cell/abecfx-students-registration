// Thin Google Sheets storage layer (service account + REST API).
const { JWT } = require("google-auth-library");
const links = require("./links");
const videos = require("./videos");
const staff = require("./staff");
const quizcodes = require("./quizcodes");
const attendance = require("./attendance");
const bot = require("./bot");
const fund = require("./fund");
const copy = require("./copy");
const hosting = require("./hosting");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || "Students";
const PHOTO_TAB = process.env.GOOGLE_PHOTO_TAB || "Photos";
const SIG_TAB = process.env.GOOGLE_SIGNATURE_TAB || "Signatures";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

// Column J. "Not a student" means no Student ID (a staff or alumni member who never took the course).
// Staff and Alumni are ticked in columns Q and R, so one person can be a student and also a staff member.
const STATUSES = [
  "Uncertified",
  "Certified",
  "Not a student",
];

const HEADERS = [
  "Reg Number",
  "Registered At (Lagos)",
  "Country",
  "Programme Type",
  "Full Name",
  "Email",
  "WhatsApp Number",
  "Gender",
  "Mentorship Code",
  "Status",
  "Status Date",
  "ID Issue Date",
  "State / Region",
  "Date of Birth",
  "Staff Role",
  "Photo To Redo (type Yes: the student must send a new passport photo)",
  "Staff Member (Yes gives a Staff ID card)",
  "Alumni Member (Yes gives an Alumni ID card)",
];
const LAST_COL = "R";
const DOB_TAB = process.env.GOOGLE_DOB_TAB || "DOB Changes";
const DOB_HEADERS = ["Reg Number", "Old Date of Birth", "New Date of Birth", "Changed At (Lagos)"];
const SIG_HEADERS = ["Reg Number", "Signature (base64 PNG - do not edit)"];
const PHOTO_HEADERS = ["Reg Number", "Photo (base64 JPEG - do not edit)", "Changed by student (date; clear this cell to allow one more change)"];
const QUIZ_TAB = process.env.GOOGLE_QUIZ_TAB || "Quiz Results";
const QUIZ_HEADERS = [
  "Submitted At (Lagos)",
  "Reg Number",
  "Full Name",
  "Score",
  "Total Questions",
  "Percent",
  "Grade",
  "Attempt",
  "Telegram ID",
  "Breakdown (JSON)",
  "Submitted (UTC)",
];
const QUIZ_LAST_COL = "K";

// Mentorship codes: one row per code. The editor types new codes into column A; a code works once.
const CODE_TAB = process.env.GOOGLE_CODE_TAB || "Mentorship Codes";
const CODE_HEADERS = ["Mentorship Code", "Created At (Lagos)", "Used By (Reg Number)", "Used At (Lagos)"];
const CODE_LAST_COL = "D";

// Quiz codes: one row per one-time code that unlocks the quiz for a student (see quizcodes.js for the rules).
// Managed from the dashboard's "Quiz codes" tab, never through the Database view, so only roles given the
// "quizcodes" access can make codes.
const QUIZCODE_TAB = process.env.GOOGLE_QUIZCODE_TAB || "Quiz Codes";
const QUIZCODE_HEADERS = quizcodes.HEADERS;
const QUIZCODE_LAST_COL = "I";

// Live-class attendance (see attendance.js): one row per class, and rows of minutes each student was present.
// Managed from the dashboard's "Attendance" tab, never through the Database view.
const CLASS_TAB = process.env.GOOGLE_CLASS_TAB || "Classes";
const CLASS_HEADERS = attendance.CLASS_HEADERS;
const CLASS_LAST_COL = "H";
const ATT_TAB = process.env.GOOGLE_ATTENDANCE_TAB || "Attendance";
const ATT_HEADERS = attendance.ATT_HEADERS;
const ATT_LAST_COL = "D";

// Bot trading (see bot.js): each member's connection key hash and risk settings, every order, and every closed trade.
// Managed from the portal's "Bot trading" page, never through the Database view.
const BOTACC_TAB = process.env.GOOGLE_BOTACCOUNT_TAB || "Bot Accounts";
const BOTACC_HEADERS = bot.ACCOUNT_HEADERS;
const BOTACC_LAST_COL = "M";
const BOTORD_TAB = process.env.GOOGLE_BOTORDER_TAB || "Bot Orders";
const BOTORD_HEADERS = bot.ORDER_HEADERS;
const BOTORD_LAST_COL = "L";
const BOTTRD_TAB = process.env.GOOGLE_BOTTRADE_TAB || "Bot Trades";
const BOTTRD_HEADERS = bot.TRADE_HEADERS;
const BOTTRD_LAST_COL = "N";

// Funds (see fund.js): the ledger of every deposit, sponsorship, trading result and withdrawal, and the members'
// withdrawal requests. Managed from the portal's "Funds" page and the dashboard's "Funds" tab, never the Database view,
// because the ledger is replayed from the top to work out every balance.
const FUNDLED_TAB = process.env.GOOGLE_FUNDLEDGER_TAB || "Fund Ledger";
const FUNDLED_HEADERS = fund.LEDGER_HEADERS;
const FUNDLED_LAST_COL = "N";
const FUNDWD_TAB = process.env.GOOGLE_FUNDWITHDRAWAL_TAB || "Fund Withdrawals";
const FUNDWD_HEADERS = fund.WITHDRAWAL_HEADERS;
const FUNDWD_LAST_COL = "N";
// Copy trading (see copy.js): the masters (staff and mentors), who follows whom with what settings, every trade of every
// master, and every copy order sent to a follower. Managed from the portal's "Copy trading" page, never through the Database view.
// An admin can set Active to No on a master row to block that master, or edit a follower's row by hand.
const COPYMASTER_TAB = process.env.GOOGLE_COPYMASTER_TAB || "Copy Masters";
const COPYMASTER_HEADERS = copy.MASTER_HEADERS;
const COPYMASTER_LAST_COL = "K";
const COPYFOLLOW_TAB = process.env.GOOGLE_COPYFOLLOW_TAB || "Copy Follows";
const COPYFOLLOW_HEADERS = copy.FOLLOW_HEADERS;
const COPYFOLLOW_LAST_COL = "I";
const COPYTRADE_TAB = process.env.GOOGLE_COPYTRADE_TAB || "Copy Master Trades";
const COPYTRADE_HEADERS = copy.TRADE_HEADERS;
const COPYTRADE_LAST_COL = "O";
const COPYORDER_TAB = process.env.GOOGLE_COPYORDER_TAB || "Copy Orders";
const COPYORDER_HEADERS = copy.ORDER_HEADERS;
const COPYORDER_LAST_COL = "N";

// Member hosting requests (see hosting.js): who asked for their connector to run on the ABEC-FX VPS, and how far it has got.
// No password is ever kept here. Managed from the dashboard's "VPS hosting" tab and the portal's Copy trading page.
const HOSTREQ_TAB = process.env.GOOGLE_HOSTING_TAB || "Hosting Requests";
const HOSTREQ_HEADERS = hosting.HEADERS;
const HOSTREQ_LAST_COL = "L";

// Handbook progress: one row per student (reg number, name, chapters read, count, total, percent, updated).
const PROG_TAB = process.env.GOOGLE_PROGRESS_TAB || "Handbook Progress";
const PROG_HEADERS = ["Reg Number", "Full Name", "Chapters Read", "Chapters Read (count)", "Total Chapters", "Percent", "Updated At (Lagos)"];
const PROG_LAST_COL = "G";

// Site links (social icons, affiliate link, contact, About text): one row per setting, edited from /admin.
const LINKS_TAB = process.env.GOOGLE_LINKS_TAB || "Site Links";
const LINKS_HEADERS = ["Key (do not edit)", "What it is", "Value"];
const LINKS_LAST_COL = "C";

// Chapter videos: one row per handbook chapter 01-12 with its YouTube address, edited from /admin.
const VIDEO_TAB = process.env.GOOGLE_VIDEO_TAB || "Chapter Videos";
const VIDEO_HEADERS = ["Chapter", "Chapter title", "YouTube video address"];
const VIDEO_LAST_COL = "C";

// Dashboard staff (named admin / moderator accounts). Holds password HASHES only; never listed in the Database view.
const STAFF_TAB = process.env.GOOGLE_STAFF_TAB || process.env.GOOGLE_TEAM_TAB || "Staff";
const STAFF_HEADERS = staff.HEADERS;
const STAFF_LAST_COL = "G";

// Custom roles (a name and the access it gives). Built-in roles live in staff.js. No secrets here.
const ROLES_TAB = process.env.GOOGLE_ROLES_TAB || "Roles";
const ROLES_HEADERS = staff.ROLE_HEADERS;
const ROLES_LAST_COL = "E";

function loadCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const c = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return { email: c.client_email, key: c.private_key };
  }
  return {
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  };
}

let client;
function getClient() {
  if (client) return client;
  const { email, key } = loadCredentials();
  if (!SHEET_ID || !email || !key) {
    throw new Error(
      "Google Sheets is not configured. Set GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }
  client = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return client;
}

// Google allows a limited number of Sheets reads per minute. A 429 means the request was refused (not run),
// so it is safe to retry after a short pause, for reads and writes alike.
async function call(path, options = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await getClient().request({
        url: `${API}/${SHEET_ID}${path}`,
        ...options,
      });
      return res.data;
    } catch (err) {
      const status = Number((err.response && err.response.status) || err.code);
      if (status !== 429 || attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
    }
  }
}

// One shared read at a time per tab: if ten requests arrive while the cache is stale, only one goes to Google.
const inflight = new Map();
function once(key, fn) {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)));
  return inflight.get(key);
}
// Never let a caller ask for fresher data than this. Our own writes still refresh at once (they reset the cache);
// only edits made by hand in the Google Sheet take up to this long to show.
const MIN_TTL_MS = Number(process.env.SHEETS_MIN_TTL_MS) || 20000;

const range = (r, tab = TAB) => encodeURIComponent(`${tab}!${r}`);

async function findTab(title) {
  const meta = await call("?fields=sheets.properties(sheetId,title)");
  return (meta.sheets || []).map((s) => s.properties).find((p) => p.title === title);
}

async function ensureTab(title) {
  let tab = await findTab(title);
  if (!tab) {
    await call(":batchUpdate", {
      method: "POST",
      data: { requests: [{ addSheet: { properties: { title } } }] },
    });
    tab = await findTab(title);
  }
  return tab;
}

async function ensureHeaders(tab, headers, lastCol) {
  const head = await call(`/values/${range(`A1:${lastCol}1`, tab)}`);
  const current = (head.values && head.values[0]) || [];
  if (headers.some((h, i) => current[i] !== h)) {
    await call(`/values/${range(`A1:${lastCol}1`, tab)}?valueInputOption=RAW`, {
      method: "PUT",
      data: { values: [headers] },
    });
  }
}

// Make sure both tabs exist with headers, and the Status column is a dropdown.
// The Staff tab used to be called "Team". An existing one is renamed so the accounts (and their password hashes) carry over.
async function renameLegacyStaffTab() {
  if (STAFF_TAB !== "Staff" || (await findTab("Staff"))) return;
  const old = await findTab("Team");
  if (!old) return;
  await call(":batchUpdate", {
    method: "POST",
    data: { requests: [{ updateSheetProperties: { properties: { sheetId: old.sheetId, title: "Staff" }, fields: "title" } }] },
  });
}

async function init() {
  const students = await ensureTab(TAB);
  await ensureHeaders(TAB, HEADERS, LAST_COL);

  const photos = await ensureTab(PHOTO_TAB);
  await ensureHeaders(PHOTO_TAB, PHOTO_HEADERS, "C");

  await ensureTab(SIG_TAB);
  await ensureHeaders(SIG_TAB, SIG_HEADERS, "B");

  await ensureTab(DOB_TAB);
  await ensureHeaders(DOB_TAB, DOB_HEADERS, "D");

  await ensureTab(QUIZ_TAB);
  await ensureHeaders(QUIZ_TAB, QUIZ_HEADERS, QUIZ_LAST_COL);

  await ensureTab(CODE_TAB);
  await ensureHeaders(CODE_TAB, CODE_HEADERS, CODE_LAST_COL);

  const quizCodes = await ensureTab(QUIZCODE_TAB);
  await ensureHeaders(QUIZCODE_TAB, QUIZCODE_HEADERS, QUIZCODE_LAST_COL);

  await ensureTab(CLASS_TAB);
  await ensureHeaders(CLASS_TAB, CLASS_HEADERS, CLASS_LAST_COL);
  await ensureTab(ATT_TAB);
  await ensureHeaders(ATT_TAB, ATT_HEADERS, ATT_LAST_COL);

  await ensureTab(BOTACC_TAB);
  await ensureHeaders(BOTACC_TAB, BOTACC_HEADERS, BOTACC_LAST_COL);
  await ensureTab(BOTORD_TAB);
  await ensureHeaders(BOTORD_TAB, BOTORD_HEADERS, BOTORD_LAST_COL);
  await ensureTab(BOTTRD_TAB);
  await ensureHeaders(BOTTRD_TAB, BOTTRD_HEADERS, BOTTRD_LAST_COL);
  await ensureTab(COPYMASTER_TAB);
  await ensureHeaders(COPYMASTER_TAB, COPYMASTER_HEADERS, COPYMASTER_LAST_COL);
  await ensureTab(COPYFOLLOW_TAB);
  await ensureHeaders(COPYFOLLOW_TAB, COPYFOLLOW_HEADERS, COPYFOLLOW_LAST_COL);
  await ensureTab(COPYTRADE_TAB);
  await ensureHeaders(COPYTRADE_TAB, COPYTRADE_HEADERS, COPYTRADE_LAST_COL);
  await ensureTab(COPYORDER_TAB);
  await ensureHeaders(COPYORDER_TAB, COPYORDER_HEADERS, COPYORDER_LAST_COL);
  await ensureTab(HOSTREQ_TAB);
  await ensureHeaders(HOSTREQ_TAB, HOSTREQ_HEADERS, HOSTREQ_LAST_COL);

  await ensureTab(FUNDLED_TAB);
  await ensureHeaders(FUNDLED_TAB, FUNDLED_HEADERS, FUNDLED_LAST_COL);
  await ensureTab(FUNDWD_TAB);
  await ensureHeaders(FUNDWD_TAB, FUNDWD_HEADERS, FUNDWD_LAST_COL);

  await ensureTab(PROG_TAB);
  await ensureHeaders(PROG_TAB, PROG_HEADERS, PROG_LAST_COL);

  await ensureTab(LINKS_TAB);
  await ensureHeaders(LINKS_TAB, LINKS_HEADERS, LINKS_LAST_COL);
  // First run only: fill the tab with the starting links. After that the sheet / dashboard is the truth.
  const existing = await call(`/values/${range(`A2:A`, LINKS_TAB)}`);
  if (!(existing.values && existing.values.length)) {
    await call(`/values/${range(`A2:${LINKS_LAST_COL}${links.FIELDS.length + 1}`, LINKS_TAB)}?valueInputOption=RAW`, {
      method: "PUT",
      data: { values: links.toRows(links.DEFAULTS) },
    });
  }

  // Sites set up before a link existed: add the missing rows (empty or default), never touching the others.
  if (existing.values && existing.values.length) {
    const have = new Set(existing.values.map((r) => String((r && r[0]) || "").trim().toLowerCase()));
    const missing = links.toRows(links.DEFAULTS).filter((r) => !have.has(r[0].toLowerCase()));
    if (missing.length) {
      await call(`/values/${range(`A:${LINKS_LAST_COL}`, LINKS_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        data: { values: missing },
      });
    }
  }

  await ensureTab(VIDEO_TAB);
  await ensureHeaders(VIDEO_TAB, VIDEO_HEADERS, VIDEO_LAST_COL);
  const vExisting = await call(`/values/${range(`A2:A`, VIDEO_TAB)}`);
  if (!(vExisting.values && vExisting.values.length)) {
    await call(`/values/${range(`A2:${VIDEO_LAST_COL}${videos.VIDEO_CHAPTERS.length + 1}`, VIDEO_TAB)}?valueInputOption=RAW`, {
      method: "PUT",
      data: { values: videos.toRows({}) },
    });
  }

  await renameLegacyStaffTab();
  await ensureTab(STAFF_TAB);
  await ensureHeaders(STAFF_TAB, STAFF_HEADERS, STAFF_LAST_COL);

  await ensureTab(ROLES_TAB);
  await ensureHeaders(ROLES_TAB, ROLES_HEADERS, ROLES_LAST_COL);

  await call(":batchUpdate", {
    method: "POST",
    data: {
      requests: [
        {
          // Dropdown on the Status column (column J) so editors pick from a fixed list.
          setDataValidation: {
            range: { sheetId: students.sheetId, startRowIndex: 1, startColumnIndex: 9, endColumnIndex: 10 },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: STATUSES.map((s) => ({ userEnteredValue: s })),
              },
              showCustomUi: true,
              strict: true,
            },
          },
        },
        {
          // Dropdowns on Staff Member (Q) and Alumni Member (R): Yes or empty.
          setDataValidation: {
            range: { sheetId: students.sheetId, startRowIndex: 1, startColumnIndex: 16, endColumnIndex: 18 },
            rule: {
              condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "Yes" }] },
              showCustomUi: true,
              strict: true,
            },
          },
        },
        {
          // Dropdown on the Quiz Codes Status column (column E), so a hand edit cannot invent a status.
          setDataValidation: {
            range: { sheetId: quizCodes.sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
            rule: {
              condition: { type: "ONE_OF_LIST", values: quizcodes.STATUS_LIST.map((x) => ({ userEnteredValue: x })) },
              showCustomUi: true,
              strict: true,
            },
          },
        },
        {
          // Keep the long photo text from stretching rows.
          repeatCell: {
            range: { sheetId: photos.sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { wrapStrategy: "CLIP" } },
            fields: "userEnteredFormat.wrapStrategy",
          },
        },
      ],
    },
  });
}

async function readAll() {
  const data = await call(`/values/${range(`A2:${LAST_COL}`)}`);
  return data.values || [];
}

// Short cache for the public lookup page so heavy use can't exhaust Google's read quota.
let cache = { at: 0, rows: [], ok: false };
async function readCached(ttlMs = 15000) {
  ttlMs = Math.max(ttlMs, MIN_TTL_MS);
  if (Date.now() - cache.at > ttlMs) {
    try {
      cache = { rows: await once("students", readAll), at: Date.now(), ok: true };
    } catch (err) {
      if (!cache.ok) throw err;
      // Google refused or is down: keep serving the last good copy and try again in about 10 seconds.
      console.error("Sheets read failed, serving the last copy:", err.message);
      cache.at = Date.now() - ttlMs + 10000;
    }
  }
  return cache.rows;
}

async function appendRow(row) {
  await call(
    `/values/${range(`A:${LAST_COL}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", data: { values: [row] } }
  );
  cache.at = 0;
}

// ---- Quiz results (one row per finished quiz attempt, written by the Telegram quiz bot) ----
let quizCache = { at: 0, rows: [], ok: false };
async function readQuiz(ttlMs = 15000) {
  ttlMs = Math.max(ttlMs, MIN_TTL_MS);
  if (Date.now() - quizCache.at > ttlMs) {
    try {
      const data = await once("quiz", () => call(`/values/${range(`A2:${QUIZ_LAST_COL}`, QUIZ_TAB)}`));
      quizCache = { rows: data.values || [], at: Date.now(), ok: true };
    } catch (err) {
      if (!quizCache.ok) throw err;
      console.error("Quiz read failed, serving the last copy:", err.message);
      quizCache.at = Date.now() - ttlMs + 10000;
    }
  }
  return quizCache.rows;
}

async function appendQuiz(row) {
  await call(
    `/values/${range(`A:${QUIZ_LAST_COL}`, QUIZ_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", data: { values: [row] } }
  );
  quizCache.at = 0;
}

// ---- Handbook progress (one row per student; saved by the portal's "Mark as read" button) ----
let progCache = { at: 0, rows: [], ok: false };
async function readProgress(ttlMs = 5000) {
  ttlMs = Math.max(ttlMs, MIN_TTL_MS);
  if (Date.now() - progCache.at > ttlMs) {
    try {
      const data = await once("progress", () => call(`/values/${range(`A2:${PROG_LAST_COL}`, PROG_TAB)}`));
      progCache = { rows: data.values || [], at: Date.now(), ok: true };
    } catch (err) {
      if (!progCache.ok) throw err;
      console.error("Progress read failed, serving the last copy:", err.message);
      progCache.at = Date.now() - ttlMs + 10000;
    }
  }
  return progCache.rows;
}

// The cell holding the chapters a student has read, or "" if the student has no row yet.
async function getProgressCell(reg, ttlMs) {
  const rows = await readProgress(ttlMs);
  const r = rows.find((x) => (x[0] || "") === reg);
  return r ? r[2] || "" : "";
}

// Create or update the student's row. Callers serialise writes so two saves cannot create two rows.
async function saveProgress(reg, fullName, readIds, total, percent, updatedAt) {
  const rows = await readProgress(0);
  const i = rows.findIndex((x) => (x[0] || "") === reg);
  const row = [reg, fullName, readIds.join(","), readIds.length, total, percent, updatedAt];
  if (i >= 0) {
    await call(`/values/${range(`A${i + 2}:${PROG_LAST_COL}${i + 2}`, PROG_TAB)}?valueInputOption=RAW`, {
      method: "PUT",
      data: { values: [row] },
    });
  } else {
    await call(
      `/values/${range(`A:${PROG_LAST_COL}`, PROG_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", data: { values: [row] } }
    );
  }
  progCache.at = 0;
}

// ---- Mentorship codes (always read fresh: a code must never be accepted twice) ----
const normCode = (v) => String(v || "").trim().toUpperCase();

// Returns { row, sheetRow } for an unused code, or null if the code is unknown or already used.
async function findFreeCode(code) {
  const want = normCode(code);
  if (!want) return null;
  const data = await call(`/values/${range(`A2:${CODE_LAST_COL}`, CODE_TAB)}`);
  const rows = data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (normCode(rows[i][0]) === want) {
      if ((rows[i][2] || "").trim()) return null; // already used
      return { code: want, sheetRow: i + 2 };
    }
  }
  return null;
}

async function markCodeUsed(sheetRow, reg, usedAt) {
  await call(`/values/${range(`C${sheetRow}:D${sheetRow}`, CODE_TAB)}?valueInputOption=RAW`, {
    method: "PUT",
    data: { values: [[reg, usedAt]] },
  });
}

// ---- Site links ----
let linksCache = { at: 0, values: null };
async function readLinks(ttlMs = 30000) {
  if (!linksCache.values || Date.now() - linksCache.at > ttlMs) {
    const data = await call(`/values/${range(`A2:${LINKS_LAST_COL}`, LINKS_TAB)}`);
    linksCache = { values: links.fromRows(data.values || []), at: Date.now() };
  }
  return linksCache.values;
}

async function saveLinks(values) {
  const last = links.FIELDS.length + 1;
  await call(`/values/${range(`A2:${LINKS_LAST_COL}${last}`, LINKS_TAB)}?valueInputOption=RAW`, {
    method: "PUT",
    data: { values: links.toRows(values) },
  });
  // Best effort: clear any leftover rows below the settings (old duplicates), because a stale copy of a key
  // further down the tab would win on read and bring the previous link back. A failure here must not fail the save.
  try {
    await call(`/values/${range(`A${last + 1}:${LINKS_LAST_COL}`, LINKS_TAB)}:clear`, { method: "POST", data: {} });
  } catch (e) {
    console.error("Site links: could not clear leftover rows:", e.message);
  }
  // The values are now in the sheet. Refresh from it so the site shows exactly what is stored.
  linksCache = { at: 0, values: null };
  try {
    const saved = await readLinks(0);
    for (const f of links.FIELDS) {
      const want = links.sanitize({ [f.key]: values[f.key] || "" }).values[f.key] || "";
      if ((saved[f.key] || "") !== want) console.error(`Site links: "${f.key}" read back differently from what was saved`);
    }
  } catch (e) {
    console.error("Site links: read-back failed:", e.message);
    linksCache = { at: Date.now(), values };
  }
}

// ---- Chapter videos ----
let videoCache = { at: 0, values: null };
async function readVideos(ttlMs = 30000) {
  if (!videoCache.values || Date.now() - videoCache.at > ttlMs) {
    const data = await call(`/values/${range(`A2:${VIDEO_LAST_COL}`, VIDEO_TAB)}`);
    videoCache = { values: videos.fromRows(data.values || []), at: Date.now() };
  }
  return videoCache.values;
}

async function saveVideos(values) {
  await call(`/values/${range(`A2:${VIDEO_LAST_COL}${videos.VIDEO_CHAPTERS.length + 1}`, VIDEO_TAB)}?valueInputOption=RAW`, {
    method: "PUT",
    data: { values: videos.toRows(values) },
  });
  videoCache = { at: Date.now(), values };
}

// ---- Passport photos (kept on their own tab so student reads stay small and fast) ----
// Column C is filled in when the student changes their own photo: each student gets ONE change.
let photoIndex = { at: 0, regs: [], changed: [] };
async function photoRegs(ttlMs) {
  if (Date.now() - photoIndex.at > ttlMs) {
    const data = await call(`/values:batchGet?ranges=${range("A2:A", PHOTO_TAB)}&ranges=${range("C2:C", PHOTO_TAB)}`);
    const [a, c] = data.valueRanges || [];
    const regs = ((a && a.values) || []).map((r) => r[0] || "");
    const cv = (c && c.values) || [];
    photoIndex = { at: Date.now(), regs, changed: regs.map((_, i) => !!(cv[i] && cv[i][0])) };
  }
  return photoIndex.regs;
}

// Has this student already used their one photo change?
async function photoChanged(reg) {
  const regs = await photoRegs(30000);
  const i = regs.lastIndexOf(reg);
  return i >= 0 && photoIndex.changed[i];
}

const photoCache = new Map();

async function appendPhoto(reg, base64) {
  await call(
    `/values/${range("A:B", PHOTO_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", data: { values: [[reg, base64]] } }
  );
  photoIndex.at = 0;
  photoCache.delete(reg);
}

// Replace a student's photo (or add one if they never had one). The row is overwritten in place, and any
// extra rows for the same reg are left alone: getPhoto reads the LAST match, so replacing that one is enough.
// Returns "ok", or "already" when the student has used their one change. A student with no photo row yet
// gets one added, and that does not use up the change.
async function setPhoto(reg, base64, force = false) {
  const regs = await photoRegs(0); // always fresh: a stale index could overwrite the wrong row
  const i = regs.lastIndexOf(reg);
  if (i < 0) { await appendPhoto(reg, base64); return "ok"; }
  if (photoIndex.changed[i] && !force) return "already"; // force: a mentor asked this student to send a new photo
  const today = new Date().toISOString().slice(0, 10);
  await call("/values:batchUpdate", {
    method: "POST",
    data: {
      valueInputOption: "RAW",
      data: [
        { range: `${quoteTab(PHOTO_TAB)}!B${i + 2}`, values: [[base64]] },
        { range: `${quoteTab(PHOTO_TAB)}!C${i + 2}`, values: [[today]] },
      ],
    },
  });
  photoIndex.changed[i] = true;
  photoCache.delete(reg);
  return "ok";
}

async function getPhoto(reg) {
  const hit = photoCache.get(reg);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.b64;

  let regs = await photoRegs(30000);
  let i = regs.lastIndexOf(reg);
  if (i < 0) {
    regs = await photoRegs(5000); // maybe a brand-new registration
    i = regs.lastIndexOf(reg);
  }
  if (i < 0) return null;

  const data = await call(`/values/${range(`B${i + 2}`, PHOTO_TAB)}`);
  const b64 = (data.values && data.values[0] && data.values[0][0]) || null;
  if (b64) {
    photoCache.set(reg, { b64, at: Date.now() });
    if (photoCache.size > 300) photoCache.delete(photoCache.keys().next().value);
  }
  return b64;
}

// ---- Signatures (their own tab, like photos): one row per student, the newest save replaces the old one ----
// The tab is made at start-up, but it is checked again here (once per run) so a start-up hiccup, or a tab
// someone deleted, can never stop a student saving their signature.
let sigReady = null;
function ensureSigTab() {
  if (!sigReady) {
    sigReady = (async () => {
      await ensureTab(SIG_TAB);
      await ensureHeaders(SIG_TAB, SIG_HEADERS, "B");
    })().catch((e) => { sigReady = null; throw e; });
  }
  return sigReady;
}

// Run a signature step; if Google refuses it, make sure the tab is there and try once more.
async function withSigTab(fn) {
  await ensureSigTab();
  try {
    return await fn();
  } catch (e) {
    console.error("Signature step failed, retrying once:", e && e.message);
    sigReady = null;
    await ensureSigTab();
    return fn();
  }
}

async function sigRow(reg) {
  const data = await call(`/values/${range("A2:A", SIG_TAB)}`);
  const regs = ((data && data.values) || []).map((r) => (r && r[0]) || "");
  const i = regs.lastIndexOf(reg);
  return i < 0 ? 0 : i + 2; // sheet row number, or 0 when there is none
}

function getSignature(reg) {
  return withSigTab(async () => {
    const row = await sigRow(reg);
    if (!row) return null;
    const data = await call(`/values/${range(`B${row}`, SIG_TAB)}`);
    return (data.values && data.values[0] && data.values[0][0]) || null;
  });
}

function setSignature(reg, base64) {
  return withSigTab(async () => {
    const row = await sigRow(reg);
    if (!row) {
      await call(
        `/values/${range("A:B", SIG_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", data: { values: [[reg, base64]] } }
      );
      return;
    }
    await call(`/values/${range(`B${row}`, SIG_TAB)}?valueInputOption=RAW`, { method: "PUT", data: { values: [[base64]] } });
  });
}

// ---- Generic tab access for the editor dashboard's "Sheets" view (the rules live in admin-sheets.js) ----
// The Photos tab is deliberately left out: it holds long image text that nobody should edit by hand.
const EDITOR_TABS = {
  students: { title: TAB, headers: HEADERS, lastCol: LAST_COL },
  codes: { title: CODE_TAB, headers: CODE_HEADERS, lastCol: CODE_LAST_COL },
  quiz: { title: QUIZ_TAB, headers: QUIZ_HEADERS, lastCol: QUIZ_LAST_COL },
  progress: { title: PROG_TAB, headers: PROG_HEADERS, lastCol: PROG_LAST_COL },
  links: { title: LINKS_TAB, headers: LINKS_HEADERS, lastCol: LINKS_LAST_COL },
  videos: { title: VIDEO_TAB, headers: VIDEO_HEADERS, lastCol: VIDEO_LAST_COL },
  // Internal only: never listed in the dashboard. Used to remove a deleted student's photo.
  photos: { title: PHOTO_TAB, headers: PHOTO_HEADERS, lastCol: "B" },
  // Internal only, like photos: signature pictures. Used to remove a deleted student's signature.
  signatures: { title: SIG_TAB, headers: SIG_HEADERS, lastCol: "B" },
  // Internal only: the one-time date of birth corrections students make themselves (old and new value, and when).
  dobchanges: { title: DOB_TAB, headers: DOB_HEADERS, lastCol: "D" },
  // Internal only: quiz codes. Managed through quizcodes.js and the "Quiz codes" dashboard tab, never the Database view.
  quizcodes: { title: QUIZCODE_TAB, headers: QUIZCODE_HEADERS, lastCol: QUIZCODE_LAST_COL },
  // Internal only: bot trading settings, orders and trades. Managed through bot.js and the portal's "Bot trading" page.
  botaccounts: { title: BOTACC_TAB, headers: BOTACC_HEADERS, lastCol: BOTACC_LAST_COL },
  botorders: { title: BOTORD_TAB, headers: BOTORD_HEADERS, lastCol: BOTORD_LAST_COL },
  bottrades: { title: BOTTRD_TAB, headers: BOTTRD_HEADERS, lastCol: BOTTRD_LAST_COL },
  // Internal only: the funds' ledger and withdrawal requests. Managed through fund.js, the portal's "Funds" page and the "Funds" dashboard tab.
  fundledger: { title: FUNDLED_TAB, headers: FUNDLED_HEADERS, lastCol: FUNDLED_LAST_COL },
  fundwithdrawals: { title: FUNDWD_TAB, headers: FUNDWD_HEADERS, lastCol: FUNDWD_LAST_COL },
  // Internal only: copy trading masters, follows, master trades and copy orders. Managed through copy.js and the portal's "Copy trading" page.
  copymasters: { title: COPYMASTER_TAB, headers: COPYMASTER_HEADERS, lastCol: COPYMASTER_LAST_COL },
  copyfollows: { title: COPYFOLLOW_TAB, headers: COPYFOLLOW_HEADERS, lastCol: COPYFOLLOW_LAST_COL },
  copytrades: { title: COPYTRADE_TAB, headers: COPYTRADE_HEADERS, lastCol: COPYTRADE_LAST_COL },
  copyorders: { title: COPYORDER_TAB, headers: COPYORDER_HEADERS, lastCol: COPYORDER_LAST_COL },
  hostingrequests: { title: HOSTREQ_TAB, headers: HOSTREQ_HEADERS, lastCol: HOSTREQ_LAST_COL },
  // Internal only: live classes and who attended. Managed through attendance.js and the "Attendance" dashboard tab.
  classes: { title: CLASS_TAB, headers: CLASS_HEADERS, lastCol: CLASS_LAST_COL },
  attendance: { title: ATT_TAB, headers: ATT_HEADERS, lastCol: ATT_LAST_COL },
  // Internal only, like photos: the dashboard staff (password hashes). Managed through staff.js, never the Database view.
  staff: { title: STAFF_TAB, headers: STAFF_HEADERS, lastCol: STAFF_LAST_COL },
  // Internal only: custom roles. Managed through staff.js, never the Database view.
  roles: { title: ROLES_TAB, headers: ROLES_HEADERS, lastCol: ROLES_LAST_COL },
};

function editorTab(key) {
  if (!Object.prototype.hasOwnProperty.call(EDITOR_TABS, key)) throw new Error("Unknown sheet: " + key);
  return EDITOR_TABS[key];
}

const cellText = (v) => (v == null ? "" : String(v));
// Google trims empty cells at the end of a row; give every row its full width again.
function fitRow(row, width) {
  const r = (row || []).slice(0, width).map(cellText);
  while (r.length < width) r.push("");
  return r;
}
const colLetter = (i) => String.fromCharCode(65 + i);
const quoteTab = (title) => "'" + title.replace(/'/g, "''") + "'";

// Forget whatever the website has remembered about a tab, so the next read sees the change.
function invalidate(key) {
  if (key === "students") cache.at = 0;
  else if (key === "quiz") quizCache.at = 0;
  else if (key === "progress") progCache.at = 0;
  else if (key === "links") linksCache = { at: 0, values: null };
  else if (key === "videos") videoCache = { at: 0, values: null };
  else if (key === "photos") { photoIndex.at = 0; photoCache.clear(); }
}

function sheetUrl() {
  return SHEET_ID ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/edit` : "";
}

// If a tab is missing (the start-up setup did not finish), make it and its header row, then try again once.
// Google reports a missing tab as "Unable to parse range".
async function healing(key, run) {
  try {
    return await run();
  } catch (err) {
    if (!/unable to parse range/i.test(String((err && err.message) || ""))) throw err;
    const t = editorTab(key);
    if (key === "staff") await renameLegacyStaffTab();
    await ensureTab(t.title);
    await ensureHeaders(t.title, t.headers, t.lastCol);
    return run();
  }
}

// Every data row of a tab, always read fresh. `n` is the row number in the sheet (the header is row 1).
async function tabRows(key) {
  const t = editorTab(key);
  const data = await healing(key, () => call(`/values/${range(`A2:${t.lastCol}`, t.title)}`));
  return (data.values || []).map((r, i) => ({ n: i + 2, cells: fitRow(r, t.headers.length) }));
}

async function tabRow(key, n) {
  const t = editorTab(key);
  const data = await call(`/values/${range(`A${n}:${t.lastCol}${n}`, t.title)}`);
  return fitRow((data.values || [])[0], t.headers.length);
}

// Change only the cells that changed ({ columnIndex: text }), so the rest of the row is left exactly as it was.
// RAW means the text is stored as typed: a value starting with "=" can never run as a formula.
async function writeTabCells(key, n, changes) {
  const t = editorTab(key);
  const data = Object.keys(changes).map((i) => ({
    range: `${quoteTab(t.title)}!${colLetter(Number(i))}${n}`,
    values: [[cellText(changes[i])]],
  }));
  if (!data.length) return;
  await call("/values:batchUpdate", { method: "POST", data: { valueInputOption: "RAW", data } });
  invalidate(key);
}

// Change a registration number inside one column of a tab, in every row that holds it (a photo, a signature,
// quiz results, progress...). All the changes go in one request. Returns how many rows were changed.
async function renameRegCells(key, col, oldReg, newReg) {
  const t = editorTab(key);
  const tab = await findTab(t.title);
  if (!tab) return 0;
  const data = await call(`/values/${range(`A2:${t.lastCol}`, t.title)}`);
  const writes = [];
  (data.values || []).forEach((r, i) => {
    if (String((r && r[col]) || "").trim().toUpperCase() === oldReg) {
      writes.push({ range: `${quoteTab(t.title)}!${colLetter(col)}${i + 2}`, values: [[newReg]] });
    }
  });
  if (!writes.length) return 0;
  await call("/values:batchUpdate", { method: "POST", data: { valueInputOption: "RAW", data: writes } });
  invalidate(key);
  return writes.length;
}

async function appendTabRows(key, rows) {
  const t = editorTab(key);
  if (!rows.length) return;
  await healing(key, () => call(
    `/values/${range(`A:${t.lastCol}`, t.title)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", data: { values: rows.map((r) => fitRow(r, t.headers.length)) } }
  ));
  invalidate(key);
}

async function deleteTabRow(key, n) {
  const t = editorTab(key);
  const tab = await findTab(t.title);
  if (!tab) throw new Error("The sheet tab was not found: " + t.title);
  await call(":batchUpdate", {
    method: "POST",
    data: {
      requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: n - 1, endIndex: n } } }],
    },
  });
  invalidate(key);
}

// Delete every row of a tab whose column A equals `reg` (a deleted student's photo, results, progress).
// Rows are removed from the bottom up in ONE request, so the row numbers cannot shift under it.
async function deleteTabRowsByReg(key, reg, col = 0) {
  const t = editorTab(key);
  const tab = await findTab(t.title);
  if (!tab) return 0;
  const data = await call(`/values/${range(`A2:${t.lastCol}`, t.title)}`);
  const hits = [];
  (data.values || []).forEach((r, i) => { if (String((r && r[col]) || "").trim().toUpperCase() === reg) hits.push(i + 2); });
  if (!hits.length) return 0;
  await call(":batchUpdate", {
    method: "POST",
    data: {
      requests: hits.reverse().map((n) => ({
        deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: n - 1, endIndex: n } },
      })),
    },
  });
  invalidate(key);
  return hits.length;
}

module.exports = {
  init, readAll, readCached, appendRow, appendPhoto, setPhoto, photoChanged, getPhoto, getSignature, setSignature, readQuiz, appendQuiz, findFreeCode, markCodeUsed,
  getProgressCell, saveProgress, readLinks, saveLinks, readVideos, saveVideos, HEADERS, STATUSES,
  EDITOR_TABS, tabRows, tabRow, writeTabCells, renameRegCells, appendTabRows, deleteTabRow, deleteTabRowsByReg, invalidate, sheetUrl,
};
