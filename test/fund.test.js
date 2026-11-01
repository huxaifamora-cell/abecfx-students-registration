// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const fund = require("../fund");
const { create: createAdminDb, AdminError } = require("../admin-database");
const { createMemoryStore, student, HEADERS } = require("./support/memory-store");

const A = "ABECFX/26/0001";
const B = "ABECFX/26/0002";
const C = "ABECFX/26/0003";
const NOT = "ABECFX/26/0004"; // not an Alumni member
const ALUMNI = new Set([A, B, C]);
const F = "palliative";

function setup() {
  const store = createMemoryStore();
  let t = 0;
  const svc = fund.create(store, {
    stamp: () => "02 Nov 2026, 10:00:" + String(t++ % 60).padStart(2, "0"),
    nameOf: async (reg) => "Name of " + reg.slice(-4),
    isAlumni: async (reg) => ALUMNI.has(reg),
    log: () => {},
  });
  return { store, svc };
}
const rejects = (p, status, field) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof fund.FundError, "expected a FundError but got: " + e);
    assert.equal(e.status, status, e.message);
    if (field) assert.ok(e.fields && e.fields[field], "expected an error on " + field + ", got " + JSON.stringify(e.fields));
    return true;
  });
const holder = (v, reg) => v.holders.find((h) => h.reg === reg);

test("the sheet columns match the real sheets.js (when its dependencies are installed)", (t) => {
  assert.deepEqual(fund.LEDGER_HEADERS, HEADERS.fundledger);
  assert.deepEqual(fund.WITHDRAWAL_HEADERS, HEADERS.fundwithdrawals);
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  assert.deepEqual(real.EDITOR_TABS.fundledger.headers, fund.LEDGER_HEADERS);
  assert.deepEqual(real.EDITOR_TABS.fundwithdrawals.headers, fund.WITHDRAWAL_HEADERS);
});

test("the Palliative Fund exists and is the only fund so far", () => {
  const { svc } = setup();
  assert.deepEqual(svc.list().map((f) => f.id), ["palliative"]);
  assert.equal(svc.list()[0].name, "Palliative Fund");
});

test("money goes into the reserve, then is given to members as sponsorship; shares always add to 100%", async () => {
  const { svc } = setup();
  await svc.deposit(F, { amount: 1000 }, "owner");
  let v = await svc.adminView(F);
  assert.equal(v.totals.value, 1000);
  assert.equal(v.totals.reserve, 1000);
  assert.equal(v.totals.members, 0);
  await svc.allocate(F, { holder: A, amount: 600 }, "owner");
  await svc.allocate(F, { holder: B, amount: 300 }, "owner");
  v = await svc.adminView(F);
  assert.equal(holder(v, A).value, 600);
  assert.equal(holder(v, B).value, 300);
  assert.equal(holder(v, fund.RESERVE).value, 100);
  assert.equal(v.totals.members, 2);
  const pct = v.holders.reduce((a, h) => a + h.sharePct, 0);
  assert.ok(Math.abs(pct - 100) < 0.01, "shares add up to 100, got " + pct);
  await rejects(svc.allocate(F, { holder: C, amount: 150 }, "owner"), 409); // only 100 left in the reserve
});

test("a trading result compounds: shares stay the same, every amount grows by the same percentage", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 600 }, "owner");
  await svc.deposit(F, { holder: B, amount: 400 }, "owner");
  await svc.performance(F, { amount: 100, source: "manual" }, "owner"); // +10%
  let a = await svc.memberView(F, A);
  assert.equal(a.me.sharePct, 60);
  assert.equal(a.me.value, 660);
  assert.equal(a.me.gain, 60);
  assert.equal(a.me.gainPct, 10);
  assert.equal(a.totals.value, 1100);
  assert.equal(a.totals.growthPct, 10);
  await svc.performance(F, { amount: 110 }, "owner"); // +10% of 1100: compounding on the profit already made
  a = await svc.memberView(F, A);
  assert.equal(a.me.value, 726);
  assert.equal(a.me.sharePct, 60);
  assert.equal(a.totals.growthPct, 21);
  const b = await svc.memberView(F, B);
  assert.equal(b.me.value, 484);
});

