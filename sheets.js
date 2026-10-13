// Thin Google Sheets storage layer (service account + REST API).
const { JWT } = require("google-auth-library");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || "Students";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

const STATUSES = ["Uncertified", "Certified", "Mentor", "Staff Member", "CEO"];

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
];
const LAST_COL = "K";

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

const range = (r) => encodeURIComponent(`${TAB}!${r}`);

async function findTab() {
  const meta = await call("?fields=sheets.properties(sheetId,title)");
  return (meta.sheets || []).map((s) => s.properties).find((p) => p.title === TAB);
}

// Make sure the tab exists, has the header row, and the Status column is a dropdown.
async function init() {
  let tab = await findTab();
  if (!tab) {
    await call(":batchUpdate", {
      method: "POST",
      data: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    tab = await findTab();
  }

  const head = await call(`/values/${range(`A1:${LAST_COL}1`)}`);
  const current = (head.values && head.values[0]) || [];
  if (HEADERS.some((h, i) => current[i] !== h)) {
    await call(`/values/${range(`A1:${LAST_COL}1`)}?valueInputOption=RAW`, {
      method: "PUT",
      data: { values: [HEADERS] },
    });
  }

  // Dropdown on the Status column (column J) so editors pick from a fixed list.
  await call(":batchUpdate", {
    method: "POST",
    data: {
      requests: [
        {
          setDataValidation: {
            range: { sheetId: tab.sheetId, startRowIndex: 1, startColumnIndex: 9, endColumnIndex: 10 },
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

module.exports = { init, readAll, readCached, appendRow, HEADERS, STATUSES };
