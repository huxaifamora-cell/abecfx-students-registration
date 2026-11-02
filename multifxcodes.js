// One-time codes that unlock the Multi-FX course (a supplementary course under Mentorship).
//
// Life of a code (the "Status" column of the "Multi-FX Codes" sheet tab):
//   Unused     made by an admin (or any role given the "multifx" access). Nobody has used it yet.
//   Redeemed   a student entered it. THAT student now has Multi-FX (handbook, workbook, community, live class and
//              quiz) on every device, for good. The code is spent: nobody else can use it.
//   Revoked    cancelled by an admin. An Unused code can no longer be used; cancelling a Redeemed code takes Multi-FX
//              away from the student who used it (for a refund or a misuse), and they would need a new code.
//
// Rules this file enforces (the website, not the browser, is the judge):
//   - A code works once. A code made "for" one registration number cannot be used by anyone else.
//   - A student who already has Multi-FX who enters another code is told so and the code is NOT spent.
//   - Entering and cancelling codes go one at a time (a queue), so two students cannot spend the same code at once.
//
// Codes look like MF-7K4M-9PXR (no 0/O/1/I/L, so they are easy to read out loud). When a code is checked, capitals,
// spaces and dashes do not matter: "mf 7k4m 9pxr" is the same code.
const crypto = require("crypto");

const HEADERS = [
  "Multi-FX Code",
  "Created At (Lagos)",
  "Created By",
  "For (Reg Number, optional)",
  "Status",
  "Used By (Reg Number)",
  "Redeemed At (Lagos)",
  "Revoked (By, At)",
];
const COL = { code: 0, createdAt: 1, createdBy: 2, forReg: 3, status: 4, usedBy: 5, redeemedAt: 6, revoked: 7 };

const STATUS = { UNUSED: "Unused", REDEEMED: "Redeemed", REVOKED: "Revoked" };
const STATUS_LIST = Object.values(STATUS);

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 characters: no 0, O, 1, I or L
const MAX_AT_ONCE = 50;
const REG_RE = /^ABECFX\/\d{2}\/\d{4}$/;

// What a student sees when a code does not work. One message for "no such code", "already used", "cancelled" and
// "meant for someone else", so nobody can use the form to find out which codes exist.
const BAD_CODE = "This Multi-FX code is not valid or has already been used. Ask your mentor for a new one.";

class MultifxCodeError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

const normCode = (v) => String(v == null ? "" : v).slice(0, 60).toUpperCase().replace(/[^A-Z0-9]/g, "");
const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");

function makeCode(random = (n) => crypto.randomInt(n)) {
  const pick = (len) => Array.from({ length: len }, () => ALPHABET[random(ALPHABET.length)]).join("");
  return "MF-" + pick(4) + "-" + pick(4);
}

function statusOf(cells) {
  const s = String(cells[COL.status] || "").trim().toLowerCase();
  const found = STATUS_LIST.find((x) => x.toLowerCase() === s);
  if (found) return found;
  // A row typed in by hand with no status is a fresh code, unless it already names who used it.
  return String(cells[COL.usedBy] || "").trim() ? STATUS.REDEEMED : STATUS.UNUSED;
}

function fromRows(rows) {
  return rows
    .map(({ n, cells }) => ({
      n,
      code: String(cells[COL.code] || "").trim(),
      createdAt: cells[COL.createdAt] || "",
      createdBy: cells[COL.createdBy] || "",
      forReg: normReg(cells[COL.forReg]),
      status: statusOf(cells),
      usedBy: normReg(cells[COL.usedBy]),
      redeemedAt: cells[COL.redeemedAt] || "",
      revoked: cells[COL.revoked] || "",
    }))
    .filter((r) => r.code);
}

function publicCode(r) {
  return {
    code: r.code, status: r.status, forReg: r.forReg, createdAt: r.createdAt, createdBy: r.createdBy,
    usedBy: r.usedBy, redeemedAt: r.redeemedAt, revoked: r.revoked,
  };
}