test("someone who joins later pays today's unit value and does not take earlier profit", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  await svc.performance(F, { amount: 1000 }, "owner"); // the fund doubled
  await svc.deposit(F, { holder: B, amount: 1000 }, "owner");
  const a = await svc.memberView(F, A);
  const b = await svc.memberView(F, B);
  assert.equal(a.me.value, 2000);
  assert.equal(b.me.value, 1000);
  assert.equal(b.me.gain, 0);
  assert.equal(a.me.sharePct, 66.6667);
  assert.equal(b.me.sharePct, 33.3333);
  await svc.performance(F, { amount: -300 }, "owner"); // a loss is shared in proportion
  assert.equal((await svc.memberView(F, A)).me.value, 1800);
  assert.equal((await svc.memberView(F, B)).me.value, 900);
});

test("a result can be given as the fund's new value, and a loss bigger than the fund is refused", async () => {
  const { svc } = setup();
  await rejects(svc.performance(F, { amount: 50 }, "owner"), 409); // nothing in the fund yet
  await svc.deposit(F, { holder: A, amount: 500 }, "owner");
  const r = await svc.performance(F, { newValue: 575.5 }, "owner");
  assert.equal(r.amount, 75.5);
  assert.equal((await svc.memberView(F, A)).me.value, 575.5);
  await rejects(svc.performance(F, { newValue: 575.5 }, "owner"), 400, "newValue");
  await rejects(svc.performance(F, { amount: -600 }, "owner"), 409);
  await rejects(svc.performance(F, { amount: 0 }, "owner"), 400, "amount");
  await rejects(svc.performance(F, { amount: "abc" }, "owner"), 400, "amount");
});

test("the copy-trading hook: the same result sent twice is recorded once", async () => {
  const { svc, store } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  const first = await svc.performance(F, { amount: 25, source: "copytrading", ref: "2026-11-03" }, "copytrading");
  assert.ok(first.id);
  const again = await svc.performance(F, { amount: 25, source: "copytrading", ref: "2026-11-03" }, "copytrading");
  assert.equal(again.duplicate, true);
  assert.equal((await svc.memberView(F, A)).me.value, 1025);
  assert.equal(store.data.fundledger.filter((r) => r[3] === "performance").length, 1);
  await svc.performance(F, { amount: 5, source: "copytrading", ref: "2026-11-04" }, "copytrading");
  assert.equal((await svc.memberView(F, A)).me.value, 1030);
});

test("only Alumni members can be paid in for or sponsored; amounts are checked", async () => {
  const { svc } = setup();
  await rejects(svc.deposit(F, { holder: NOT, amount: 100 }, "owner"), 400, "holder");
  await rejects(svc.allocate(F, { holder: NOT, amount: 100 }, "owner"), 400, "holder");
  await rejects(svc.allocate(F, { holder: "", amount: 100 }, "owner"), 400, "holder");
  await rejects(svc.deposit(F, { amount: -5 }, "owner"), 400, "amount");
  await rejects(svc.deposit(F, { amount: "" }, "owner"), 400, "amount");
  await rejects(svc.deposit("nope", { amount: 5 }, "owner"), 404);
  const ok = await svc.deposit(F, { holder: "abecfx/26/0001", amount: "1,250.50" }, "owner"); // case and commas are fine
  assert.equal(ok.amount, 1250.5);
});

