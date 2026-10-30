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

// ---- one person, several ID cards: Student (Uncertified / Certified), Alumni and Staff ----
const row = (status, staff, alumni) => student(1, { 9: status, 16: staff || "", 17: alumni || "" });

test("a student can also be a staff member, and a staff member needs no student ID", () => {
  assert.deepEqual(idrules.idCards(row("Uncertified")), ["student"]);
  assert.deepEqual(idrules.idCards(row("Uncertified", "Yes")), ["student", "staff"]);
  assert.deepEqual(idrules.idCards(row("Certified", "Yes")), ["student", "staff"]);
  assert.deepEqual(idrules.idCards(row("Not a student", "Yes")), ["staff"]);
  assert.deepEqual(idrules.idCards(row("Certified", "Yes", "Yes")), ["student", "alumni", "staff"]);
  assert.deepEqual(idrules.idCards(row("Not a student")), [], "no ticks and no student ID means no card");
});

test("only a Certified student has a certificate, whatever else they are ticked as", () => {
  assert.equal(idrules.idKinds(row("Certified", "Yes")).student, "Certified");
  assert.equal(idrules.idKinds(row("Uncertified", "Yes")).student, "Uncertified");
  assert.equal(idrules.idKinds(row("Not a student", "Yes", "Yes")).student, "");
  assert.equal(idrules.kindStatus("student", row("Certified", "Yes")), "Certified");
  assert.equal(idrules.kindStatus("staff", row("Certified", "Yes")), "Staff Member");
  assert.equal(idrules.kindStatus("alumni", row("Uncertified", "", "Yes")), "Alumni Member");
});

test("old rows that say Staff Member or Alumni Member in Status keep their one card", () => {
  assert.deepEqual(idrules.idCards(row("Staff Member")), ["staff"]);
  assert.deepEqual(idrules.idCards(row("Alumni Member")), ["alumni"]);
  assert.deepEqual(idrules.idCards(row("Mentor")), ["staff"]);
  assert.deepEqual(idrules.idCards(row("Graduate")), ["student"]);
  assert.deepEqual(idrules.idCards(row("")), ["student"], "an empty status is an Uncertified student, as before");
});

test("the main status is student first, then alumni, then staff", () => {
  assert.equal(idrules.primaryStatus(row("Certified", "Yes", "Yes")), "Certified");
  assert.equal(idrules.primaryStatus(row("Not a student", "Yes", "Yes")), "Alumni Member");
  assert.equal(idrules.primaryStatus(row("Not a student", "Yes")), "Staff Member");
});

test("the dashboard counts a person under every status they hold, and has an Alumni tile", () => {
  const rows = [
    student(1, { 9: "Certified", 16: "Yes" }), // Certified student who is also staff
    student(2, { 9: "Not a student", 16: "Yes" }), // staff only
    student(3), // Uncertified
    student(4, { 9: "Certified", 17: "Yes" }), // Certified student who is also alumni
  ];
  const s = stats.buildStats(rows, [], "2026-10-26");
  const bar = (label) => s.status.find((x) => x.label === label).count;
  assert.equal(bar("Certified"), 2);
  assert.equal(bar("Staff Member"), 2, "a Certified student who is also staff shows in the Staff bar too");
  assert.equal(bar("Alumni Member"), 1);
  assert.equal(bar("Uncertified"), 1);
  assert.equal(s.staff, 2);
  assert.equal(s.alumni, 1);
  assert.equal(stats.drill(rows, [], "staff").count, 2, "the Staff tile and its list agree");
  assert.equal(stats.drill(rows, [], "alumni").count, 1);
  assert.equal(stats.drill(rows, [], "status", "Staff Member").count, 2, "the Staff bar and its list agree");
});
