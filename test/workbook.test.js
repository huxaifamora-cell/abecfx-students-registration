// The student Workbook page: one Word workbook per chapter, only for signed-in students, via a short-lived signed link.
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, A } = require("./support/boot-server");

test("workbooks: students only, listed for every chapter, downloaded with a signed link", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const a = await s.studentToken(A);

  assert.equal((await s.call("GET", "/api/workbooks")).status, 401);
  assert.equal((await s.call("GET", "/api/workbooks/link?id=01")).status, 401);

  const list = await s.call("GET", "/api/workbooks", { token: a });
  assert.equal(list.status, 200);
  assert.equal(list.body.workbooks.length, 13, "Introduction plus chapters 01-12");
  assert.ok(list.body.workbooks.every((w) => w.available), "every workbook file is in private/workbooks");

  assert.equal((await s.call("GET", "/api/workbooks/link?id=99", { token: a })).status, 404);
  assert.equal((await s.call("GET", "/api/workbooks/link?id=../01", { token: a })).status, 404);

  const link = await s.call("GET", "/api/workbooks/link?id=03", { token: a });
  assert.equal(link.status, 200);
  assert.match(link.body.url, /^\/workbook\/03\?t=/);
  const ok = await fetch(s.base + link.body.url);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-disposition"), /attachment; filename="ABEC-FX-Workbook-03-.*\.docx"/);
  const bytes = Buffer.from(await ok.arrayBuffer());
  assert.equal(bytes.slice(0, 2).toString(), "PK", "a real .docx (zip) file");

  assert.equal((await fetch(s.base + "/workbook/03")).status, 401, "no link, no file");
  assert.equal((await fetch(s.base + "/workbook/03?t=forged.token")).status, 401);
});
