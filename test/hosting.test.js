const test = require("node:test");
const assert = require("node:assert/strict");
const hosting = require("../hosting");
const { createMemoryStore } = require("./support/memory-store");

const A = "ABECFX/26/0002";
const B = "ABECFX/26/0003";
const good = { account: "1234567", server: "Deriv-Demo", type: "demo", consent: true };
const setup = (over = {}) => {
  const store = createMemoryStore();
  return { store, svc: hosting.create(store, { enabled: over.enabled !== false, stamp: () => "1 Nov 2026, 10:00:00", nameOf: async (r) => "Member " + r.slice(-1) }) };
};
const fieldErr = (name) => (e) => Boolean(e.fields && e.fields[name]);

test("a member asks for hosting: needs account, server, type and the consent box", async () => {
  const s = setup();
  await assert.rejects(s.svc.request(A, { ...good, account: "12" }), fieldErr("account"));
  await assert.rejects(s.svc.request(A, { ...good, account: "12ab34" }), fieldErr("account"));
  await assert.rejects(s.svc.request(A, { ...good, server: "" }), fieldErr("server"));
  await assert.rejects(s.svc.request(A, { ...good, type: "" }), fieldErr("type"));
  await assert.rejects(s.svc.request(A, { ...good, consent: false }), fieldErr("consent"));
  assert.equal(s.store.data.hostingrequests.length, 0);
  const v = await s.svc.request(A, good);
  assert.equal(v.current.status, "Requested");
  assert.equal(v.current.type, "Demo");
  assert.equal(v.canRequest, false);
  assert.equal(s.store.data.hostingrequests[0][3], "Requested");
});

test("no password is asked for or kept anywhere", async () => {
  const s = setup();
  await s.svc.request(A, { ...good, password: "secret123", investorPassword: "x" });
  const stored = JSON.stringify(s.store.data.hostingrequests);
  assert.ok(!/secret123/.test(stored));
  assert.ok(!hosting.HEADERS.some((h) => /password/i.test(h)));
  assert.ok(!JSON.stringify(await s.svc.memberView(A)).includes("secret123"));
});

test("only one open request each; a cancelled one can be replaced", async () => {
  const s = setup();
  await s.svc.request(A, good);
  await assert.rejects(s.svc.request(A, good), /already have/);
  const v = await s.svc.memberEnd(A);
  assert.equal(v.current.status, "Cancelled");
  assert.equal(v.canRequest, true);
  const v2 = await s.svc.request(A, { ...good, account: "7654321" });
  assert.equal(v2.current.account, "7654321");
  assert.equal(s.store.data.hostingrequests.length, 2);
  assert.notEqual(s.store.data.hostingrequests[0][0], s.store.data.hostingrequests[1][0]);
});

test("when switched off nothing can be requested", async () => {
  const s = setup({ enabled: false });
  await assert.rejects(s.svc.request(A, good), /switched off/);
  assert.equal((await s.svc.memberView(A)).canRequest, false);
});

test("an admin approves, then marks Active only with a VPS slot; the member sees only their own request", async () => {
  const s = setup();
  await s.svc.request(A, good);
  await s.svc.request(B, { ...good, account: "999999" });
  const id = (await s.svc.adminList()).requests.find((r) => r.reg === A).id;
  let list = await s.svc.adminUpdate(id, { status: "Approved", note: "Called on WhatsApp" }, { name: "Ade" });
  assert.equal(list.requests.find((r) => r.id === id).status, "Approved");
  await assert.rejects(s.svc.adminUpdate(id, { status: "Active" }, { name: "Ade" }), fieldErr("slot"));
  list = await s.svc.adminUpdate(id, { status: "Active", slot: "C:\\MT5\\member-a" }, { name: "Ade" });
  const row = list.requests.find((r) => r.id === id);
  assert.equal(row.status, "Active");
  assert.equal(row.by, "Ade");
  assert.equal(row.name, "Member 2");
  assert.equal(await s.svc.isHosted(A), true);
  assert.equal(await s.svc.isHosted(B), false);
  const view = await s.svc.memberView(A);
  assert.ok(!("slot" in view.current) && !("note" in view.current)); // admin details stay with the admin
  await assert.rejects(s.svc.adminUpdate(id, { status: "Nonsense" }, { name: "Ade" }), fieldErr("status"));
  await assert.rejects(s.svc.adminUpdate("H99", { status: "Approved" }, { name: "Ade" }), /not found/);
});

test("the member can end running hosting, which stops it being active", async () => {
  const s = setup();
  await s.svc.request(A, good);
  const id = (await s.svc.adminList()).requests[0].id;
  await s.svc.adminUpdate(id, { status: "Active", slot: "slot1" }, { name: "Ade" });
  const v = await s.svc.memberEnd(A);
  assert.equal(v.current.status, "Ended");
  assert.equal(await s.svc.isHosted(A), false);
  await assert.rejects(s.svc.memberEnd(A), /no open/);
});

test("a key can be made only for an Approved or Active request", async () => {
  const s = setup();
  await s.svc.request(A, good);
  const id = (await s.svc.adminList()).requests[0].id;
  await assert.rejects(s.svc.forKey(id), /Approve the request/);
  await s.svc.adminUpdate(id, { status: "Approved" }, { name: "Ade" });
  assert.equal((await s.svc.forKey(id)).reg, A);
  await s.svc.adminUpdate(id, { status: "Declined" }, { name: "Ade" });
  await assert.rejects(s.svc.forKey(id), /Approve the request/);
});

test("an admin cannot reopen a request while the member has another open one", async () => {
  const s = setup();
  await s.svc.request(A, good);
  const first = (await s.svc.adminList()).requests[0].id;
  await s.svc.memberEnd(A);
  await s.svc.request(A, { ...good, account: "555555" });
  await assert.rejects(s.svc.adminUpdate(first, { status: "Approved" }, { name: "Ade" }), fieldErr("status"));
});
