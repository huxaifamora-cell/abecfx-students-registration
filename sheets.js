// Thin Google Sheets storage layer (service account + REST API).
const { JWT } = require("google-auth-library");
const links = require("./links");
const videos = require("./videos");
const team = require("./team");
const quizcodes = require("./quizcodes");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || "Students";
const PHOTO_TAB = process.env.GOOGLE_PHOTO_TAB || "Photos";
const SIG_TAB = process.env.GOOGLE_SIGNATURE_TAB || "Signatures";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

const STATUSES = [
  "Uncertified",
  "Certified",
  "Team Member",
  "Alumni Member",
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
  "Team Role",
  "Photo To Redo (type Yes: the student must send a new passport photo)",
];
const LAST_COL = "P";
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

// Dashboard team (named admin / moderator accounts). Holds password HASHES only; never listed in the Database view.
const TEAM_TAB = process.env.GOOGLE_TEAM_TAB || "Team";
const TEAM_HEADERS = team.HEADERS;
const TEAM_LAST_COL = "G";

// Custom roles (a name and the access it gives). Built-in roles live in team.js. No secrets here.
const ROLES_TAB = process.env.GOOGLE_ROLES_TAB || "Roles";
const ROLES_HEADERS = team.ROLE_HEADERS;
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

async function call(path, options = {}) {
  const res = await getClient().request({
    url: `${API}/${SHEET_ID}${path}`,
    ...options,
  });
  return res.data;
}

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
async function init() {
  const students = await ensureTab(TAB);
  await ensureHeaders(TAB, HEADERS, LAST_COL);

  const photos = await ensureTab(PHOTO_TAB);
  await ensureHeaders(PHOTO_TAB, PHOTO_HEADERS, "B");

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

  await ensureTab(TEAM_TAB);
  await ensureHeaders(TEAM_TAB, TEAM_HEADERS, TEAM_LAST_COL);

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
let cache = { at: 0, rows: [] };
async function readCached(ttlMs = 15000) {
  if (Date.now() - cache.at > ttlMs) {
    cache = { rows: await readAll(), at: Date.now() };
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
let quizCache = { at: 0, rows: [] };
async function readQuiz(ttlMs = 15000) {
  if (Date.now() - quizCache.at > ttlMs) {
    const data = await call(`/values/${range(`A2:${QUIZ_LAST_COL}`, QUIZ_TAB)}`);
    quizCache = { rows: data.values || [], at: Date.now() };
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
let progCache = { at: 0, rows: [] };
async function readProgress(ttlMs = 5000) {
  if (Date.now() - progCache.at > ttlMs) {
    const data = await call(`/values/${range(`A2:${PROG_LAST_COL}`, PROG_TAB)}`);
    progCache = { rows: data.values || [], at: Date.now() };
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
  // Internal only, like photos: the dashboard team (password hashes). Managed through team.js, never the Database view.
  team: { title: TEAM_TAB, headers: TEAM_HEADERS, lastCol: TEAM_LAST_COL },
  // Internal only: custom roles. Managed through team.js, never the Database view.
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

// Every data row of a tab, always read fresh. `n` is the row number in the sheet (the header is row 1).
async function tabRows(key) {
  const t = editorTab(key);
  const data = await call(`/values/${range(`A2:${t.lastCol}`, t.title)}`);
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

async function appendTabRows(key, rows) {
  const t = editorTab(key);
  if (!rows.length) return;
  await call(
    `/values/${range(`A:${t.lastCol}`, t.title)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", data: { values: rows.map((r) => fitRow(r, t.headers.length)) } }
  );
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
  EDITOR_TABS, tabRows, tabRow, writeTabCells, appendTabRows, deleteTabRow, deleteTabRowsByReg, invalidate, sheetUrl,
};
