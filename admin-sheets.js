// The editor dashboard's "Sheets" view: look at the Google Sheet tabs and change them without leaving /admin.
//
// Every change is checked HERE, never trusted from the browser, and uses the same rules as the rest of the
// site (the registration form, the status list, the links and video checks). What the editor may do differs
// per tab, on purpose:
//   Students        edit most columns. The registration number, the sign-up time and the mentorship code used are
//                   locked, and rows cannot be deleted here, because the number is used by photos, quiz results
//                   and progress and must never be handed out twice. (Delete in Google Sheets if you must.)
//   Mentorship Codes  add codes (many at once), edit, and delete codes that have not been used yet.
//   Quiz Results, Handbook Progress   look, and delete a row (e.g. a test attempt). Scores are not editable.
//   Site Links, Chapter Videos        change the Value column only, with the same checks as their own dashboard tabs.
// The Photos tab is not shown at all.
//
// A row is only changed when it still matches what the editor was looking at (`original`). If someone else
// changed or removed it in the meantime, the change is refused and the editor reloads, so a stale screen can
// never write over the wrong row.

const countries = require("./countries");
const states = require("./states.json");
const idrules = require("./idrules");
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

function create(store) {
  const TABS = {
    students: {
      label: "Students",
      help: "One row per student. The registration number, sign-up time and mentorship code are locked. To change a student's photo or remove a student, use Google Sheets.",
      editable: [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13],
      selects: { 2: countries, 7: GENDERS, 9: store.STATUSES },
      placeholders: { 10: "e.g. 15 Oct 2026", 11: "YYYY-MM-DD (new date renews an expired ID)", 13: "YYYY-MM-DD" },
      newestFirst: true,
      needsRows: true,
      check(p, cur, rows) {
        const errors = {};
        const changed = (i) => p[i] !== cur[i];
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
    },

    codes: {
      label: "Mentorship codes",
      help: "A code works once. Add new codes here (or type them in the sheet). A code that a student has used is kept as a record and cannot be deleted.",
      editable: [0, 2, 3],
      selects: {},
      placeholders: { 2: "ABECFX/26/0001 (empty = not used)", 3: "e.g. 15 Oct 2026, 10:30:00" },
      newestFirst: true,
      needsRows: true,
      add: { label: "Add codes", help: "Type or paste new codes: one per line, or separated by commas. Letters, numbers, - and _ only, 4 to 40 characters. Letters are made capital." },
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
      removeBlock: (cur) => ((cur[2] || "").trim() ? "This code has already been used by a student, so it is kept as a record." : ""),
      // text -> rows to append
      prepareAdd(text, rows) {
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
      help: "Every finished quiz attempt. Scores cannot be edited. You can delete a row, for example a test attempt.",
      editable: [],
      selects: {},
      newestFirst: true,
      canDelete: true,
    },

    progress: {
      label: "Handbook progress",
      help: "Which handbook chapters each student has marked as read. Delete a row to reset that student's progress.",
      editable: [],
      selects: {},
      newestFirst: false,
      canDelete: true,
    },

    links: {
      label: "Site links",
      help: "The icons and text shown on the website. Only the Value column can be changed, with the same checks as the Site links tab.",
      editable: [2],
      selects: {},
      multiline: [2],
      newestFirst: false,
      check(p, cur) {
        const key = (cur[0] || "").trim().toLowerCase();
        if (!links.FIELDS.some((f) => f.key === key)) return { 2: "This row is not one of the website's links, so it cannot be changed here." };
        const out = links.sanitize({ [key]: p[2] });
        if (out.errors[key]) return { 2: out.errors[key] };
        p[2] = out.values[key];
        return {};
      },
    },

    videos: {
      label: "Chapter videos",
      help: "The YouTube video for each handbook chapter. Only the address can be changed, with the same checks as the Chapter videos tab.",
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

  const ORDER = ["students", "codes", "quiz", "progress", "links", "videos"];

  function tabOf(key) {
    if (!Object.prototype.hasOwnProperty.call(TABS, key)) throw new AdminError(404, "That sheet could not be found.");
    return TABS[key];
  }

  function rowNumber(n) {
    const v = Number(n);
    if (!Number.isInteger(v) || v < 2 || v > 1000000) throw new AdminError(400, "That row could not be found.");
    return v;
  }

  function describe(key) {
    const t = TABS[key];
    return {
      key,
      label: t.label,
      help: t.help,
      headers: store.EDITOR_TABS[key].headers,
      editable: t.editable,
      selects: t.selects || {},
      multiline: t.multiline || [],
      placeholders: t.placeholders || {},
      add: t.add || null,
      canDelete: Boolean(t.canDelete || t.removeBlock),
      newestFirst: Boolean(t.newestFirst),
    };
  }

  const same = (a, b) => String(a == null ? "" : a).trim() === String(b == null ? "" : b).trim();
  function assertUnchanged(current, original, width) {
    const ok = Array.isArray(original) && current.length === width && current.every((c, i) => same(c, original[i]));
    if (!ok) {
      throw new AdminError(409, "This row was changed or removed in the sheet since you opened it. The latest version has been loaded.");
    }
  }

  async function otherRows(key, skipN) {
    return (await store.tabRows(key)).filter((r) => r.n !== skipN).map((r) => r.cells);
  }

  return {
    TABS,
    ORDER,

    // What the dashboard needs to draw the tab picker and the forms.
    meta() {
      return { sheets: ORDER.map(describe), sheetUrl: store.sheetUrl ? store.sheetUrl() : "" };
    },

    async read(key) {
      tabOf(key);
      return { ...describe(key), rows: await store.tabRows(key) };
    },

    async update(key, n, original, values) {
      const t = tabOf(key);
      if (!t.editable.length) throw new AdminError(403, "This sheet cannot be edited here.");
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
      await store.writeTabCells(key, n, changes);
      return { row: p, changed: true };
    },

    async add(key, text) {
      const t = tabOf(key);
      if (!t.add) throw new AdminError(403, "Rows cannot be added to this sheet here.");
      const rows = t.prepareAdd(text, await otherRows(key, -1));
      await store.appendTabRows(key, rows);
      return { added: rows.length };
    },

    async remove(key, n, original) {
      const t = tabOf(key);
      if (!(t.canDelete || t.removeBlock)) throw new AdminError(403, "Rows cannot be deleted from this sheet here.");
      n = rowNumber(n);
      const width = store.EDITOR_TABS[key].headers.length;
      const current = await store.tabRow(key, n);
      assertUnchanged(current, original, width);
      const blocked = t.removeBlock ? t.removeBlock(current) : "";
      if (blocked) throw new AdminError(400, blocked);
      await store.deleteTabRow(key, n);
      return { ok: true };
    },
  };
}

module.exports = { create, AdminError };
