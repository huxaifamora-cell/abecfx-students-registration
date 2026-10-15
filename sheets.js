// Thin Google Sheets storage layer (service account + REST API).
const { JWT } = require("google-auth-library");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || "Students";
const PHOTO_TAB = process.env.GOOGLE_PHOTO_TAB || "Photos";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

const STATUSES = [
  "Uncertified",
  "Certified",
  "Graduate",
  "Alumni Member",
  "Mentor",
  "Staff Member",
  "CEO",
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
  "Promo Code",
  "Status",
  "Status Date",
  "ID Issue Date",
  "State / Region",
];
const LAST_COL = "M";
const PHOTO_HEADERS = ["Reg Number", "Photo (base64 JPEG - do not edit)"];

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

// ---- Passport photos (kept on their own tab so student reads stay small and fast) ----
let photoIndex = { at: 0, regs: [] };
async function photoRegs(ttlMs) {
  if (Date.now() - photoIndex.at > ttlMs) {
    const data = await call(`/values/${range("A2:A", PHOTO_TAB)}`);
    photoIndex = { at: Date.now(), regs: (data.values || []).map((r) => r[0] || "") };
  }
  return photoIndex.regs;
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

module.exports = { init, readAll, readCached, appendRow, appendPhoto, getPhoto, HEADERS, STATUSES };
