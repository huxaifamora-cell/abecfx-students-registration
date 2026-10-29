// Live-class attendance: a student counts as present when they were in the Google Meet class for at least
// PRESENT_PERCENT (50%) of its length.
//
// How time is measured: the portal opens the class's Meet link in its own window and, while that window is still
// open, sends a "heartbeat" every 30 seconds. Each heartbeat is a vote for the current minute, so two tabs or
// two devices never count a minute twice. Minutes are kept in memory while the class runs and written to the
// sheet in one batch every few minutes (and when the class is ended), so a busy class does not use up Google's
// write limits.
//
// Two sheet tabs (see sheets.js):
//   Classes     one row per class: id, title, Meet link, when it started and ended, and who started it.
//   Attendance  rows of "this student was present for N more minutes" (added up when a report is made).
//
// Only ONE class can be live at a time. A class is live from "Start class" until "End class" on the dashboard.
const crypto = require("crypto");

const CLASS_HEADERS = ["Class ID", "Title", "Meet Link", "Started At (Lagos)", "Started (UTC)", "Ended At (Lagos)", "Ended (UTC)", "Started By"];
const CLASS_COL = { id: 0, title: 1, link: 2, startedAt: 3, startedUtc: 4, endedAt: 5, endedUtc: 6, by: 7 };
const ATT_HEADERS = ["Class ID", "Reg Number", "Minutes Present (added)", "Recorded At (Lagos)"];
const ATT_COL = { classId: 0, reg: 1, minutes: 2, at: 3 };

const PRESENT_PERCENT = 50;
const MEET_LINK = /^https:\/\/meet\.google\.com\/[a-z0-9][a-z0-9?=&_.%-]*$/i;

class AttendanceError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
const oneLine = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

function fromClassRows(rows) {
  return rows
    .map(({ n, cells }) => ({
      n,
      id: String(cells[CLASS_COL.id] || "").trim(),
      title: cells[CLASS_COL.title] || "",
      link: cells[CLASS_COL.link] || "",
      startedAt: cells[CLASS_COL.startedAt] || "",
      startedUtc: String(cells[CLASS_COL.startedUtc] || "").trim(),
      endedAt: cells[CLASS_COL.endedAt] || "",
      endedUtc: String(cells[CLASS_COL.endedUtc] || "").trim(),
      by: cells[CLASS_COL.by] || "",
    }))
    .filter((c) => c.id);
}

// Percent of the class a student was present, from minutes present and the class length in minutes.
function percentOf(minutes, lengthMinutes) {
  if (!(lengthMinutes > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((minutes / lengthMinutes) * 100)));
}

