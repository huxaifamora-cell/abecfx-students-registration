// One-time quiz codes: the quiz stays locked until a student enters a code, and a code works for ONE quiz.
//
// Life of a code (the "Status" column of the "Quiz Codes" sheet tab):
//   Unused     made by an admin (or any role given the "quizcodes" access). Nobody has used it yet.
//   Unlocked   a student entered it. THEIR quiz is open and stays open until they finish it
//              (on any device, even after signing out), because this is kept here and not in the browser.
//   Completed  the student's quiz result was saved. The code is spent: the quiz is locked again and a
//              new code is needed to take it another time.
//   Revoked    cancelled by an admin before it was finished. If the student was mid-quiz, the quiz locks.
//
// Rules this file enforces (the website, not the browser, is the judge):
//   - A code can be entered once. The same student entering it again while it is open just gets "already open".
//   - A code made "for" one registration number cannot be used by anyone else.
//   - A student can have only ONE open quiz at a time, so codes cannot be stockpiled or burned by accident.
//   - Entering a code and finishing a quiz are changed one at a time (a queue), so two people cannot use the
//     same code at once and a finish cannot race an entry.
//
// Codes look like QZ-7K4M-9PXR (no 0/O/1/I/L, so they are easy to read out loud). When a code is checked,
// capitals, spaces and dashes do not matter: "qz 7k4m 9pxr" is the same code.
const crypto = require("crypto");

const HEADERS = [
  "Quiz Code",
  "Created At (Lagos)",
  "Created By",
  "For (Reg Number, optional)",
  "Status",
  "Used By (Reg Number)",
  "Unlocked At (Lagos)",
  "Completed At (Lagos)",
  "Revoked (By, At)",
];
const COL = { code: 0, createdAt: 1, createdBy: 2, forReg: 3, status: 4, usedBy: 5, unlockedAt: 6, completedAt: 7, revoked: 8 };

const STATUS = { UNUSED: "Unused", UNLOCKED: "Unlocked", COMPLETED: "Completed", REVOKED: "Revoked" };
const STATUS_LIST = Object.values(STATUS);

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 characters: no 0, O, 1, I or L
const MAX_AT_ONCE = 50;
const REG_RE = /^ABECFX\/\d{2}\/\d{4}$/;

// What a student sees when a code does not work. One message for "no such code", "already used", "cancelled"
// and "meant for someone else", so nobody can use the form to find out which codes exist.
const BAD_CODE = "This quiz code is not valid or has already been used. Ask your mentor for a new one.";

class QuizCodeError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

// Capitals only, letters and numbers only: the form a code is compared in.
function normCode(v) {
  return String(v == null ? "" : v).slice(0, 60).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");

// QZ-XXXX-XXXX from 31^8 (about 850 billion) possibilities. `random(n)` returns a whole number 0..n-1.
function makeCode(random = (n) => crypto.randomInt(n)) {
  const pick = (len) => Array.from({ length: len }, () => ALPHABET[random(ALPHABET.length)]).join("");
  return "QZ-" + pick(4) + "-" + pick(4);
}

function statusOf(cells) {
  const s = String(cells[COL.status] || "").trim().toLowerCase();
  const found = STATUS_LIST.find((x) => x.toLowerCase() === s);
  if (found) return found;
  // A row typed in by hand with no status is a fresh code, unless it already names who used it.
  return String(cells[COL.usedBy] || "").trim() ? STATUS.COMPLETED : STATUS.UNUSED;
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
      unlockedAt: cells[COL.unlockedAt] || "",
      completedAt: cells[COL.completedAt] || "",
      revoked: cells[COL.revoked] || "",
    }))
    .filter((r) => r.code);
}

// What the dashboard may see of a code.
function publicCode(r) {
  return {
    code: r.code,
    status: r.status,
    forReg: r.forReg,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    usedBy: r.usedBy,
    unlockedAt: r.unlockedAt,
    completedAt: r.completedAt,
    revoked: r.revoked,
  };
}

