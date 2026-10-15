// A-F grading scale for quiz results. Change the numbers here and the whole site follows.
// Scale used (common Nigerian grading): A 70-100, B 60-69, C 50-59, D 45-49, E 40-44, F 0-39.
const SCALE = [
  { grade: "A", min: 70, label: "Excellent" },
  { grade: "B", min: 60, label: "Very good" },
  { grade: "C", min: 50, label: "Good" },
  { grade: "D", min: 45, label: "Fair" },
  { grade: "E", min: 40, label: "Pass" },
  { grade: "F", min: 0, label: "Fail" },
];

// pct is the whole-number percentage that is shown to the student (0-100).
function gradeFor(pct) {
  const p = Number.isFinite(pct) ? pct : 0;
  return SCALE.find((s) => p >= s.min) || SCALE[SCALE.length - 1];
}

function percent(score, total) {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

module.exports = { SCALE, gradeFor, percent };
