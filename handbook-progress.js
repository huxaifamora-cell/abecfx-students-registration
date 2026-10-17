// A student's learning progress through the Mentorship Handbook.
// Progress = chapters marked as read / total chapters. The quiz is separate and does not count.
const { IDS } = require("./handbook-content");

// "00, 01,3" -> ["00","01","03"]. Tolerates hand edits in the sheet (numbers typed without a leading zero).
function parseRead(cell) {
  const out = new Set();
  String(cell == null ? "" : cell)
    .split(/[\s,;]+/)
    .filter(Boolean)
    .forEach((t) => {
      const id = /^\d{1,2}$/.test(t) ? t.padStart(2, "0") : t;
      if (IDS.includes(id)) out.add(id);
    });
  return IDS.filter((id) => out.has(id)); // always in handbook order, never an unknown id
}

function summary(readIds) {
  const read = IDS.filter((id) => readIds.includes(id));
  const total = IDS.length;
  return { read, count: read.length, total, percent: total ? Math.round((read.length / total) * 100) : 0 };
}

// Returns the new list of read chapter ids, or null if the chapter id is not a real chapter.
function setRead(readIds, chapterId, isRead) {
  if (!IDS.includes(chapterId)) return null;
  const set = new Set(readIds);
  if (isRead) set.add(chapterId); else set.delete(chapterId);
  return IDS.filter((id) => set.has(id));
}

module.exports = { parseRead, summary, setRead };
