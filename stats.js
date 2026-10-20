// Statistics for the editor dashboard. Pure functions: rows in, numbers out.
// Students who registered before the rename have "Forex Mentorship" stored; they are shown as "Forex Course".
const programmeName = (v) => (/^forex mentorship$/i.test(String(v || "").trim()) ? "Forex Course" : String(v || ""));
// Student row columns: 0 reg, 1 registered at, 2 country, 3 programme, 4 name, 7 gender, 9 status, 12 state.
// Quiz row columns: 0 submitted at, 1 reg, 2 name, 3 score, 4 total, 5 percent, 6 grade, 7 attempt.
const idrules = require("./idrules");
const grading = require("./grading");

const GRADUATE_STATUSES = ["Certified", "Alumni Member"]; // Certified students are the graduates
const TEAM_STATUSES = ["Team Member"];
const STATUS_ORDER = ["Uncertified", "Certified", "Team Member", "Alumni Member"];

// The label each student is counted under, for every breakdown. Used by the counts AND by the lists
// behind them, so a number on the dashboard and the list it opens can never disagree.
const BLANK = "Not recorded";
const KEYS = {
  gender: (r) => r[7],
  country: (r) => r[2],
  programme: (r) => programmeName(r[3]),
  state: (r) => (r[12] ? `${r[12]}${r[2] ? ", " + r[2] : ""}` : ""),
  year: (r) => {
    // year joined = the registration number's year, which is the admission year
    const yy = parseInt(String(r[0] || "").split("/")[1], 10);
    return Number.isNaN(yy) ? "" : String(2000 + yy);
  },
};
const labelOf = (kind, r) => (KEYS[kind](r) || "").trim() || BLANK;

function tally(values, blank = BLANK) {
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
  const v = idrules.normalizeStatus(r[9]); // an old "Graduate" row counts as Certified
  return STATUS_ORDER.includes(v) ? v : "Uncertified";
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
  const byYear = tally(rows.map(KEYS.year)).sort((a, b) => a.label.localeCompare(b.label));

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
    gender: tally(rows.map(KEYS.gender)),
    country: tally(rows.map(KEYS.country)),
    state: tally(rows.map(KEYS.state)),
    programme: tally(rows.map(KEYS.programme)),
    status: STATUS_ORDER.map((s) => ({ label: s, count: statusCounts[s] })),
    graduates: sum(GRADUATE_STATUSES), // Certified + Alumni Member
    uncertified: statusCounts.Uncertified,
    team: sum(TEAM_STATUSES), // Team Member
    byYear,
    months,
    monthsByYear,
    undated,
    quiz: {
      attempts: quizRows.length,
      students: latest.size,
      notTaken: rows.filter((r) => !latest.has(r[0])).length, // students with no quiz result at all
      avgPct,
      gradeDist,
    },
  };
}

// ---------------------------------------------------------------------------
// The list behind a number: click a statistic on the dashboard, get these rows.
// No email, WhatsApp number, photo or mentorship code is ever included.
// ---------------------------------------------------------------------------
const MAX_ROWS = 5000;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function quizEntry(q) {
  const g = grading.gradeFor(Number(q[5]));
  return {
    date: (q[0] || "").split(",")[0],
    regNumber: q[1] || "",
    fullName: q[2] || "",
    score: Number(q[3]) || 0,
    total: Number(q[4]) || 0,
    pct: Number(q[5]) || 0,
    grade: q[6] || g.grade,
    label: g.label,
    attempt: Number(q[7]) || 1,
  };
}

function studentOut(r) {
  const iso = idrules.parseRegistered(r);
  return {
    regNumber: r[0] || "",
    fullName: r[4] || "",
    gender: r[7] || "",
    country: r[2] || "",
    state: r[12] || "",
    programme: programmeName(r[3]),
    status: statusOf(r),
    joined: iso ? idrules.formatISO(iso) : "",
  };
}

function monthTitle(ym) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

// kind: which statistic; value: which bar / column / grade (for the kinds that need one).
// Returns { title, type: "students" | "quiz", rows, truncated, count } or null when kind/value is not valid.
function drill(rows, quizRows, kind, value) {
  const val = String(value == null ? "" : value).slice(0, 120);
  let title, pick, type = "students";

  const latest = new Map();
  for (const q of quizRows) latest.set(q[1], q);
  const latestList = () => [...latest.values()].sort((a, b) => (Number(b[5]) || 0) - (Number(a[5]) || 0) || String(a[1]).localeCompare(String(b[1])));

  switch (kind) {
    case "all": title = "All students"; pick = () => true; break;
    case "graduates": title = "Certified graduates (Certified and Alumni Member)"; pick = (r) => GRADUATE_STATUSES.includes(statusOf(r)); break;
    case "uncertified": title = "Uncertified students"; pick = (r) => statusOf(r) === "Uncertified"; break;
    case "team": title = "Team members"; pick = (r) => TEAM_STATUSES.includes(statusOf(r)); break;
    case "status":
      if (!STATUS_ORDER.includes(val)) return null;
      title = `Status: ${val}`; pick = (r) => statusOf(r) === val; break;
    case "gender": case "country": case "state": case "programme": case "year": {
      if (!val) return null;
      const name = { gender: "Gender", country: "Country", state: "State", programme: "Programme", year: "Year joined" }[kind];
      title = `${name}: ${val}`; pick = (r) => labelOf(kind, r) === val; break;
    }
    case "month":
      if (!YM.test(val)) return null;
      title = `Joined in ${monthTitle(val)}`; pick = (r) => (idrules.parseRegistered(r) || "").slice(0, 7) === val; break;
    case "upto":
      if (!YM.test(val)) return null;
      title = `All students who had joined by the end of ${monthTitle(val)}`;
      pick = (r) => { const m = (idrules.parseRegistered(r) || "").slice(0, 7); return !!m && m <= val; }; break;
    case "undated": title = "Students with no joining date"; pick = (r) => !idrules.parseRegistered(r); break;
    case "quiz-not-taken": title = "Students who have not taken the quiz yet"; pick = (r) => !latest.has(r[0]); break;
    case "quiz-students": case "quiz-avg": {
      type = "quiz";
      title = kind === "quiz-avg" ? "Average quiz score: each student's latest attempt" : "Students who took the quiz (latest attempt)";
      const list = latestList().map(quizEntry);
      return finish(title, type, list);
    }
    case "grade": {
      if (!grading.SCALE.some((s) => s.grade === val)) return null;
      type = "quiz";
      title = `Grade ${val} (latest attempt per student)`;
      return finish(title, type, latestList().filter((q) => q[6] === val).map(quizEntry));
    }
    case "quiz-attempts": {
      type = "quiz";
      return finish("Every quiz attempt (newest first)", type, quizRows.map(quizEntry).reverse());
    }
    default: return null;
  }
  const list = rows.filter(pick).map(studentOut).sort((a, b) => a.regNumber.localeCompare(b.regNumber));
  return finish(title, type, list);
}

function finish(title, type, list) {
  return { title, type, count: list.length, truncated: list.length > MAX_ROWS, rows: list.slice(0, MAX_ROWS) };
}

module.exports = { buildStats, drill, quizEntry, GRADUATE_STATUSES, TEAM_STATUSES };
