// The editor dashboard's "Database" view: browse, search, add, edit and delete the records behind the website
// (students, mentorship codes, quiz results, handbook progress, site links, chapter videos) without opening
// Google Sheets. The records are stored in the Google Sheet; this file decides what may be done to each table.
//
// Every change is checked HERE, never trusted from the browser, with the same rules as the rest of the site
// (registration form, status list, grading, handbook chapters, link and video checks).
//
//   Students          create (number, sign-up time and ID date are filled in for you), edit, delete.
//                     Locked: registration number, sign-up time, mentorship code used.
//                     Deleting a student also deletes their photo, quiz results and handbook progress, and their
//                     number is never given to anyone else (new numbers go past every number ever recorded).
//   Mentorship codes  create (many at once), edit, delete. A code that a student used cannot be renamed.
//   Quiz results      create (for a registered student), edit score and total (percent and grade follow), delete.
//   Handbook progress create (one row per registered student), edit the chapters read (count and percent follow), delete.
//   Site links, Chapter videos   fixed rows (the website looks them up by name): edit the Value only.
// The Photos tab is never listed.
//
// A row is only changed when it still matches what the editor was looking at (`original`). If someone else
// changed or removed it in the meantime, the change is refused and the editor reloads, so a stale screen can
// never write over the wrong row.

const countries = require("./countries");
const states = require("./states.json");
const idrules = require("./idrules");
const grading = require("./grading");
const progress = require("./handbook-progress");
const handbook = require("./handbook-content");
const links = require("./links");
const videos = require("./videos");

const GENDERS = ["Male", "Female"];
const REG_RE = /^ABECFX\/\d{2}\/\d{4}$/;
const CODE_RE = /^[A-Z0-9_-]{4,40}$/;
const MAX_CODES_AT_ONCE = 200;
const MAX_CELL = 5000;

class AdminError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null; // { columnIndex: message }
  }
}

// One line, no control characters, trimmed and capped.
function clean(v, max = 120) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function lagosTimestamp() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "medium" }).format(new Date());
}

function realDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const normReg = (v) => clean(v, 20).toUpperCase().replace(/\s+/g, "");
const same = (a, b) => String(a == null ? "" : a).trim() === String(b == null ? "" : b).trim();