test("withdrawal: the member asks, nothing moves, the admin pays, then the units leave the fund at today's value", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  await svc.deposit(F, { holder: B, amount: 1000 }, "owner");
  await svc.performance(F, { amount: 200 }, "owner"); // A and B are each worth 1100
  await rejects(svc.requestWithdrawal(F, A, { amount: 100 }), 400, "details");
  await rejects(svc.requestWithdrawal(F, A, { amount: 5000, details: "GTB 0123456789" }), 400, "amount");
  await rejects(svc.requestWithdrawal(F, C, { amount: 10, details: "GTB 0123456789" }), 409); // C has no money in the fund
  const req = await svc.requestWithdrawal(F, A, { amount: 400, details: "GTB 0123456789 Ada" });
  let a = await svc.memberView(F, A);
  assert.equal(a.me.value, 1100, "still in the fund until paid");
  assert.equal(a.me.pending, 400);
  assert.equal(a.me.available, 700);
  assert.equal(a.canWithdraw, false, "one waiting request at a time");
  assert.equal(a.withdrawals[0].status, "Pending");
  await rejects(svc.requestWithdrawal(F, A, { amount: 10, details: "GTB 0123456789" }), 409);

  const paid = await svc.payWithdrawal(F, req.id, {}, "owner");
  assert.equal(paid.paid, 400);
  a = await svc.memberView(F, A);
  assert.equal(a.me.value, 700);
  assert.equal(a.me.withdrawn, 400);
  assert.equal(a.me.gain, 100, "700 left + 400 taken - 1000 put in");
  assert.equal(a.withdrawals[0].status, "Paid");
  assert.equal(a.canWithdraw, true);
  assert.equal((await svc.memberView(F, B)).me.value, 1100, "B is not affected by A's withdrawal");
  await rejects(svc.payWithdrawal(F, req.id, {}, "owner"), 409); // cannot be paid twice
});

test("withdraw everything takes the whole share at the moment it is paid; a rejected or cancelled request leaves the money", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  await svc.deposit(F, { holder: B, amount: 1000 }, "owner");
  const all = await svc.requestWithdrawal(F, A, { all: true, details: "Wallet 0xabc123" });
  await svc.performance(F, { amount: 200 }, "owner"); // A's share is now worth 1100, not 1000
  const view = await svc.adminView(F);
  assert.equal(view.requests[0].amountNow, 1100);
  const paid = await svc.payWithdrawal(F, all.id, {}, "owner");
  assert.equal(paid.paid, 1100);
  const a = await svc.memberView(F, A);
  assert.equal(a.me.value, 0);
  assert.equal(a.me.sharePct, 0);
  assert.equal(a.totals.value, 1100);
  assert.equal((await svc.memberView(F, B)).me.value, 1100);

  const r1 = await svc.requestWithdrawal(F, B, { amount: 100, details: "GTB 0123456789" });
  await rejects(svc.rejectWithdrawal(F, r1.id, { note: "" }, "owner"), 400, "note");
  await svc.rejectWithdrawal(F, r1.id, { note: "Please wait until the end of the month" }, "owner");
  let b = await svc.memberView(F, B);
  assert.equal(b.me.value, 1100);
  assert.equal(b.withdrawals[0].status, "Rejected");
  assert.match(b.withdrawals[0].note, /end of the month/);
  const r2 = await svc.requestWithdrawal(F, B, { amount: 100, details: "GTB 0123456789" });
  await rejects(svc.cancelWithdrawal(F, A, r2.id), 404); // someone else's request
  await svc.cancelWithdrawal(F, B, r2.id);
  b = await svc.memberView(F, B);
  assert.equal(b.withdrawals[0].status, "Cancelled");
  assert.equal(b.canWithdraw, true);
});

test("the admin can pay less than asked but never more than the member's share", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  const req = await svc.requestWithdrawal(F, A, { amount: 800, details: "GTB 0123456789" });
  await svc.performance(F, { amount: -500 }, "owner"); // A is now worth only 500
  await rejects(svc.payWithdrawal(F, req.id, { amount: 800 }, "owner"), 400, "amount");
  const paid = await svc.payWithdrawal(F, req.id, {}, "owner"); // defaults to what is left, 500
  assert.equal(paid.paid, 500);
  assert.equal((await svc.memberView(F, A)).me.value, 0);
});

