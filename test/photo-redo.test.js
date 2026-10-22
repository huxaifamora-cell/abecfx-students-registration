// A mentor types "Yes" in a student's "Photo To Redo" cell: the student gets a notice and can send a new passport
// photo even if they already used their one change. Sending it clears the request.
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, A, B, email } = require("./support/boot-server");

// A small fake JPEG: right start bytes, right size for the photo check.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]).toString("base64");
const login = (s, reg) => s.call("POST", "/api/portal/login", { body: { reg, email: email(reg) } });

test("photo redo: flagged student is asked, can upload, and the request clears", async (t) => {
  const s = await boot({ FAKE_REDO_2: "Yes" });
  t.after(() => s.stop());

  const a = await login(s, A);
  assert.equal(a.body.photoRedo, false, "not flagged");
  const b = await login(s, B);
  assert.equal(b.body.photoRedo, true, "flagged by a mentor");
  assert.equal((await s.call("GET", "/api/portal/me", { token: b.body.token })).body.photoRedo, true);

  assert.equal((await s.call("PUT", "/api/portal/photo", { token: b.body.token, body: { photo: "bad" } })).status, 400);
  assert.equal((await s.call("PUT", "/api/portal/photo", { token: b.body.token, body: { photo: JPEG } })).status, 200);
  assert.equal((await s.call("GET", "/api/portal/me", { token: b.body.token })).body.photoRedo, false, "the request is cleared");
});