// `store` needs tabRows / appendTabRows / writeTabCells for the "quizcodes" tab (sheets.js, or the in-memory
// stand-in the tests use). Options:
//   now            gives the time text written to the sheet (the website passes Lagos time)
//   studentExists  async (reg) => boolean, so a code cannot be made "for" a number nobody has
//   cacheMs        how long a read may be re-used for the "is the quiz open?" display. Anything that
//                  decides (entering a code, opening the quiz, saving a result) always reads fresh.
//   random         a random whole number below n (the tests pass their own)
function create(store, opts = {}) {
  const stamp = opts.now || (() => new Date().toISOString());
  const studentExists = opts.studentExists || null;
  const cacheMs = opts.cacheMs == null ? 3000 : opts.cacheMs;
  const random = opts.random || ((n) => crypto.randomInt(n));
  let cache = { at: 0, rows: [] };
  let chain = Promise.resolve();

  // Changes go one at a time, so two people cannot spend the same code and a finish cannot race an entry.
  const queued = (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
  const forget = () => { cache = { at: 0, rows: [] }; };

  async function fresh() {
    const rows = fromRows(await store.tabRows("quizcodes"));
    cache = { at: Date.now(), rows };
    return rows;
  }
  async function recent() {
    if (cache.at && Date.now() - cache.at < cacheMs) return cache.rows;
    return fresh();
  }

  const openFor = (rows, reg) => rows.find((r) => r.status === STATUS.UNLOCKED && r.usedBy === reg) || null;

  // ---------- Students ----------

  // Is this student's quiz open right now? { unlocked, since }.
  // Pass { fresh: true } whenever the answer decides something (opening the quiz, saving a result).
  async function accessFor(reg, o = {}) {
    const rows = o.fresh ? await fresh() : await recent();
    const open = openFor(rows, normReg(reg));
    return { unlocked: Boolean(open), since: open ? open.unlockedAt : "" };
  }

  // A student enters a code. Opens their quiz, or throws a QuizCodeError that is safe to show them.
  function redeem(codeInput, regInput) {
    return queued(async () => {
      const reg = normReg(regInput);
      const want = normCode(codeInput);
      if (!want) throw new QuizCodeError(400, "Enter your quiz code.", { code: "Enter your quiz code." });
      const rows = await fresh();
      const row = rows.find((r) => normCode(r.code) === want) || null;
      const open = openFor(rows, reg);

      if (open) {
        // Typing the same code again (a refresh, another device) is fine: the quiz is already open.
        if (row && row.n === open.n) return { unlocked: true, already: true };
        throw new QuizCodeError(409, "Your quiz is already unlocked. Finish it first. You will need a new code to take the quiz again.");
      }
      if (!row || row.status !== STATUS.UNUSED || (row.forReg && row.forReg !== reg)) {
        throw new QuizCodeError(400, BAD_CODE, { code: BAD_CODE });
      }
      await store.writeTabCells("quizcodes", row.n, {
        [COL.status]: STATUS.UNLOCKED,
        [COL.usedBy]: reg,
        [COL.unlockedAt]: stamp(),
      });
      forget();
      return { unlocked: true, already: false };
    });
  }

  // The student's quiz result has been saved: the open code is spent and the quiz locks again.
  // Returns the code that was spent, or null when the student had none open.
  function complete(regInput) {
    return queued(async () => {
      const reg = normReg(regInput);
      const open = openFor(await fresh(), reg);
      if (!open) return null;
      await store.writeTabCells("quizcodes", open.n, { [COL.status]: STATUS.COMPLETED, [COL.completedAt]: stamp() });
      forget();
      return open.code;
    });
  }

  // ---------- The dashboard (admin, or a role given the "quizcodes" access) ----------

  // Make `count` new codes, optionally all for one registration number. Returns them with the time they were made.
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
      if (Object.keys(errors).length) throw new QuizCodeError(400, "Please fix the highlighted fields.", errors);

      const taken = new Set((await fresh()).map((r) => normCode(r.code)));
      const at = stamp();
      const by = (actor && actor.username) || "";
      const made = [];
      for (let i = 0; i < count; i++) {
        let code;
        let guard = 0;
        do { code = makeCode(random); } while (taken.has(normCode(code)) && ++guard < 100);
        if (taken.has(normCode(code))) throw new QuizCodeError(500, "Could not make a new code. Please try again.");
        taken.add(normCode(code));
        made.push([code, at, by, forReg, STATUS.UNUSED, "", "", "", ""]);
      }
      await store.appendTabRows("quizcodes", made);
      forget();
      return { codes: made.map((r) => ({ code: r[COL.code], createdAt: at, createdBy: by, forReg })) };
    });
  }

  // Every code, newest first.
  async function list() {
    return (await fresh()).map(publicCode).reverse();
  }

  // Cancel a code that has not been finished. If its student is in the middle of the quiz, their quiz locks.
  function revoke(codeInput, actor) {
    return queued(async () => {
      const want = normCode(codeInput);
      const row = want ? (await fresh()).find((r) => normCode(r.code) === want) : null;
      if (!row) throw new QuizCodeError(404, "That code could not be found.");
      if (row.status === STATUS.COMPLETED) throw new QuizCodeError(409, "This code was already used to finish a quiz, so there is nothing to cancel.");
      if (row.status === STATUS.REVOKED) return { code: row.code, status: STATUS.REVOKED, wasOpen: false };
      const by = (actor && actor.username) || "";
      await store.writeTabCells("quizcodes", row.n, { [COL.status]: STATUS.REVOKED, [COL.revoked]: by + ", " + stamp() });
      forget();
      return { code: row.code, status: STATUS.REVOKED, wasOpen: row.status === STATUS.UNLOCKED };
    });
  }

  return { accessFor, redeem, complete, generate, list, revoke };
}

module.exports = { create, makeCode, normCode, HEADERS, COL, STATUS, STATUS_LIST, MAX_AT_ONCE, BAD_CODE, QuizCodeError };