function create(store) {
  const rowsOf = async (key) => (await store.tabRows(key)).map((r) => r.cells);
  const findStudent = async (reg) => (await rowsOf("students")).find((r) => (r[0] || "").toUpperCase() === reg);

  const TABS = {
    students: {
      label: "Students",
      help: "One row per person. Status says whether they hold a Student ID (Uncertified, Certified) or none (Not a student). Tick Staff Member and/or Alumni Member to give them those ID cards too; only Certified students get a certificate. The sign-up time and mentorship code are locked. If you change a registration number, their photo, signature, quiz results, handbook progress and code records are updated to the new number automatically. A student's photo can only be added when the student registers.",
      editable: [0, 2, 3, 4, 5, 6, 7, 9, 16, 17, 14, 10, 11, 12, 13, 15],
      selects: { 2: countries, 7: GENDERS, 9: store.STATUSES, 15: ["", "Yes"], 16: ["", "Yes"], 17: ["", "Yes"] },
      placeholders: { 16: "Yes gives a Staff ID card (a student can also be a staff member)", 17: "Yes gives an Alumni ID card", 0: "ABECFX/26/0001 (changing it updates their photo, signature, quiz results and progress too)", 14: "e.g. Mentor, CEO, Support Staff", 10: "e.g. 15 Oct 2026", 11: "YYYY-MM-DD (a new date renews an expired ID)", 13: "YYYY-MM-DD" },
      newestFirst: true,
      needsRows: true,
      create: {
        label: "Add student",
        help: "The registration number, sign-up time and ID issue date are filled in for you. A student added here has no photo, so the ID card shows their initials.",
        fields: [2, 12, 3, 4, 5, 6, 7, 13, 9, 16, 17, 14, 10],
        defaults: { 3: "Forex Course", 9: "Uncertified" },
      },
      deleteWarning: "This also deletes the student's photo, quiz results and handbook progress, and cannot be undone. Their registration number will never be given to anyone else.",
      check(p, cur, rows) {
        const errors = {};
        const changed = (i) => p[i] !== cur[i];
        if (changed(0) && cur[0] != null) {
          p[0] = normReg(p[0]);
          if (!REG_RE.test(p[0])) errors[0] = "Use the format ABECFX/26/0001 (ABECFX, a slash, the 2-digit year, a slash, a 4-digit number).";
          else if (rows.some((r) => (r[0] || "").trim().toUpperCase() === p[0])) errors[0] = "Another student already has this registration number.";
        }
        if (changed(2)) {
          p[2] = clean(p[2]);
          if (!countries.includes(p[2])) errors[2] = "Choose a country from the list.";
        }
        if (changed(2) || changed(12)) {
          p[12] = clean(p[12], 60);
          if (!errors[2]) {
            const list = states[p[2]];
            if (list) {
              if (!list.includes(p[12])) errors[12] = "Choose a state or region that belongs to " + p[2] + ".";
            } else if (p[12].length < 2) {
              errors[12] = "Enter the state, province or region.";
            }
          }
        }
        if (changed(3)) {
          p[3] = clean(p[3]);
          if (!p[3]) errors[3] = "Enter the programme.";
        }
        if (changed(4)) {
          p[4] = clean(p[4]);
          if (p[4].length < 3 || !/\s/.test(p[4])) errors[4] = "Enter the full name (first and last name).";
        }
        if (changed(5)) {
          p[5] = clean(p[5], 254).toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p[5])) errors[5] = "Enter a valid email address.";
          else if (rows.some((r) => (r[5] || "").toLowerCase() === p[5])) errors[5] = "Another student already uses this email address.";
        }
        if (changed(6)) {
          p[6] = clean(p[6], 25);
          const digits = p[6].replace(/[^\d]/g, "");
          if (!/^\+?[\d\s\-()]+$/.test(p[6]) || digits.length < 7 || digits.length > 15) {
            errors[6] = "Enter a WhatsApp number with country code, e.g. +234 801 234 5678.";
          }
        }
        if (changed(7)) {
          p[7] = clean(p[7]);
          if (!GENDERS.includes(p[7])) errors[7] = "Choose Male or Female.";
        }
        if (changed(9)) {
          p[9] = clean(p[9]);
          if (!store.STATUSES.includes(p[9])) errors[9] = "Choose a status from the list.";
        }
        // Staff Member and Alumni Member are ticks: Yes, or empty. Each tick gives that person that ID card.
        for (const i of [16, 17]) {
          if (changed(i)) {
            p[i] = clean(p[i], 10);
            if (p[i] && !idrules.isTick(p[i])) errors[i] = "Choose Yes, or leave it empty.";
            else p[i] = p[i] ? "Yes" : "";
          }
        }
        if (!errors[9] && !errors[16] && !errors[17]) {
          const k = idrules.idKinds(p);
          // The role only exists for a Staff Member: it is required for them and cleared for everyone else.
          if (k.staff) {
            p[14] = clean(p[14], 40);
            if (p[14].length < 2) errors[14] = "Type this staff member's role, e.g. Mentor, CEO or Support Staff.";
          } else {
            p[14] = "";
          }
          // "Not a student" means no Student ID, so the person must hold some other card.
          if (p[9] === "Not a student" && !k.staff && !k.alumni) {
            errors[9] = "A person with no Student ID must be ticked as a Staff Member or an Alumni Member (columns Staff Member / Alumni Member). Otherwise they have no ID card at all.";
          }
        }
        if (changed(15)) {
          p[15] = clean(p[15], 10);
          if (p[15] && p[15].toLowerCase() !== "yes") errors[15] = "Choose Yes, or leave it empty.";
          else if (p[15]) p[15] = "Yes";
        }
        if (changed(10)) p[10] = clean(p[10], 40);
        if (changed(11)) {
          p[11] = clean(p[11], 10);
          if (p[11] && !(realDate(p[11]) && p[11] >= "2000-01-01" && p[11] <= "2100-12-31")) errors[11] = "Enter a real date as YYYY-MM-DD, or leave it empty.";
        }
        if (changed(13)) {
          p[13] = clean(p[13], 10);
          if (p[13] && !(realDate(p[13]) && p[13] >= "1920-01-01" && p[13] <= idrules.lagosToday())) {
            errors[13] = "Enter a real date of birth as YYYY-MM-DD (not in the future), or leave it empty.";
          }
        }
        return errors;
      },
      // Fill in what the website normally fills in, then return the new row.
      async build(p) {
        const [students, codes] = await Promise.all([rowsOf("students"), rowsOf("codes")]);
        const yy = idrules.lagosToday().slice(2, 4);
        const prefix = `ABECFX/${yy}/`;
        let max = 0;
        // Past every number ever recorded (students AND the codes' "used by"), so a deleted student's number is never reused.
        for (const reg of students.map((r) => r[0]).concat(codes.map((r) => r[2]))) {
          const r = String(reg || "").trim().toUpperCase();
          if (r.startsWith(prefix)) { const n = parseInt(r.slice(prefix.length), 10); if (n > max) max = n; }
        }
        if (max >= 9999) throw new AdminError(400, "This year's registration numbers are used up.");
        p[0] = prefix + String(max + 1).padStart(4, "0");
        p[1] = lagosTimestamp();
        p[8] = "";
        p[11] = p[11] || idrules.lagosToday();
        if (p[9] !== "Uncertified" && !p[10]) p[10] = idrules.formatISO(idrules.lagosToday());
        return p;
      },
      async cascade(row) {
        const reg = (row[0] || "").trim().toUpperCase();
        if (!reg) return;
        await store.deleteTabRowsByReg("photos", reg, 0);
        await store.deleteTabRowsByReg("signatures", reg, 0);
        await store.deleteTabRowsByReg("dobchanges", reg, 0);
        await store.deleteTabRowsByReg("quiz", reg, 1);
        await store.deleteTabRowsByReg("progress", reg, 0);
      },
    },

    codes: {
      label: "Mentorship codes",
      help: "A code works once. A code that a student has used cannot be renamed.",
      editable: [0, 2, 3],
      selects: {},
      placeholders: { 2: "ABECFX/26/0001 (empty = not used)", 3: "e.g. 15 Oct 2026, 10:30:00" },
      newestFirst: true,
      needsRows: true,
      create: { label: "Add codes", mode: "text", help: "Type or paste new codes: one per line, or separated by commas. Letters, numbers, - and _ only, 4 to 40 characters. Letters are made capital." },
      deleteWarning: "If a student used this code, the record of who used it is lost. The student keeps their account.",
      check(p, cur, rows) {
        const errors = {};
        if (p[0] !== cur[0]) {
          p[0] = clean(p[0], 40).toUpperCase();
          if ((cur[2] || "").trim()) errors[0] = "This code has already been used, so its name cannot be changed.";
          else if (!CODE_RE.test(p[0])) errors[0] = "Use 4 to 40 letters, numbers, - or _.";
          else if (rows.some((r) => (r[0] || "").trim().toUpperCase() === p[0])) errors[0] = "This code is already in the list.";
        }
        if (p[2] !== cur[2]) {
          p[2] = clean(p[2], 20).toUpperCase();
          if (p[2] && !REG_RE.test(p[2])) errors[2] = "Enter a registration number like ABECFX/26/0001, or leave it empty.";
        }
        if (p[3] !== cur[3]) p[3] = clean(p[3], 40);
        if (!p[2]) p[3] = ""; // an unused code has no "used at" time
        return errors;
      },
      // text -> rows to append
      prepareText(text, rows) {
        const wanted = String(text == null ? "" : text).split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
        if (!wanted.length) throw new AdminError(400, "Type at least one code.");
        if (wanted.length > MAX_CODES_AT_ONCE) throw new AdminError(400, "Add at most " + MAX_CODES_AT_ONCE + " codes at a time.");
        const bad = wanted.filter((c) => !CODE_RE.test(c));
        if (bad.length) throw new AdminError(400, "These are not valid codes (use 4 to 40 letters, numbers, - or _): " + bad.slice(0, 5).join(", ") + (bad.length > 5 ? "..." : ""));
        const have = new Set(rows.map((r) => (r[0] || "").trim().toUpperCase()));
        const seen = new Set();
        const dup = [];
        for (const c of wanted) {
          if (have.has(c) || seen.has(c)) dup.push(c);
          seen.add(c);
        }
        if (dup.length) throw new AdminError(400, "Already in the list or typed twice: " + [...new Set(dup)].slice(0, 5).join(", ") + (dup.length > 5 ? "..." : ""));
        const at = lagosTimestamp();
        return [...seen].map((c) => [c, at, "", ""]);
      },
    },

    quiz: {
      label: "Quiz results",
      help: "Every finished quiz attempt. Edit the score or total and the percent and grade follow. Adding a result needs a registered student.",
      editable: [3, 4],
      selects: {},
      placeholders: { 3: "Questions answered correctly", 4: "Number of questions in the quiz" },
      newestFirst: true,
      canDelete: true,
      create: { label: "Add result", help: "Enter the student's registration number, the score and the total. The name, percent, grade and attempt number are worked out for you.", fields: [1, 3, 4] },
      deleteWarning: "This quiz result is removed for good.",
      check(p) {
        const errors = {};
        const score = Number(p[3]), total = Number(p[4]);
        if (!/^\d{1,3}$/.test(clean(p[3], 4)) || !Number.isInteger(score)) errors[3] = "Enter the score as a whole number.";
        if (!/^\d{1,3}$/.test(clean(p[4], 4)) || !Number.isInteger(total) || total < 1 || total > 500) errors[4] = "Enter the total number of questions (1 to 500).";
        if (!errors[3] && !errors[4] && score > total) errors[3] = "The score cannot be more than the total.";
        if (Object.keys(errors).length) return errors;
        const pct = grading.percent(score, total);
        p[3] = String(score); p[4] = String(total); p[5] = String(pct); p[6] = grading.gradeFor(pct).grade;
        return {};
      },
      async prepare(p) {
        const reg = normReg(p[1]);
        if (!REG_RE.test(reg)) throw new AdminError(400, "Please fix the highlighted fields.", { 1: "Enter a registration number like ABECFX/26/0001." });
        const stu = await findStudent(reg);
        if (!stu) throw new AdminError(400, "Please fix the highlighted fields.", { 1: "No student has this registration number." });
        const errors = this.check(p, []);
        if (Object.keys(errors).length) throw new AdminError(400, "Please fix the highlighted fields.", errors);
        const mine = (await rowsOf("quiz")).filter((q) => (q[1] || "").toUpperCase() === reg);
        return [lagosTimestamp(), reg, stu[4] || "", p[3], p[4], p[5], p[6], String(mine.length + 1), "admin", "{}", new Date().toISOString()];
      },
    },

    progress: {
      label: "Handbook progress",
      help: "Which handbook chapters each student has marked as read (00 is the introduction, 01 to 12 the chapters). Count and percent follow the chapters you list.",
      editable: [2],
      selects: {},
      placeholders: { 2: "e.g. 00, 01, 02" },
      newestFirst: false,
      canDelete: true,
      create: { label: "Add progress", help: "Choose a registered student who has no progress row yet, and list the chapters read, e.g. 00, 01, 02. Leave it empty for none.", fields: [0, 2] },
      deleteWarning: "This resets the student's handbook progress to nothing.",
      check(p) {
        const tokens = String(p[2] == null ? "" : p[2]).split(/[\s,;]+/).filter(Boolean);
        const bad = tokens.filter((t) => !handbook.IDS.includes(/^\d{1,2}$/.test(t) ? t.padStart(2, "0") : t));
        if (bad.length) return { 2: "Not a chapter: " + bad.slice(0, 5).join(", ") + ". Use " + handbook.IDS[0] + " to " + handbook.IDS[handbook.IDS.length - 1] + "." };
        const sum = progress.summary(progress.parseRead(tokens.join(",")));
        p[2] = sum.read.join(",");
        p[3] = String(sum.count); p[4] = String(sum.total); p[5] = String(sum.percent); p[6] = lagosTimestamp();
        return {};
      },
      async prepare(p) {
        const reg = normReg(p[0]);
        if (!REG_RE.test(reg)) throw new AdminError(400, "Please fix the highlighted fields.", { 0: "Enter a registration number like ABECFX/26/0001." });
        const stu = await findStudent(reg);
        if (!stu) throw new AdminError(400, "Please fix the highlighted fields.", { 0: "No student has this registration number." });
        if ((await rowsOf("progress")).some((r) => (r[0] || "").toUpperCase() === reg)) {
          throw new AdminError(400, "Please fix the highlighted fields.", { 0: "This student already has a progress row. Edit that row instead." });
        }
        const row = [reg, stu[4] || "", p[2] || "", "", "", "", ""];
        const e = this.check(row); // fills in count, total, percent and time
        if (Object.keys(e).length) throw new AdminError(400, "Please fix the highlighted fields.", { 2: e[2] });
        return row;
      },
    },

    links: {
      label: "Site links",
      help: "The icons and text shown on the website. The rows are fixed (the website looks them up by name), so only the Value can be changed, with the same checks as the Site links tab.",
      editable: [2],
      selects: {},
      multiline: [2],
      newestFirst: false,
      check(p, cur) {
        const field = links.fieldFor(cur[0]);
        const key = field ? field.key : "";
        if (!field) return { 2: "This row is not one of the website's links, so it cannot be changed here." };
        const out = links.sanitize({ [key]: p[2] });
        if (out.errors[key]) return { 2: out.errors[key] };
        p[2] = out.values[key];
        return {};
      },
    },

    videos: {
      label: "Chapter videos",
      help: "The YouTube video for each handbook chapter. The rows are fixed (one per chapter), so only the address can be changed, with the same checks as the Chapter videos tab.",
      editable: [2],
      selects: {},
      placeholders: { 2: "https://youtu.be/..." },
      newestFirst: false,
      check(p, cur) {
        const key = (cur[0] || "").trim().padStart(2, "0");
        if (!videos.VIDEO_CHAPTERS.some((c) => c.id === key)) return { 2: "This row is not one of the handbook chapters, so it cannot be changed here." };
        const out = videos.sanitize({ [key]: p[2] });
        if (out.errors[key]) return { 2: out.errors[key] };
        p[2] = out.values[key];
        return {};
      },
    },
  };

  // Students first: they are what most editing is about.
  const ORDER = ["students", "codes", "quiz", "progress", "links", "videos"];

  function tabOf(key) {
    if (!Object.prototype.hasOwnProperty.call(TABS, key)) throw new AdminError(404, "That table could not be found.");
    return TABS[key];
  }

  function rowNumber(n) {
    const v = Number(n);
    if (!Number.isInteger(v) || v < 2 || v > 1000000) throw new AdminError(400, "That row could not be found.");
    return v;
  }

  function describe(key) {
    const t = TABS[key];
    const c = t.create;
    return {
      key,
      label: t.label,
      help: t.help,
      headers: store.EDITOR_TABS[key].headers,
      editable: t.editable,
      selects: t.selects || {},
      multiline: t.multiline || [],
      placeholders: t.placeholders || {},
      add: c ? { label: c.label, help: c.help, mode: c.mode || "form", fields: c.fields || [], defaults: c.defaults || {} } : null,
      canDelete: Boolean(t.canDelete || t.cascade || t.deleteWarning),
      deleteWarning: t.deleteWarning || "",
      newestFirst: Boolean(t.newestFirst),
    };
  }

  function assertUnchanged(current, original, width) {
    const ok = Array.isArray(original) && current.length === width && current.every((c, i) => same(c, original[i]));
    if (!ok) {
      throw new AdminError(409, "This row was changed or removed since you opened it. The latest version has been loaded.");
    }
  }

  async function otherRows(key, skipN) {
    return (await store.tabRows(key)).filter((r) => r.n !== skipN).map((r) => r.cells);
  }

  // Every place a registration number is stored besides the Students tab: [tab, column index].
  const REG_REFS = [["photos", 0], ["signatures", 0], ["dobchanges", 0], ["quiz", 1], ["progress", 0], ["codes", 2], ["quizcodes", 3], ["quizcodes", 5]];

  // A new number must not already appear anywhere as someone else's (including a deleted student's records).
  async function regConflict(newReg) {
    for (const [key, col] of REG_REFS) {
      const rows = await rowsOf(key);
      if (rows.some((r) => String((r && r[col]) || "").trim().toUpperCase() === newReg)) return store.EDITOR_TABS[key].title || key;
    }
    return "";
  }

  // Move everything that belongs to a registration number over to the new one. If a step fails, the steps
  // already done are put back, so a student is never left half-renamed.
  async function renameReg(oldReg, newReg) {
    const done = [];
    try {
      for (const [key, col] of REG_REFS) {
        await store.renameRegCells(key, col, oldReg, newReg);
        done.push([key, col]);
      }
    } catch (e) {
      console.error("Registration number change failed, undoing:", e.message);
      for (const [key, col] of done.reverse()) {
        try { await store.renameRegCells(key, col, newReg, oldReg); } catch (e2) { console.error("Could not undo", key, e2.message); }
      }
      throw new AdminError(500, "The registration number could not be changed everywhere, so nothing was changed. Please try again.");
    }
  }

  return {
    TABS,
    ORDER,

    // What the dashboard needs to draw the table picker and the forms.
    meta() {
      return { sheets: ORDER.map(describe), sheetUrl: store.sheetUrl ? store.sheetUrl() : "" };
    },

    async read(key) {
      tabOf(key);
      return { ...describe(key), rows: await store.tabRows(key) };
    },

    async update(key, n, original, values) {
      const t = tabOf(key);
      if (!t.editable.length) throw new AdminError(403, "This table cannot be edited here.");
      n = rowNumber(n);
      const width = store.EDITOR_TABS[key].headers.length;
      const current = await store.tabRow(key, n);
      assertUnchanged(current, original, width);

      const p = current.slice();
      const errors = {};
      for (const [k, raw] of Object.entries(values && typeof values === "object" ? values : {})) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= width) continue;
        const v = String(raw == null ? "" : raw).slice(0, MAX_CELL);
        if (t.editable.includes(i)) p[i] = v;
        else if (!same(v, current[i])) errors[i] = "This column is locked and cannot be changed here.";
      }
      if (!Object.keys(errors).length) {
        Object.assign(errors, t.check(p, current, t.needsRows ? await otherRows(key, n) : []));
      }
      if (Object.keys(errors).length) throw new AdminError(400, "Please fix the highlighted fields.", errors);

      const changes = {};
      p.forEach((v, i) => { if (v !== current[i]) changes[i] = v; });
      if (!Object.keys(changes).length) return { row: current, changed: false };
      const oldReg = String(current[0] || "").trim().toUpperCase();
      const renaming = key === "students" && changes[0] !== undefined && oldReg;
      if (renaming) {
        const where = await regConflict(p[0]);
        if (where) throw new AdminError(400, "Please fix the highlighted fields.", { 0: "This number is already recorded for someone else (in " + where + "), so it cannot be used." });
        await renameReg(oldReg, p[0]);
      }
      try {
        await store.writeTabCells(key, n, changes);
      } catch (e) {
        if (renaming) await renameReg(p[0], oldReg).catch(() => {});
        throw e;
      }
      return { row: p, changed: true };
    },

    // body: { text } for the codes table, { values: { columnIndex: text } } for everything else.
    async create(key, body) {
      const t = tabOf(key);
      const c = t.create;
      if (!c) throw new AdminError(403, "Rows cannot be added to this table here.");
      const b = body && typeof body === "object" ? body : {};
      if (c.mode === "text") {
        const rows = t.prepareText(b.text, await otherRows(key, -1));
        await store.appendTabRows(key, rows);
        return { added: rows.length };
      }
      const width = store.EDITOR_TABS[key].headers.length;
      const p = Array(width).fill("");
      Object.entries(c.defaults || {}).forEach(([i, v]) => { p[Number(i)] = v; });
      for (const [k, raw] of Object.entries(b.values && typeof b.values === "object" ? b.values : {})) {
        const i = Number(k);
        if (!c.fields.includes(i)) continue; // anything the form does not offer is ignored
        const v = String(raw == null ? "" : raw).slice(0, MAX_CELL);
        if (v.trim() || !(c.defaults && c.defaults[i])) p[i] = v;
      }
      let row;
      if (t.prepare) {
        row = await t.prepare(p);
      } else {
        // every column counts as "changed" when creating, so all of them are checked
        const errors = t.check(p, Array(width).fill(null), t.needsRows ? await otherRows(key, -1) : []);
        if (Object.keys(errors).length) throw new AdminError(400, "Please fix the highlighted fields.", errors);
        row = await t.build(p);
      }
      await store.appendTabRows(key, [row]);
      return { added: 1, row, ...(key === "students" ? { reg: row[0] } : {}) };
    },

    async remove(key, n, original) {
      const t = tabOf(key);
      if (!(t.canDelete || t.cascade || t.deleteWarning)) throw new AdminError(403, "Rows cannot be deleted from this table here.");
      n = rowNumber(n);
      const width = store.EDITOR_TABS[key].headers.length;
      const current = await store.tabRow(key, n);
      assertUnchanged(current, original, width);
      if (t.cascade) await t.cascade(current);
      await store.deleteTabRow(key, n);
      return { ok: true };
    },
  };
}

module.exports = { create, AdminError };
