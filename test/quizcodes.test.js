// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const quizcodes = require("../quizcodes");
const { createMemoryStore, HEADERS } = require("./support/memory-store");

const A = "ABECFX/26/0001";
const B = "ABECFX/26/0002";
const admin = { username: "ngozi", name: "Ngozi", role: "quiz-supervisor" };

function setup(over = {}) {
  const store = createMemoryStore();
  const svc = quizcodes.create(store, {
    now: () => "18 Oct 2026, 10:00:00",
    cacheMs: 0,
    studentExists: async (reg) => [A, B].includes(reg),
    ...over,
  });
  return { store, svc };
}
const rejects = (p, status, field) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof quizcodes.QuizCodeError, "expected a QuizCodeError but got: " + e);
    assert.equal(e.status, status, e.message);
    if (field) assert.ok(e.fields && e.fields[field], "expected an error on " + field + ", got " + JSON.stringify(e.fields));
    return true;
  });
// Make one code and return its text.
async function one(svc, forReg) {
  return (await svc.generate({ count: 1, forReg }, admin)).codes[0].code;
}

test("quiz code columns match the real sheets.js", (t) => {
  assert.deepEqual(quizcodes.HEADERS, HEADERS.quizcodes);
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  assert.deepEqual(real.EDITOR_TABS.quizcodes.headers, quizcodes.HEADERS);
});

test("a code looks like QZ-XXXX-XXXX and never uses look-alike characters", () => {
  for (let i = 0; i < 300; i++) {
    const c = quizcodes.makeCode();
    assert.match(c, /^QZ-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/, c);
  }
});

test("codes are compared without caring about capitals, spaces or dashes", () => {
  assert.equal(quizcodes.normCode(" qz-7k4m 9pxr "), "QZ7K4M9PXR");
  assert.equal(quizcodes.normCode(null), "");
  assert.equal(quizcodes.normCode("x".repeat(500)).length, 60, "very long input is cut short");
});

test("generate: makes the number asked for, saved as Unused with who made them", async () => {
  const { store, svc } = setup();
  const out = await svc.generate({ count: 3 }, admin);
  assert.equal(out.codes.length, 3);
  assert.equal(new Set(out.codes.map((c) => c.code)).size, 3, "no two codes are the same");
  assert.equal(store.data.quizcodes.length, 3);
  for (const row of store.data.quizcodes) {
    assert.equal(row[2], "ngozi");
    assert.equal(row[4], "Unused");
    assert.deepEqual(row.slice(5), ["", "", "", ""]);
  }
});

test("generate: checks the number and the student before making anything", async () => {
  const { store, svc } = setup();
  for (const count of [0, -1, 51, 1.5, "abc", undefined, null]) await rejects(svc.generate({ count }, admin), 400, "count");
  await rejects(svc.generate({ count: 1, forReg: "nonsense" }, admin), 400, "forReg");
  await rejects(svc.generate({ count: 1, forReg: "ABECFX/26/0099" }, admin), 400, "forReg");
  assert.equal(store.data.quizcodes.length, 0, "a refused request makes no codes");
  const ok = await svc.generate({ count: 2, forReg: " abecfx/26/0001 " }, admin);
  assert.deepEqual(ok.codes.map((c) => c.forReg), [A, A], "the number is tidied up");
  assert.equal((await svc.generate({ count: 50 }, admin)).codes.length, 50);
});

test("generate: a code that is already in the sheet is never made again", async () => {
  const { svc } = setup();
  const first = await one(svc);
  // A random source that gives the existing code twice, then something else.
  const seq = [];
  const wanted = quizcodes.normCode(first).slice(2).split("");
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  wanted.forEach((ch) => seq.push(ALPHABET.indexOf(ch)));
  let i = 0;
  const { svc: svc2, store: store2 } = setup({ random: (n) => (i < seq.length ? seq[i++] : (i++ * 7) % n) });
  store2.data.quizcodes.push([first, "", "", "", "Unused", "", "", "", ""]);
  const made = (await svc2.generate({ count: 1 }, admin)).codes[0].code;
  assert.notEqual(made, first);
});

