// An in-memory stand-in for sheets.js, used by the tests (and for trying the dashboard without Google).
// It keeps every tab as an array of rows and offers the same functions admin-sheets.js calls.
const STATUSES = ["Uncertified", "Certified", "Not a student"];

// Same columns as sheets.js (a test below checks they have not drifted apart).
const HEADERS = {
  students: ["Reg Number", "Registered At (Lagos)", "Country", "Programme Type", "Full Name", "Email", "WhatsApp Number", "Gender", "Mentorship Code", "Status", "Status Date", "ID Issue Date", "State / Region", "Date of Birth", "Staff Role", "Photo To Redo (type Yes: the student must send a new passport photo)", "Staff Member (Yes gives a Staff ID card)", "Alumni Member (Yes gives an Alumni ID card)"],
  codes: ["Mentorship Code", "Created At (Lagos)", "Used By (Reg Number)", "Used At (Lagos)"],
  quizcodes: ["Quiz Code", "Created At (Lagos)", "Created By", "For (Reg Number, optional)", "Status", "Used By (Reg Number)", "Unlocked At (Lagos)", "Completed At (Lagos)", "Revoked (By, At)"],
  classes: ["Class ID", "Title", "Meet Link", "Started At (Lagos)", "Started (UTC)", "Ended At (Lagos)", "Ended (UTC)", "Started By"],
  attendance: ["Class ID", "Reg Number", "Minutes Present (added)", "Recorded At (Lagos)"],
  quiz: ["Submitted At (Lagos)", "Reg Number", "Full Name", "Score", "Total Questions", "Percent", "Grade", "Attempt", "Telegram ID", "Breakdown (JSON)", "Submitted (UTC)"],
  progress: ["Reg Number", "Full Name", "Chapters Read", "Chapters Read (count)", "Total Chapters", "Percent", "Updated At (Lagos)"],
  links: ["Key (do not edit)", "What it is", "Value"],
  videos: ["Chapter", "Chapter title", "YouTube video address"],
  photos: ["Reg Number", "Photo (base64 JPEG - do not edit)"],
  staff: ["Username", "Full Name", "Role", "Password Hash (do not edit)", "Active", "Created At (Lagos)", "Created By"],
  roles: ["Role Key (do not edit)", "Role Name", "Access (do not edit)", "Created At (Lagos)", "Created By"],
};

function student(n, over = {}) {
  const base = [
    "ABECFX/26/" + String(n).padStart(4, "0"), "13 Oct 2026, 14:20:11", "Nigeria", "Forex Mentorship", "Ada Obi " + n,
    "ada" + n + "@example.com", "+234 801 234 5678", "Female", "CODE" + n + "AB", "Uncertified", "", "2026-10-13", "Lagos", "1995-03-27", "", "", "", "",
  ];
  return base.map((v, i) => (over[i] !== undefined ? over[i] : v));
}

function createMemoryStore(seed = {}) {
  const fit = (row, w) => { const r = (row || []).map((c) => (c == null ? "" : String(c))); while (r.length < w) r.push(""); return r.slice(0, w); };
  const data = { students: [], codes: [], quizcodes: [], classes: [], attendance: [], quiz: [], progress: [], links: [], videos: [], photos: [], staff: [], roles: [] };
  for (const k of Object.keys(seed)) data[k] = seed[k].map((r) => r.slice());
  const width = (key) => HEADERS[key].length;
  const calls = []; // what was written, for the tests to look at

  return {
    STATUSES,
    EDITOR_TABS: Object.fromEntries(Object.entries(HEADERS).map(([k, h]) => [k, { headers: h }])),
    sheetUrl: () => "https://docs.google.com/spreadsheets/d/TEST/edit",
    data,
    calls,
    async tabRows(key) { return data[key].map((cells, i) => ({ n: i + 2, cells: fit(cells, width(key)) })); },
    async tabRow(key, n) { return fit(data[key][n - 2], width(key)); },
    async writeTabCells(key, n, changes) {
      calls.push(["write", key, n, { ...changes }]);
      const row = fit(data[key][n - 2], width(key));
      for (const i of Object.keys(changes)) row[Number(i)] = String(changes[i]);
      data[key][n - 2] = row;
    },
    async appendTabRows(key, rows) { calls.push(["append", key, rows.length]); rows.forEach((r) => data[key].push(fit(r, width(key)))); },
    async deleteTabRowsByReg(key, reg, col = 0) {
      const before = data[key].length;
      data[key] = data[key].filter((r) => String((r && r[col]) || "").trim().toUpperCase() !== reg);
      calls.push(["deleteByReg", key, reg, before - data[key].length]);
      return before - data[key].length;
    },
    async deleteTabRow(key, n) { calls.push(["delete", key, n]); data[key].splice(n - 2, 1); },
  };
}

module.exports = { createMemoryStore, student, HEADERS, STATUSES };
