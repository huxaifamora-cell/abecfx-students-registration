// Multi-FX: a student's progress, and the video / extra link of each workbook.
//
// Progress: two lists per student, saved on the "Multi-FX Progress" sheet tab (one row per student):
//   handbook sections marked as read, and workbooks marked as done. Each is counted against the number of sections
//   in multifx-content.js, so adding or removing a section needs no other change. The quiz is separate.
//
// Workbook media: the editor gives each workbook a YouTube video and, optionally, one extra link (a worksheet, a
// Google Drive file, an article...). They are kept on the "Multi-FX Workbook Media" tab and edited on the dashboard.
const { IDS } = require("./multifx-content");
const { videoId } = require("./videos");

const PROGRESS_HEADERS = [
  "Reg Number", "Full Name", "Handbook Sections Read", "Handbook Read (count)", "Workbooks Done", "Workbooks Done (count)", "Total Sections", "Updated At (Lagos)",
];
const PCOL = { reg: 0, name: 1, read: 2, readCount: 3, done: 4, doneCount: 5, total: 6, at: 7 };

const MEDIA_HEADERS = ["Section", "Section title", "YouTube video address", "Extra link title", "Extra link (https)"];
const MCOL = { id: 0, title: 1, video: 2, linkTitle: 3, link: 4 };

const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
const oneLine = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

// "00, 01,3" -> ["00","01","03"]. Tolerates hand edits in the sheet. Always in section order, never an unknown id.
function parseIds(cell) {
  const out = new Set();
  String(cell == null ? "" : cell).split(/[\s,;]+/).filter(Boolean).forEach((t) => {
    const id = /^\d{1,2}$/.test(t) ? t.padStart(2, "0") : t;
    if (IDS.includes(id)) out.add(id);
  });
  return IDS.filter((id) => out.has(id));
}

function summary(ids) {
  const list = IDS.filter((id) => ids.includes(id));
  return { ids: list, count: list.length, total: IDS.length, percent: IDS.length ? Math.round((list.length / IDS.length) * 100) : 0 };
}

// What a student sees: both lists and one overall percent (handbook and workbook count the same).
function view(readIds, doneIds) {
  const handbook = summary(readIds);
  const workbook = summary(doneIds);
  const total = handbook.total + workbook.total;
  const percent = total ? Math.round(((handbook.count + workbook.count) / total) * 100) : 0;
  return { handbook, workbook, percent };
}

// Clean a pasted extra link. Returns "" when empty, or { url } / { error }.
function cleanLink(raw) {
  const v = oneLine(raw, 400);
  if (!v) return { url: "" };
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v); } catch (e) { u = null; }
  if (!u || u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return { error: "Enter a full web address starting with https://" };
  return { url: u.href };
}

// input: { "00": { video, linkTitle, link }, ... } -> { values, errors: { "00": { video?, link? } } }
function sanitizeMedia(input) {
  const src = input && typeof input === "object" ? input : {};
  const values = {};
  const errors = {};
  for (const id of IDS) {
    const one = src[id] && typeof src[id] === "object" ? src[id] : {};
    const e = {};
    const out = { video: "", linkTitle: "", link: "" };
    const rawVideo = oneLine(one.video, 300);
    if (rawVideo) {
      const vid = videoId(rawVideo);
      if (!vid) e.video = "Paste a YouTube video address, e.g. https://youtu.be/abc123XYZ_0";
      else out.video = "https://youtu.be/" + vid;
    }
    const l = cleanLink(one.link);
    if (l.error) e.link = l.error; else out.link = l.url;
    out.linkTitle = oneLine(one.linkTitle, 80) || (out.link ? "Open the extra material" : "");
    if (!out.link) out.linkTitle = "";
    values[id] = out;
    if (Object.keys(e).length) errors[id] = e;
  }
  return { values, errors };
}

