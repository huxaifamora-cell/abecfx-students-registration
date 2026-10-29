// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const attendance = require("../attendance");
const { createMemoryStore } = require("./support/memory-store");

const A = "ABECFX/26/0001";
const B = "ABECFX/26/0002";
const C = "ABECFX/26/0003";
const admin = { username: "ngozi" };
const LINK = "https://meet.google.com/abc-defg-hij";

function setup() {
  const store = createMemoryStore();
  const clock = { t: Date.parse("2026-10-30T10:00:00Z") };
  const svc = attendance.create(store, { now: () => "30 Oct 2026, 11:00:00", nowMs: () => clock.t });
  const minutes = (n) => { clock.t += n * 60000; };
  return { store, svc, clock, minutes };
}

test("a class needs a name and a real Google Meet link", async () => {
  const { svc } = setup();
  await assert.rejects(svc.start({ title: "", link: "https://example.com/x" }, admin), (e) => e.status === 400 && Boolean(e.fields.title) && Boolean(e.fields.link));
  await assert.rejects(svc.start({ title: "Week 1", link: "http://meet.google.com/abc-defg-hij" }, admin), (e) => Boolean(e.fields.link));
  const c = await svc.start({ title: "Week 1", link: LINK }, admin);
  assert.equal(c.live, true);
});

test("only one class can be live at a time", async () => {
  const { svc } = setup();
  await svc.start({ title: "Week 1", link: LINK }, admin);
  await assert.rejects(svc.start({ title: "Week 2", link: LINK }, admin), (e) => e.status === 409);
  await svc.end(admin);
  await svc.start({ title: "Week 2", link: LINK }, admin);
});

test("a student is present with at least 50% of the class, absent below it", async () => {
  const { svc, minutes } = setup();
  const c = await svc.start({ title: "Week 1", link: LINK }, admin);
  // A is there for the whole 60 minutes, B for the last 20, C for 30 (exactly half).
  for (let m = 0; m < 60; m++) {
    await svc.heartbeat(A, c.id);
    if (m >= 40) await svc.heartbeat(B, c.id);
    if (m < 30) await svc.heartbeat(C, c.id);
    await svc.heartbeat(A, c.id); // a second tab in the same minute never counts twice
    minutes(1);
  }
  await svc.end(admin);
  const r = await svc.report(c.id);
  const by = Object.fromEntries(r.people.map((p) => [p.reg, p]));
  assert.equal(by[A].minutes, 60);
  assert.equal(by[A].present, true);
  assert.equal(by[B].present, false);
  assert.equal(by[B].percent, 33);
  assert.equal(by[C].present, true);
  assert.equal(r.class.lengthMinutes, 60);
});

test("heartbeats for the wrong or an ended class are ignored", async () => {
  const { svc, store } = setup();
  const c = await svc.start({ title: "Week 1", link: LINK }, admin);
  assert.equal((await svc.heartbeat(A, "CL-NOPE")).live, false);
  assert.equal((await svc.heartbeat(A, c.id)).live, true);
  await svc.end(admin);
  assert.equal((await svc.heartbeat(A, c.id)).live, false);
  assert.equal(store.data.attendance.length, 1); // the one minute from before the class ended was saved
});

test("minutes are saved in one batch, not once per heartbeat", async () => {
  const { svc, store, minutes } = setup();
  const c = await svc.start({ title: "Week 1", link: LINK }, admin);
  for (let m = 0; m < 5; m++) { await svc.heartbeat(A, c.id); await svc.heartbeat(B, c.id); minutes(1); }
  assert.equal(store.data.attendance.length, 0);
  await svc.flush();
  assert.equal(store.data.attendance.length, 2);
  await svc.flush(); // nothing new: nothing written
  assert.equal(store.data.attendance.length, 2);
  await svc.heartbeat(A, c.id);
  await svc.end(admin);
  const r = await svc.report(c.id);
  assert.equal(r.people.find((p) => p.reg === A).minutes, 5);
});

test("a student sees the live class link and their own record only", async () => {
  const { svc, minutes } = setup();
  const c = await svc.start({ title: "Week 1", link: LINK }, admin);
  await svc.heartbeat(A, c.id);
  minutes(10);
  const mine = await svc.forStudent(A);
  assert.equal(mine.live.link, LINK);
  assert.equal(mine.history[0].minutes, 1);
  const other = await svc.forStudent(B);
  assert.equal(other.history[0].minutes, 0);
  await svc.end(admin);
  assert.equal((await svc.forStudent(A)).live, null);
});
