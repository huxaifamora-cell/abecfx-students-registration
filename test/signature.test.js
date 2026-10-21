// A student's signature: saved from the portal, returned only to that student, and it must be a real small PNG.
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, A, B } = require("./support/boot-server");

// A tiny valid PNG, padded with a comment-free tail so it passes the minimum size, as base64.
const PNG_HEAD = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf0000000200017e4f6f1b0000000049454e44ae426082", "hex");
const GOOD = Buffer.concat([PNG_HEAD, Buffer.alloc(300, 1)]).toString("base64");

test("signature: students only, PNG only, and each student sees only their own", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const a = await s.studentToken(A);
  const b = await s.studentToken(B);

  assert.equal((await s.call("GET", "/api/portal/signature")).status, 401);
  assert.equal((await s.call("PUT", "/api/portal/signature", { body: { signature: GOOD } })).status, 401);

  assert.deepEqual((await s.call("GET", "/api/portal/signature", { token: a })).body, { signature: "" }, "none yet");

  for (const bad of ["", "abc", "/9j/" + "A".repeat(500), "<script>" + "A".repeat(500), "A".repeat(50000)]) {
    assert.equal((await s.call("PUT", "/api/portal/signature", { token: a, body: { signature: bad } })).status, 400);
  }

  assert.equal((await s.call("PUT", "/api/portal/signature", { token: a, body: { signature: GOOD } })).status, 200);
  assert.equal((await s.call("GET", "/api/portal/signature", { token: a })).body.signature, GOOD);
  assert.equal((await s.call("GET", "/api/portal/signature", { token: b })).body.signature, "", "another student sees nothing");

  // changing it replaces the old one
  const GOOD2 = Buffer.concat([PNG_HEAD, Buffer.alloc(400, 2)]).toString("base64");
  assert.equal((await s.call("PUT", "/api/portal/signature", { token: a, body: { signature: GOOD2 } })).status, 200);
  assert.equal((await s.call("GET", "/api/portal/signature", { token: a })).body.signature, GOOD2);
});

test("registration needs a signature", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const r = await s.call("POST", "/api/register", { body: { fullName: "No Signature" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.signature, "a missing signature is reported with the other errors");
  assert.ok(r.body.errors.terms, "so is a missing agreement to the Terms and Conditions");
});

test("admin ID cards can load a student's signature; students and strangers cannot use that route", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const a = await s.studentToken(A);
  const admin = await s.adminToken();
  await s.call("PUT", "/api/portal/signature", { token: a, body: { signature: GOOD } });

  assert.equal((await s.call("GET", "/api/admin/id-cards/signature?reg=" + encodeURIComponent(A))).status, 401);
  assert.equal((await s.call("GET", "/api/admin/id-cards/signature?reg=" + encodeURIComponent(A), { token: a })).status, 401, "a student token is not an admin sign-in");
  const r = await s.call("GET", "/api/admin/id-cards/signature?reg=" + encodeURIComponent(A), { token: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.signature, GOOD);
  assert.equal((await s.call("GET", "/api/admin/id-cards/signature?reg=nope", { token: admin })).status, 400);
  assert.equal((await s.call("GET", "/api/admin/id-cards/signature?reg=" + encodeURIComponent(B), { token: admin })).body.signature, "");
});

test("students without a signature are flagged until they add one", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const login = await s.call("POST", "/api/portal/login", { body: { reg: A, email: require("./support/boot-server").email(A) } });
  assert.equal(login.body.signatureMissing, true);
  const a = login.body.token;
  assert.equal((await s.call("GET", "/api/portal/me", { token: a })).body.signatureMissing, true);
  assert.equal((await s.call("PUT", "/api/portal/signature", { token: a, body: { signature: GOOD } })).status, 200);
  assert.equal((await s.call("GET", "/api/portal/me", { token: a })).body.signatureMissing, false);
});