test("a payment that was recorded in the ledger but not on the request is finished, not taken out twice", async () => {
  const { svc, store } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  const req = await svc.requestWithdrawal(F, A, { amount: 300, details: "GTB 0123456789" });
  const realWrite = store.writeTabCells;
  store.writeTabCells = async () => { throw new Error("sheet hiccup"); };
  await assert.rejects(svc.payWithdrawal(F, req.id, {}, "owner"));
  store.writeTabCells = realWrite;
  assert.equal((await svc.memberView(F, A)).me.value, 700, "the money has left the fund");
  const again = await svc.payWithdrawal(F, req.id, {}, "owner");
  assert.equal(again.paid, 300);
  assert.equal((await svc.memberView(F, A)).me.value, 700, "and it did not leave twice");
  assert.equal(store.data.fundledger.filter((r) => r[3] === "withdrawal").length, 1);
  assert.equal(store.data.fundwithdrawals[0][7], "Paid");
});

test("a member sees the whole fund and only their own share, never another member's", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 700 }, "owner");
  await svc.deposit(F, { holder: B, amount: 300 }, "owner");
  await svc.performance(F, { amount: 50 }, "owner");
  const a = await svc.memberView(F, A);
  assert.equal(a.totals.value, 1050);
  assert.equal(a.totals.members, 2);
  const text = JSON.stringify(a);
  assert.ok(!text.includes("0002"), "B's registration number must not appear in A's view");
  assert.ok(!text.includes("Name of"), "no names either");
  const list = await svc.memberList(A);
  assert.equal(list[0].myValue, 735);
  assert.equal(list[0].value, 1050);
  const nobody = await svc.memberView(F, C);
  assert.equal(nobody.me.value, 0);
  assert.equal(nobody.canWithdraw, false);
});

test("the sheet is the truth: a bad row typed by hand is skipped and reported, and the rest still counts", async () => {
  const { svc, store } = setup();
  await svc.deposit(F, { holder: A, amount: 1000 }, "owner");
  store.data.fundledger.push(["X1", F, "02 Nov 2026", "withdrawal", A, "9999", "", "", "", "", "", "", "typed by hand", ""]);
  store.data.fundledger.push(["X2", F, "02 Nov 2026", "banana", A, "5", "", "", "", "", "", "", "", ""]);
  const v = await svc.adminView(F);
  assert.equal(v.totals.value, 1000);
  assert.equal(v.problems.length, 2);
  assert.match(v.problems[0], /Row 3/);
});

test("records of other funds do not mix in", async () => {
  const { store, svc } = setup();
  await svc.deposit(F, { holder: A, amount: 100 }, "owner");
  store.data.fundledger.push(["Y1", "other-fund", "02 Nov 2026", "deposit", A, "5000", "", "", "", "", "", "", "", ""]);
  assert.equal((await svc.memberView(F, A)).totals.value, 100);
});

test("two actions at once are done one after the other and the numbers stay right", async () => {
  const { svc } = setup();
  await svc.deposit(F, { holder: A, amount: 100 }, "owner");
  await Promise.all([
    svc.deposit(F, { holder: A, amount: 100 }, "owner"),
    svc.performance(F, { amount: 20 }, "owner"),
    svc.deposit(F, { holder: B, amount: 100 }, "owner"),
  ]);
  const v = await svc.adminView(F);
  assert.equal(v.totals.value, 320);
  assert.equal(v.problems.length, 0);
  const total = v.holders.reduce((s, h) => s + h.value, 0);
  assert.ok(Math.abs(total - 320) < 0.02, "the members' amounts add up to the fund: " + total);
});

test("hasRecords and the Database: a person with money in a fund cannot be deleted; renaming their number follows them", async () => {
  const store = createMemoryStore({ students: [student(1), student(2)] });
  const svc = fund.create(store, { stamp: () => "x", isAlumni: async () => true, log: () => {} });
  await svc.deposit(F, { holder: A, amount: 100 }, "owner");
  assert.equal(await svc.hasRecords(A), true);
  assert.equal(await svc.hasRecords(B), false);
  const db = createAdminDb(store);
  await assert.rejects(db.remove("students", 2, store.data.students[0].slice()), (e) => e instanceof AdminError && e.status === 409 && /Fund/.test(e.message));
  assert.equal(store.data.students.length, 2);
  await db.remove("students", 3, store.data.students[1].slice()); // B has no fund records and can still be deleted
  assert.equal(store.data.students.length, 1);
});
