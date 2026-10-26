// "Graduate" is no longer a status: Certified is the graduate status, and an old "Graduate" row reads as Certified.
// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const idrules = require("../idrules");
const stats = require("../stats");
const { STATUSES, student } = require("./support/memory-store");

test("the status list has no separate Graduate", () => {
  assert.deepEqual(STATUSES, ["Uncertified", "Certified", "Not a student"]);
  assert.ok(!stats.GRADUATE_STATUSES.includes("Graduate"));
  assert.deepEqual(stats.GRADUATE_STATUSES, ["Certified", "Alumni Member"]);
});

test("an old Graduate row is read as Certified", () => {
  assert.equal(idrules.normalizeStatus("Graduate"), "Certified");
  assert.equal(idrules.normalizeStatus("  graduate "), "Certified");
  assert.equal(idrules.normalizeStatus("Certified"), "Certified");
  assert.equal(idrules.normalizeStatus("Uncertified"), "Uncertified");
  assert.equal(idrules.normalizeStatus(undefined), "");

  const rows = [student(1), student(2), student(3)];
  rows[0][9] = "Graduate"; // left over in the sheet
  rows[1][9] = "Certified";
  rows[2][9] = "Uncertified";
  const s = stats.buildStats(rows, [], "2026-10-18");
  assert.equal(s.graduates, 2, "the old Graduate row counts with Certified");
  assert.equal(s.uncertified, 1);
  assert.deepEqual(s.status.find((x) => x.label === "Certified"), { label: "Certified", count: 2 });
  assert.ok(!s.status.some((x) => x.label === "Graduate"));
});

// ---- one person, several ID cards: Student (Uncertified / Certified), Alumni and Team ----
const row = (status, team, alumni) => student(1, { 9: status, 16: team || "", 17: alumni || "" });

test("a student can also be a team member, and a team member needs no student ID", () => {
  assert.deepEqual(idrules.idCards(row("Uncertified")), ["student"]);
  assert.deepEqual(idrules.idCards(row("Uncertified", "Yes")), ["student", "team"]);
  assert.deepEqual(idrules.idCards(row("Certified", "Yes")), ["student", "team"]);
  assert.deepEqual(idrules.idCards(row("Not a student", "Yes")), ["team"]);
  assert.deepEqual(idrules.idCards(row("Certified", "Yes", "Yes")), ["student", "alumni", "team"]);
  assert.deepEqual(idrules.idCards(row("Not a student")), [], "no ticks and no student ID means no card");
});

test("only a Certified student has a certificate, whatever else they are ticked as", () => {
  assert.equal(idrules.idKinds(row("Certified", "Yes")).student, "Certified");
  assert.equal(idrules.idKinds(row("Uncertified", "Yes")).student, "Uncertified");
  assert.equal(idrules.idKinds(row("Not a student", "Yes", "Yes")).student, "");
  assert.equal(idrules.kindStatus("student", row("Certified", "Yes")), "Certified");
  assert.equal(idrules.kindStatus("team", row("Certified", "Yes")), "Team Member");
  assert.equal(idrules.kindStatus("alumni", row("Uncertified", "", "Yes")), "Alumni Member");
});

test("old rows that say Team Member or Alumni Member in Status keep their one card", () => {
  assert.deepEqual(idrules.idCards(row("Team Member")), ["team"]);
  assert.deepEqual(idrules.idCards(row("Alumni Member")), ["alumni"]);
  assert.deepEqual(idrules.idCards(row("Mentor")), ["team"]);
  assert.deepEqual(idrules.idCards(row("Graduate")), ["student"]);
  assert.deepEqual(idrules.idCards(row("")), ["student"], "an empty status is an Uncertified student, as before");
});

test("the main status is student first, then alumni, then team", () => {
  assert.equal(idrules.primaryStatus(row("Certified", "Yes", "Yes")), "Certified");
  assert.equal(idrules.primaryStatus(row("Not a student", "Yes", "Yes")), "Alumni Member");
  assert.equal(idrules.primaryStatus(row("Not a student", "Yes")), "Team Member");
});

test("the dashboard counts a Certified team member as Certified in the bars and as team in the Team tile", () => {
  const rows = [student(1, { 9: "Certified", 16: "Yes" }), student(2, { 9: "Not a student", 16: "Yes" }), student(3)];
  const s = stats.buildStats(rows, [], "2026-10-26");
  assert.equal(s.team, 2);
  assert.equal(s.graduates, 1);
  assert.equal(s.uncertified, 1);
  assert.equal(s.status.reduce((n, x) => n + x.count, 0), 3, "the bars still add up to the total");
  assert.equal(stats.drill(rows, [], "team").count, 2, "the Team tile and its list agree");
});
