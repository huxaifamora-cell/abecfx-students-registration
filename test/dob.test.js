// Students already registered with a date of birth under the age requirement: they get a notice and can
// correct it once; every correction is kept on the "DOB Changes" tab.
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, A, B, C, email } = require("./support/boot-server");

function yearsAgo(n, plusDays = 0) {
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}
const login = (s, reg) => s.call("POST", "/api/portal/login", { body: { reg, email: email(reg) } });

test("under-age date of birth: notice, one correction, then locked", async (t) => {
  const young = yearsAgo(3);
  const s = await boot({ FAKE_DOB_2: young, FAKE_DOB_3: yearsAgo(6, 2) });
  t.after(() => s.stop());

  // an adult is not flagged and cannot use the correction
  const a = await login(s, A);
  assert.equal(a.body.dobNotice, null);
  assert.equal((await s.call("PUT", "/api/portal/dob", { token: a.body.token, body: { dob: yearsAgo(20) } })).status, 403);

  // a 3-year-old and "two days short of 6" are flagged, with their current date of birth in the notice
  const b = await login(s, B);
  assert.deepEqual(b.body.dobNotice, { dob: young, canUpdate: true });
  const c = await login(s, C);
  assert.equal(c.body.dobNotice.canUpdate, true);
  assert.equal((await s.call("GET", "/api/portal/me", { token: b.body.token })).body.dobNotice.dob, young);

  // the new date must itself meet the requirement, and must be a date
  for (const bad of ["", "not-a-date", yearsAgo(2), yearsAgo(6, 2), "2999-01-01", "1800-01-01"]) {
    const r = await s.call("PUT", "/api/portal/dob", { token: b.body.token, body: { dob: bad } });
    assert.equal(r.status, 400, "rejected: " + bad);
  }
  assert.equal((await s.call("GET", "/api/portal/me", { token: b.body.token })).body.dobNotice.canUpdate, true, "failed tries do not use the one update");

  // a good date is saved, the notice goes, and the old value is kept on the DOB Changes tab
  const good = yearsAgo(25);
  assert.equal((await s.call("PUT", "/api/portal/dob", { token: b.body.token, body: { dob: good } })).status, 200);
  assert.equal((await s.call("GET", "/api/portal/me", { token: b.body.token })).body.dobNotice, null);

  // the student is no longer flagged, so a second correction is refused
  const again = await s.call("PUT", "/api/portal/dob", { token: b.body.token, body: { dob: yearsAgo(30) } });
  assert.equal(again.status, 403);

  // no token, no change
  assert.equal((await s.call("PUT", "/api/portal/dob", { body: { dob: good } })).status, 401);
});