test("redeem: a code opens the quiz for that student", async () => {
  const { store, svc } = setup();
  const code = await one(svc);
  assert.equal((await svc.accessFor(A, { fresh: true })).unlocked, false, "locked before any code");
  assert.deepEqual(await svc.redeem(code, A), { unlocked: true, already: false });
  const a = await svc.accessFor(A, { fresh: true });
  assert.deepEqual(a, { unlocked: true, since: "18 Oct 2026, 10:00:00" });
  assert.equal((await svc.accessFor(B, { fresh: true })).unlocked, false, "other students stay locked");
  const row = store.data.quizcodes[0];
  assert.deepEqual([row[4], row[5], row[6]], ["Unlocked", A, "18 Oct 2026, 10:00:00"]);
});

test("redeem: capitals, spaces and dashes do not matter", async () => {
  const { svc } = setup();
  const code = await one(svc);
  const messy = " " + code.toLowerCase().replace(/-/g, " ") + " ";
  assert.equal((await svc.redeem(messy, A)).unlocked, true);
});

test("redeem: a code works once - nobody else can use it while open, or after", async () => {
  const { svc } = setup();
  const code = await one(svc);
  await svc.redeem(code, A);
  await rejects(svc.redeem(code, B), 400, "code"); // open for A
  await svc.complete(A);
  await rejects(svc.redeem(code, A), 400, "code"); // spent
  await rejects(svc.redeem(code, B), 400, "code");
});

test("redeem: typing the same code again while the quiz is open is fine", async () => {
  const { svc } = setup();
  const code = await one(svc);
  await svc.redeem(code, A);
  assert.deepEqual(await svc.redeem(code, A), { unlocked: true, already: true });
});

test("redeem: one open quiz at a time, so a second code is not burned", async () => {
  const { store, svc } = setup();
  const c1 = await one(svc);
  const c2 = await one(svc);
  await svc.redeem(c1, A);
  await rejects(svc.redeem(c2, A), 409);
  assert.equal(store.data.quizcodes[1][4], "Unused", "the second code is untouched");
});

test("redeem: unknown, empty and wrong codes all get the same answer", async () => {
  const { svc } = setup();
  await one(svc);
  await rejects(svc.redeem("", A), 400, "code");
  await rejects(svc.redeem("   ", A), 400, "code");
  for (const bad of ["QZ-AAAA-BBBB", "hello", "'; DROP TABLE", "QZ"]) {
    await assert.rejects(svc.redeem(bad, A), (e) => e instanceof quizcodes.QuizCodeError && e.status === 400 && e.message === quizcodes.BAD_CODE);
  }
});

test("redeem: a code made for one student cannot be used by another, and says nothing about why", async () => {
  const { svc } = setup();
  const code = await one(svc, A);
  await assert.rejects(svc.redeem(code, B), (e) => e.status === 400 && e.message === quizcodes.BAD_CODE);
  assert.equal((await svc.redeem(code, A)).unlocked, true);
});

test("complete: finishing the quiz spends the code and locks the quiz again", async () => {
  const { store, svc } = setup();
  const c1 = await one(svc);
  const c2 = await one(svc);
  await svc.redeem(c1, A);
  assert.equal(await svc.complete(A), c1);
  assert.equal((await svc.accessFor(A, { fresh: true })).unlocked, false, "locked again after the quiz");
  assert.deepEqual([store.data.quizcodes[0][4], store.data.quizcodes[0][7]], ["Completed", "18 Oct 2026, 10:00:00"]);
  // another attempt needs another code
  assert.equal((await svc.redeem(c2, A)).unlocked, true);
  assert.equal((await svc.accessFor(A, { fresh: true })).unlocked, true);
});

test("complete: does nothing when the student has no open quiz, and never touches someone else's", async () => {
  const { svc } = setup();
  const code = await one(svc);
  assert.equal(await svc.complete(A), null);
  await svc.redeem(code, B);
  assert.equal(await svc.complete(A), null);
  assert.equal((await svc.accessFor(B, { fresh: true })).unlocked, true);
});