// `store` needs tabRows / appendTabRows / writeTabCells for the "classes" and "attendance" tabs.
// Options: now() gives the Lagos time text, nowMs() the current time in milliseconds (the tests pass their own).
function create(store, opts = {}) {
  const stamp = opts.now || (() => new Date().toISOString());
  const nowMs = opts.nowMs || (() => Date.now());
  const percent = opts.presentPercent || PRESENT_PERCENT;
  let chain = Promise.resolve();
  // Changes to the class list go one at a time.
  const queued = (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };

  // The live class is remembered for a few seconds so heartbeats (many per second in a big class) do not read the sheet.
  let liveCache = { at: 0, cls: null };
  const LIVE_TTL = 10 * 1000;
  // Minutes seen for the live class that are not written to the sheet yet: classId -> reg -> Set of minute numbers.
  const seen = new Map();
  const flushed = new Map(); // classId -> reg -> how many of those minutes are already in the sheet

  async function readClasses() {
    return fromClassRows(await store.tabRows("classes"));
  }
  async function live() {
    if (liveCache.at && nowMs() - liveCache.at < LIVE_TTL) return liveCache.cls;
    const cls = (await readClasses()).find((c) => !c.endedUtc) || null;
    liveCache = { at: nowMs(), cls };
    return cls;
  }
  const forgetLive = () => { liveCache = { at: 0, cls: null }; };

  const minutesOf = (m) => (m ? m.size : 0);

  // ---------- Students ----------

  // A heartbeat from a student whose Meet window is open. Returns { live, minutes } for their portal.
  async function heartbeat(regInput, classId) {
    const reg = normReg(regInput);
    const cls = await live();
    if (!cls || cls.id !== String(classId || "")) return { live: false, minutes: 0 };
    if (!seen.has(cls.id)) seen.set(cls.id, new Map());
    const byReg = seen.get(cls.id);
    if (!byReg.has(reg)) byReg.set(reg, new Set());
    byReg.get(reg).add(Math.floor(nowMs() / 60000));
    return { live: true, minutes: byReg.get(reg).size };
  }

  // Write the minutes gathered since the last flush: one row per student, all in one request.
  async function flush() {
    const rows = [];
    const at = stamp();
    const marks = [];
    for (const [classId, byReg] of seen) {
      const done = flushed.get(classId) || new Map();
      for (const [reg, set] of byReg) {
        const delta = set.size - (done.get(reg) || 0);
        if (delta > 0) { rows.push([classId, reg, String(delta), at]); marks.push([classId, reg, set.size]); }
      }
    }
    if (!rows.length) return 0;
    await store.appendTabRows("attendance", rows);
    for (const [classId, reg, size] of marks) {
      if (!flushed.has(classId)) flushed.set(classId, new Map());
      flushed.get(classId).set(reg, size);
    }
    return rows.length;
  }

  // Minutes per student for one class: what is in the sheet plus what is still waiting to be written.
  async function minutesFor(classId) {
    const totals = new Map();
    for (const { cells } of await store.tabRows("attendance")) {
      if (String(cells[ATT_COL.classId] || "").trim() !== classId) continue;
      const reg = normReg(cells[ATT_COL.reg]);
      const m = parseInt(cells[ATT_COL.minutes], 10);
      if (reg && m > 0) totals.set(reg, (totals.get(reg) || 0) + m);
    }
    const byReg = seen.get(classId);
    if (byReg) {
      const done = flushed.get(classId) || new Map();
      for (const [reg, set] of byReg) {
        const pending = set.size - (done.get(reg) || 0);
        if (pending > 0) totals.set(reg, (totals.get(reg) || 0) + pending);
      }
    }
    return totals;
  }

  const lengthMinutes = (c) => {
    const start = Date.parse(c.startedUtc);
    const end = c.endedUtc ? Date.parse(c.endedUtc) : nowMs();
    if (Number.isNaN(start) || Number.isNaN(end)) return 0;
    return Math.max(1, Math.round((end - start) / 60000));
  };

  const publicClass = (c) => ({
    id: c.id, title: c.title, startedAt: c.startedAt, endedAt: c.endedAt, live: !c.endedUtc, lengthMinutes: lengthMinutes(c),
  });

  // What a student sees: the live class (with its Meet link) and their own record of every class.
  async function forStudent(regInput) {
    const reg = normReg(regInput);
    const classes = (await readClasses()).slice().reverse();
    const liveClass = classes.find((c) => !c.endedUtc) || null;
    const sums = new Map();
    for (const { cells } of await store.tabRows("attendance")) {
      if (normReg(cells[ATT_COL.reg]) !== reg) continue;
      const id = String(cells[ATT_COL.classId] || "").trim();
      const m = parseInt(cells[ATT_COL.minutes], 10);
      if (m > 0) sums.set(id, (sums.get(id) || 0) + m);
    }
    const history = classes.slice(0, 30).map((c) => {
      const pending = seen.get(c.id) && seen.get(c.id).get(reg) ? seen.get(c.id).get(reg).size - ((flushed.get(c.id) || new Map()).get(reg) || 0) : 0;
      const minutes = (sums.get(c.id) || 0) + Math.max(0, pending);
      const length = lengthMinutes(c);
      const pct = percentOf(minutes, length);
      return { ...publicClass(c), minutes: Math.min(minutes, length), percent: pct, present: pct >= percent };
    });
    return {
      threshold: percent,
      live: liveClass ? { id: liveClass.id, title: liveClass.title, link: liveClass.link, startedAt: liveClass.startedAt } : null,
      history,
    };
  }

  // ---------- The dashboard (admin, or a role given the "attendance" access) ----------

  function start(input, actor) {
    return queued(async () => {
      const b = input || {};
      const title = oneLine(b.title, 100);
      const link = String(b.link == null ? "" : b.link).trim();
      const errors = {};
      if (!title) errors.title = "Enter a name for the class, e.g. Week 3: Risk management.";
      if (!MEET_LINK.test(link) || link.length > 200) errors.link = "Paste the Google Meet link, e.g. https://meet.google.com/abc-defg-hij";
      if (Object.keys(errors).length) throw new AttendanceError(400, "Please fix the highlighted fields.", errors);
      forgetLive();
      if (await live()) throw new AttendanceError(409, "A class is already live. End it before starting another.");
      const id = "CL-" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
      await store.appendTabRows("classes", [[id, title, link, stamp(), new Date(nowMs()).toISOString(), "", "", (actor && actor.username) || ""]]);
      forgetLive();
      return publicClass((await live()) || { id, title, startedAt: stamp(), startedUtc: new Date(nowMs()).toISOString() });
    });
  }

  function end(actor) {
    return queued(async () => {
      forgetLive();
      const cls = await live();
      if (!cls) throw new AttendanceError(409, "No class is live right now.");
      await flush();
      await store.writeTabCells("classes", cls.n, { [CLASS_COL.endedAt]: stamp(), [CLASS_COL.endedUtc]: new Date(nowMs()).toISOString() });
      seen.delete(cls.id);
      flushed.delete(cls.id);
      forgetLive();
      return { ended: true, id: cls.id };
    });
  }

  async function list() {
    const classes = (await readClasses()).slice().reverse();
    const attendees = new Map();
    const sums = new Map();
    for (const { cells } of await store.tabRows("attendance")) {
      const id = String(cells[ATT_COL.classId] || "").trim();
      const reg = normReg(cells[ATT_COL.reg]);
      const m = parseInt(cells[ATT_COL.minutes], 10);
      if (!id || !reg || !(m > 0)) continue;
      if (!sums.has(id)) sums.set(id, new Map());
      sums.get(id).set(reg, (sums.get(id).get(reg) || 0) + m);
    }
    for (const c of classes) {
      const length = lengthMinutes(c);
      const m = sums.get(c.id) || new Map();
      if (seen.get(c.id)) {
        const done = flushed.get(c.id) || new Map();
        for (const [reg, set] of seen.get(c.id)) m.set(reg, (m.get(reg) || 0) + Math.max(0, set.size - (done.get(reg) || 0)));
      }
      attendees.set(c.id, { joined: m.size, present: [...m.values()].filter((x) => percentOf(x, length) >= percent).length });
    }
    return {
      threshold: percent,
      classes: classes.map((c) => ({ ...publicClass(c), meetLink: c.link, startedBy: c.by, ...(attendees.get(c.id) || { joined: 0, present: 0 }) })),
    };
  }

  // Everyone who was in one class, with minutes, percent and Present / Absent.
  async function report(classId) {
    const cls = (await readClasses()).find((c) => c.id === String(classId || ""));
    if (!cls) throw new AttendanceError(404, "That class could not be found.");
    const length = lengthMinutes(cls);
    const totals = await minutesFor(cls.id);
    const people = [...totals.entries()].map(([reg, m]) => {
      const minutes = Math.min(m, length);
      const pct = percentOf(minutes, length);
      return { reg, minutes, percent: pct, present: pct >= percent };
    });
    people.sort((a, b) => b.minutes - a.minutes || a.reg.localeCompare(b.reg));
    return { class: publicClass(cls), threshold: percent, people };
  }

  return { heartbeat, flush, forStudent, start, end, list, report, live };
}

module.exports = { create, percentOf, CLASS_HEADERS, ATT_HEADERS, CLASS_COL, ATT_COL, PRESENT_PERCENT, MEET_LINK, AttendanceError };