// `store` needs tabRows / appendTabRows / writeTabCells for the "mfxprogress" and "mfxmedia" tabs.
function create(store, opts = {}) {
  const stamp = opts.now || (() => new Date().toISOString());
  const progressTtl = opts.progressTtl == null ? 4000 : opts.progressTtl;
  const mediaTtl = opts.mediaTtl == null ? 30000 : opts.mediaTtl;
  let pCache = { at: 0, rows: [] };
  let mCache = { at: 0, values: null };
  let chain = Promise.resolve();
  const queued = (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };

  async function progressRows(fresh) {
    if (!fresh && pCache.at && Date.now() - pCache.at < progressTtl) return pCache.rows;
    pCache = { at: Date.now(), rows: await store.tabRows("mfxprogress") };
    return pCache.rows;
  }
  const rowOf = (rows, reg) => rows.find((r) => normReg(r.cells[PCOL.reg]) === reg) || null;

  async function progressFor(regInput) {
    const row = rowOf(await progressRows(false), normReg(regInput));
    return view(row ? parseIds(row.cells[PCOL.read]) : [], row ? parseIds(row.cells[PCOL.done]) : []);
  }

  // kind: "handbook" (a section read) or "workbook" (a workbook done). Returns the student's new progress, or null for an unknown section.
  function saveProgress(regInput, fullName, kind, id, on) {
    return queued(async () => {
      if (!IDS.includes(id) || (kind !== "handbook" && kind !== "workbook")) return null;
      const reg = normReg(regInput);
      const row = rowOf(await progressRows(true), reg); // fresh, so two devices never overwrite each other
      const read = row ? parseIds(row.cells[PCOL.read]) : [];
      const done = row ? parseIds(row.cells[PCOL.done]) : [];
      const list = kind === "handbook" ? read : done;
      const next = IDS.filter((x) => (x === id ? on : list.includes(x)));
      if (kind === "handbook") read.splice(0, read.length, ...next); else done.splice(0, done.length, ...next);
      if (!row && !on) return view(read, done); // nothing to un-mark and no row yet: do not create one
      const r = summary(read);
      const d = summary(done);
      const cells = {
        [PCOL.name]: fullName || "", [PCOL.read]: r.ids.join(","), [PCOL.readCount]: String(r.count),
        [PCOL.done]: d.ids.join(","), [PCOL.doneCount]: String(d.count), [PCOL.total]: String(IDS.length), [PCOL.at]: stamp(),
      };
      if (row) {
        // Only touch the sheet when something changed (tapping "mark as read" twice must not rewrite the row).
        if (next.join(",") !== (kind === "handbook" ? parseIds(row.cells[PCOL.read]) : parseIds(row.cells[PCOL.done])).join(",")) {
          await store.writeTabCells("mfxprogress", row.n, cells);
        }
      } else {
        await store.appendTabRows("mfxprogress", [[reg, cells[PCOL.name], cells[PCOL.read], cells[PCOL.readCount], cells[PCOL.done], cells[PCOL.doneCount], cells[PCOL.total], cells[PCOL.at]]]);
      }
      pCache = { at: 0, rows: [] };
      return view(read, done);
    });
  }

  // ---------- Workbook media ----------
  async function readMedia(fresh) {
    if (!fresh && mCache.values && Date.now() - mCache.at < mediaTtl) return mCache.values;
    const out = {};
    for (const id of IDS) out[id] = { video: "", linkTitle: "", link: "" };
    for (const { cells } of await store.tabRows("mfxmedia")) {
      const k = String(cells[MCOL.id] || "").trim().padStart(2, "0");
      if (!out[k]) continue;
      out[k] = { video: String(cells[MCOL.video] || "").trim(), linkTitle: String(cells[MCOL.linkTitle] || "").trim(), link: String(cells[MCOL.link] || "").trim() };
    }
    // a hand-typed bad address is dropped, not shown
    const clean = sanitizeMedia(out);
    for (const id of IDS) {
      const bad = clean.errors[id] || {};
      if (bad.video) clean.values[id].video = "";
      if (bad.link) { clean.values[id].link = ""; clean.values[id].linkTitle = ""; }
    }
    mCache = { at: Date.now(), values: clean.values };
    return clean.values;
  }

  // Save every workbook's media at once. `titles` is { id: section title } for the sheet's second column.
  function saveMedia(input, titles) {
    return queued(async () => {
      const { values, errors } = sanitizeMedia(input);
      if (Object.keys(errors).length) { const err = new Error("Please fix the highlighted fields."); err.status = 400; err.fields = errors; throw err; }
      const rows = await store.tabRows("mfxmedia");
      const appendRows = [];
      for (const id of IDS) {
        const v = values[id];
        const row = rows.find((r) => String(r.cells[MCOL.id] || "").trim().padStart(2, "0") === id);
        const title = (titles && titles[id]) || "";
        if (row) {
          const changes = {};
          if (row.cells[MCOL.title] !== title) changes[MCOL.title] = title;
          if (row.cells[MCOL.video] !== v.video) changes[MCOL.video] = v.video;
          if (row.cells[MCOL.linkTitle] !== v.linkTitle) changes[MCOL.linkTitle] = v.linkTitle;
          if (row.cells[MCOL.link] !== v.link) changes[MCOL.link] = v.link;
          if (Object.keys(changes).length) await store.writeTabCells("mfxmedia", row.n, changes);
        } else if (v.video || v.link) {
          appendRows.push([id, title, v.video, v.linkTitle, v.link]);
        }
      }
      if (appendRows.length) await store.appendTabRows("mfxmedia", appendRows);
      mCache = { at: 0, values: null };
      return values;
    });
  }

  // What a signed-in student gets: section id -> { video: the 11-character YouTube id or "", resource: { title, url } or null }.
  function forStudents(values) {
    const out = {};
    for (const id of IDS) {
      const v = (values && values[id]) || {};
      out[id] = { video: videoId(v.video) || "", resource: v.link ? { title: v.linkTitle || "Open the extra material", url: v.link } : null };
    }
    return out;
  }

  return { progressFor, saveProgress, readMedia, saveMedia, forStudents };
}

module.exports = { create, parseIds, summary, view, sanitizeMedia, PROGRESS_HEADERS, PCOL, MEDIA_HEADERS, MCOL };