// `store` needs tabRows / appendTabRows / writeTabCells for the "mfxcodes" tab (sheets.js, or the in-memory stand-in).
// Options: now() gives the time text written to the sheet (Lagos time); studentExists(reg) is async;
// cacheMs is how long a read may be re-used for "does this student have Multi-FX?" (anything that decides always reads fresh);
// random(n) gives a whole number below n (the tests pass their own).
function create(store, opts = {}) {
  const stamp = opts.now || (() => new Date().toISOString());
  const studentExists = opts.studentExists || null;
  const cacheMs = opts.cacheMs == null ? 3000 : opts.cacheMs;
  const random = opts.random || ((n) => crypto.randomInt(n));
  let cache = { at: 0, rows: [] };
  let chain = Promise.resolve();

  const queued = (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
  const forget = () => { cache = { at: 0, rows: [] }; };
  async function fresh() {
    const rows = fromRows(await store.tabRows("mfxcodes"));
    cache = { at: Date.now(), rows };
    return rows;
  }
  async function recent() {
    if (cache.at && Date.now() - cache.at < cacheMs) return cache.rows;
    return fresh();
  }
  const openFor = (rows, reg) => rows.find((r) => r.status === STATUS.REDEEMED && r.usedBy === reg) || null;

  // ---------- Students ----------

  // Does this student have Multi-FX? { unlocked, since }. Pass { fresh: true } when the answer decides something.
  async function accessFor(reg, o = {}) {
    const rows = o.fresh ? await fresh() : await recent();
    const open = openFor(rows, normReg(reg));
    return { unlocked: Boolean(open), since: open ? open.redeemedAt : "" };
  }

  // A student enters a code. Unlocks Multi-FX, or throws a MultifxCodeError that is safe to show them.
  function redeem(codeInput, regInput) {
    return queued(async () => {
      const reg = normReg(regInput);
      const want = normCode(codeInput);
      if (!want) throw new MultifxCodeError(400, "Enter your Multi-FX code.", { code: "Enter your Multi-FX code." });
      const rows = await fresh();
      if (openFor(rows, reg)) return { unlocked: true, already: true }; // never spend a second code
      const row = rows.find((r) => normCode(r.code) === want) || null;
      if (!row || row.status !== STATUS.UNUSED || (row.forReg && row.forReg !== reg)) {
        throw new MultifxCodeError(400, BAD_CODE, { code: BAD_CODE });
      }
      await store.writeTabCells("mfxcodes", row.n, {
        [COL.status]: STATUS.REDEEMED,
        [COL.usedBy]: reg,
        [COL.redeemedAt]: stamp(),
      });
      forget();
      return { unlocked: true, already: false };
    });
  }

  // ---------- The dashboard (an Owner, an Admin, or a role given the "multifx" access) ----------

  // Make `count` new codes, optionally all for one registration number.
  function generate(input, actor) {
    return queued(async () => {
      const b = input || {};
      const count = Number(b.count);
      const forReg = normReg(b.forReg);
      const errors = {};
      if (!Number.isInteger(count) || count < 1 || count > MAX_AT_ONCE) errors.count = "Choose how many codes to make (1 to " + MAX_AT_ONCE + ").";
      if (forReg) {
        if (!REG_RE.test(forReg)) errors.forReg = "Enter a registration number like ABECFX/26/0001, or leave it empty.";
        else if (studentExists && !(await studentExists(forReg))) errors.forReg = "No student has this registration number.";
      }
      if (Object.keys(errors).length) throw new MultifxCodeError(400, "Please fix the highlighted fields.", errors);

      const taken = new Set((await fresh()).map((r) => normCode(r.code)));
      const at = stamp();
      const by = (actor && actor.username) || "";
      const made = [];
      for (let i = 0; i < count; i++) {
        let code;
        let guard = 0;
        do { code = makeCode(random); } while (taken.has(normCode(code)) && ++guard < 100);
        if (taken.has(normCode(code))) throw new MultifxCodeError(500, "Could not make a new code. Please try again.");
        taken.add(normCode(code));
        made.push([code, at, by, forReg, STATUS.UNUSED, "", "", ""]);
      }
      await store.appendTabRows("mfxcodes", made);
      forget();
      return { codes: made.map((r) => ({ code: r[COL.code], createdAt: at, createdBy: by, forReg })) };
    });
  }

  // Every code, newest first.
  async function list() {
    return (await fresh()).map(publicCode).reverse();
  }

  // The registration numbers that have Multi-FX right now.
  async function unlockedRegs() {
    return new Set((await fresh()).filter((r) => r.status === STATUS.REDEEMED && r.usedBy).map((r) => r.usedBy));
  }

  // Cancel a code. An unused code can no longer be used; a redeemed one takes Multi-FX away from its student.
  function revoke(codeInput, actor) {
    return queued(async () => {
      const want = normCode(codeInput);
      const row = want ? (await fresh()).find((r) => normCode(r.code) === want) : null;
      if (!row) throw new MultifxCodeError(404, "That code could not be found.");
      if (row.status === STATUS.REVOKED) return { code: row.code, status: STATUS.REVOKED, hadAccess: false, usedBy: row.usedBy };
      const by = (actor && actor.username) || "";
      await store.writeTabCells("mfxcodes", row.n, { [COL.status]: STATUS.REVOKED, [COL.revoked]: by + ", " + stamp() });
      forget();
      return { code: row.code, status: STATUS.REVOKED, hadAccess: row.status === STATUS.REDEEMED, usedBy: row.usedBy };
    });
  }

  return { accessFor, redeem, generate, list, revoke, unlockedRegs };
}

module.exports = { create, makeCode, normCode, HEADERS, COL, STATUS, STATUS_LIST, MAX_AT_ONCE, BAD_CODE, MultifxCodeError };
