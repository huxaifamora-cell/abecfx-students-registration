// "Graduate" is no longer a status: Certified is the graduate status, and an old "Graduate" row reads as Certified.
// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const idrules = require("../idrules");
const stats = require("../stats");
const { STATUSES, student } = require("./support/memory-store");

test("the status list has no separate Graduate", () => {
  assert.deepEqual(STATUSES, ["Uncertified", "Certified", "Alumni Member", "Mentor", "Staff Member", "CEO"]);
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
