// Statistics for the editor dashboard. Pure functions: rows in, numbers out.
// Student row columns: 0 reg, 1 registered at, 2 country, 3 programme, 4 name, 7 gender, 9 status, 12 state.
// Quiz row columns: 0 submitted at, 1 reg, 2 name, 3 score, 4 total, 5 percent, 6 grade, 7 attempt.
const idrules = require("./idrules");
const grading = require("./grading");

const GRADUATE_STATUSES = ["Certified", "Graduate", "Alumni Member"];
const TEAM_STATUSES = ["Mentor", "Staff Member", "CEO"];
const STATUS_ORDER = ["Uncertified", "Certified", "Graduate", "Alumni Member", "Mentor", "Staff Member", "CEO"];

function tally(values, blank = "Not recorded") {
  const m = new Map();
  for (const v of values) {
    const k = (v || "").trim() || blank;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function ymOf(iso) {
  return iso.slice(0, 7);
}

function nextYm(ym) {
  let [y, m] = ym.split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function statusOf(r) {
  return STATUS_ORDER.includes(r[9]) ? r[9] : "Uncertified";
}

function buildStats(rows, quizRows, todayISO) {
  const total = rows.length;
  const statusCounts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const r of rows) statusCounts[statusOf(r)] += 1;
  const sum = (list) => list.reduce((n, s) => n + statusCounts[s], 0);

  // ---- joining dates ----
  const joined = rows.map((r) => idrules.parseRegistered(r)).filter(Boolean);
  const undated = total - joined.length;
  const perMonth = new Map();
  for (const iso of joined) perMonth.set(ymOf(iso), (perMonth.get(ymOf(iso)) || 0) + 1);

  const months = [];
  if (perMonth.size) {
    const sorted = [...perMonth.keys()].sort();
    const last = [sorted[sorted.length - 1], ymOf(todayISO)].sort().pop();
    let running = 0;
    let prevNew = null;
    for (let ym = sorted[0]; ym <= last; ym = nextYm(ym)) {
      const n = perMonth.get(ym) || 0;
      running += n;
      months.push({
        ym,
        new: n,
        total: running,
        growthPct: prevNew === null || prevNew === 0 ? null : Math.round(((n - prevNew) / prevNew) * 100),
      });
      prevNew = n;
    }
  }
  const monthsByYear = {};
  for (const m of months) {
    const [y, mo] = m.ym.split("-");
    (monthsByYear[y] = monthsByYear[y] || Array(12).fill(0))[Number(mo) - 1] = m.new;
  }

  // year joined: the registration number's year, which is the admission year
  const byYear = tally(
    rows.map((r) => {
      const yy = parseInt(String(r[0] || "").split("/")[1], 10);
      return Number.isNaN(yy) ? "" : String(2000 + yy);
    })
  ).sort((a, b) => a.label.localeCompare(b.label));

  // ---- quiz ----
  const latest = new Map(); // reg -> most recent attempt
  const best = new Map();
  for (const q of quizRows) {
    const reg = q[1];
    const pct = Number(q[5]) || 0;
    latest.set(reg, q);
    if (!best.has(reg) || pct > (Number(best.get(reg)[5]) || 0)) best.set(reg, q);
  }
  const latestList = [...latest.values()];
  const gradeDist = grading.SCALE.map((s) => ({
    grade: s.grade,
    label: s.label,
    count: latestList.filter((q) => q[6] === s.grade).length,
  }));
  const avgPct = latestList.length
    ? Math.round(latestList.reduce((n, q) => n + (Number(q[5]) || 0), 0) / latestList.length)
    : null;

  return {
    total,
    gender: tally(rows.map((r) => r[7])),
    country: tally(rows.map((r) => r[2])),
    state: tally(rows.map((r) => (r[12] ? `${r[12]}${r[2] ? ", " + r[2] : ""}` : ""))),
    programme: tally(rows.map((r) => r[3])),
    status: STATUS_ORDER.map((s) => ({ label: s, count: statusCounts[s] })),
    graduates: sum(GRADUATE_STATUSES), // Certified + Graduate + Alumni Member
    uncertified: statusCounts.Uncertified,
    team: sum(TEAM_STATUSES), // Mentor + Staff Member + CEO
    byYear,
    months,
    monthsByYear,
    undated,
    quiz: {
      attempts: quizRows.length,
      students: latest.size,
      notTaken: Math.max(0, total - latest.size),
      avgPct,
      gradeDist,
    },
  };
}

module.exports = { buildStats, GRADUATE_STATUSES, TEAM_STATUSES };
