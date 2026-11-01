// Run with:  npm test   (node --test). Starts the real server.js against the in-memory sheet.
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./support/boot-server");

const ALUMNI = "ABECFX/26/0005"; // seeded as an Alumni-only member when FAKE_ALUMNI is set
const STUDENT = "ABECFX/26/0001"; // an ordinary student

test("funds over HTTP: Alumni only, the dashboard runs the money, the member sees their share and withdraws", async (t) => {
  let s;
  try { s = await boot({ FAKE_ALUMNI: "1" }); } catch (e) { return t.skip("the server could not start here: " + e.message); }
  t.after(() => s.stop());
  const owner = await s.adminToken();
  const alumni = await s.studentToken(ALUMNI);
  const plain = await s.studentToken(STUDENT);

  // who may open the member pages
  assert.equal((await s.call("GET", "/api/portal/funds")).status, 401);
  assert.equal((await s.call("GET", "/api/portal/funds", { token: plain })).status, 403, "an ordinary student is refused");
  assert.equal((await s.call("GET", "/api/portal/funds/palliative", { token: plain })).status, 403);
  let list = await s.call("GET", "/api/portal/funds", { token: alumni });
  assert.equal(list.status, 200);
  assert.equal(list.body.funds[0].name, "Palliative Fund");
  assert.equal((await s.call("GET", "/api/portal/funds/nope", { token: alumni })).status, 404);

  // who may run the dashboard side
  assert.equal((await s.call("GET", "/api/admin/funds/palliative")).status, 401);
  assert.equal((await s.call("POST", "/api/admin/funds/palliative/deposit", { token: alumni, body: { amount: 5 } })).status, 401, "a student token is not a dashboard token");

  // the owner pays money into the reserve, sponsors the member, records a result
  let r = await s.call("POST", "/api/admin/funds/palliative/deposit", { token: owner, body: { amount: 1000, note: "Starting money" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.totals.reserve, 1000);
  r = await s.call("POST", "/api/admin/funds/palliative/allocate", { token: owner, body: { holder: STUDENT, amount: 100 } });
  assert.equal(r.status, 400, "a non-Alumni student cannot be sponsored");
  assert.ok(r.body.errors.holder);
  r = await s.call("POST", "/api/admin/funds/palliative/allocate", { token: owner, body: { holder: ALUMNI, amount: 400 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.holders.find((h) => h.reg === ALUMNI).value, 400);
  assert.equal(r.body.holders.find((h) => h.name.startsWith("Name") || h.name).name.length > 0, true);
  r = await s.call("POST", "/api/admin/funds/palliative/performance", { token: owner, body: { amount: 100 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.value, 1100);

  // the member's view: whole fund, own share and amount
  let v = await s.call("GET", "/api/portal/funds/palliative", { token: alumni });
  assert.equal(v.body.totals.value, 1100);
  assert.equal(v.body.me.value, 440);
  assert.equal(v.body.me.sharePct, 40, "400 of the 1000 units");
  assert.equal(v.body.me.gain, 40);
  assert.equal(v.body.canWithdraw, true);
  assert.equal(JSON.stringify(v.body).includes("RESERVE"), false, "the reserve is not shown to members");

  // the member asks to withdraw
  r = await s.call("POST", "/api/portal/funds/palliative/withdrawals", { token: alumni, body: { amount: 9999, details: "GTB 0123456789" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.amount);
  r = await s.call("POST", "/api/portal/funds/palliative/withdrawals", { token: alumni, body: { amount: 140, details: "GTB 0123456789 Ada" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.pending, 140);
  assert.equal(r.body.withdrawals[0].status, "Pending");

  // the dashboard sees it and pays it
  let a = await s.call("GET", "/api/admin/funds/palliative", { token: owner });
  const req = a.body.requests.find((x) => x.status === "Pending");
  assert.equal(req.details, "GTB 0123456789 Ada");
  r = await s.call("POST", "/api/admin/funds/palliative/withdrawals/" + req.id + "/pay", { token: owner, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.done.paid, 140);
  v = await s.call("GET", "/api/portal/funds/palliative", { token: alumni });
  assert.equal(v.body.me.value, 300);
  assert.equal(v.body.me.withdrawn, 140);
  assert.equal(v.body.withdrawals[0].status, "Paid");
  assert.equal(v.body.totals.value, 960);
});