test("the quiz stays open until it is finished, however long that takes", async () => {
  const { svc } = setup();
  const code = await one(svc);
  await svc.redeem(code, A);
  for (let i = 0; i < 3; i++) assert.equal((await svc.accessFor(A, { fresh: true })).unlocked, true);
});

test("two students typing the same code at the same moment: only one gets in", async () => {
  const { store, svc } = setup();
  const code = await one(svc);
  const res = await Promise.allSettled([svc.redeem(code, A), svc.redeem(code, B)]);
  assert.deepEqual(res.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(store.data.quizcodes[0][4], "Unlocked");
  const winner = store.data.quizcodes[0][5];
  assert.ok([A, B].includes(winner));
  assert.equal((await svc.accessFor(winner === A ? B : A, { fresh: true })).unlocked, false);
});

test("revoke: a cancelled code cannot be used", async () => {
  const { store, svc } = setup();
  const code = await one(svc);
  const out = await svc.revoke(code, admin);
  assert.deepEqual(out, { code, status: "Revoked", wasOpen: false });
  assert.equal(store.data.quizcodes[0][8], "ngozi, 18 Oct 2026, 10:00:00");
  await rejects(svc.redeem(code, A), 400, "code");
});

test("revoke: cancelling a code in use locks that student's quiz straight away", async () => {
  const { svc } = setup();
  const code = await one(svc);
  await svc.redeem(code, A);
  const out = await svc.revoke(code.toLowerCase(), admin);
  assert.equal(out.wasOpen, true);
  assert.equal((await svc.accessFor(A, { fresh: true })).unlocked, false);
  assert.equal(await svc.complete(A), null, "nothing left to finish");
});

test("revoke: a spent code cannot be cancelled, an unknown one is not found, cancelling twice is harmless", async () => {
  const { svc } = setup();
  const code = await one(svc);
  await svc.redeem(code, A);
  await svc.complete(A);
  await rejects(svc.revoke(code, admin), 409);
  await rejects(svc.revoke("QZ-NOPE-NOPE", admin), 404);
  await rejects(svc.revoke("", admin), 404);
  const c2 = await one(svc);
  await svc.revoke(c2, admin);
  assert.equal((await svc.revoke(c2, admin)).status, "Revoked");
});

test("list: newest first, with the status of each code", async () => {
  const { svc } = setup();
  const c1 = await one(svc);
  const c2 = await one(svc, B);
  await svc.redeem(c1, A);
  const list = await svc.list();
  assert.deepEqual(list.map((c) => [c.code, c.status, c.forReg, c.usedBy]), [[c2, "Unused", B, ""], [c1, "Unlocked", "", A]]);
});

test("rows typed into the sheet by hand work like made ones", async () => {
  const { store, svc } = setup();
  store.data.quizcodes.push(["HAND-1234"]); // no status at all: a fresh code
  store.data.quizcodes.push(["HAND-USED", "", "", "", "", A]); // no status but names who used it: already spent
  assert.equal((await svc.redeem("hand1234", B)).unlocked, true);
  await rejects(svc.redeem("HAND-USED", A), 400, "code");
});

test("the 'is the quiz open' display may be a few seconds old, but anything that decides is fresh", async () => {
  const { store, svc } = setup({ cacheMs: 60000 });
  const code = await one(svc);
  assert.equal((await svc.accessFor(A)).unlocked, false); // fills the short-lived copy
  await svc.redeem(code, A); // a change forgets that copy
  assert.equal((await svc.accessFor(A)).unlocked, true);
  // a sheet edited by hand behind the website's back: the display can lag, the deciding check cannot
  store.data.quizcodes[0][4] = "Revoked";
  assert.equal((await svc.accessFor(A)).unlocked, true, "display copy");
  assert.equal((await svc.accessFor(A, { fresh: true })).unlocked, false, "deciding check");
});
