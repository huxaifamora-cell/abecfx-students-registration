// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const { create, AdminError } = require("../admin-database");
const states = require("../states.json");
const { createMemoryStore, student, HEADERS } = require("./support/memory-store");

function setup(seed) {
  const store = createMemoryStore(seed || {
    students: [student(1), student(2), student(3)],
    codes: [["USEDCODE1", "1 Oct 2026, 09:00:00", "ABECFX/26/0001", "13 Oct 2026, 14:20:11"], ["FREECODE1", "1 Oct 2026, 09:00:00", "", ""]],
    quiz: [["13 Oct 2026, 15:00:00", "ABECFX/26/0001", "Ada Obi 1", "30", "40", "75", "A", "1", "portal", "{}", "2026-10-13T14:00:00Z"]],
    progress: [["ABECFX/26/0001", "Ada Obi 1", "01,02", "2", "12", "17", "13 Oct 2026, 16:00:00"]],
    links: [["facebook", "Facebook", "https://www.facebook.com/abeconsultfx"], ["about", "About text", "Hello"]],
    videos: [["01", "Welcome", ""], ["02", "Second", "https://youtu.be/abc123XYZ_0"]],
  });
  return { store, svc: create(store) };
}
const rejects = (p, status, field) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof AdminError, "expected an AdminError but got: " + e);
    assert.equal(e.status, status, e.message);
    if (field !== undefined) assert.ok(e.fields && e.fields[field], "expected an error on column " + field + ", got " + JSON.stringify(e.fields));
    return true;
  });

test("the column lists match the real sheets.js (when its dependencies are installed)", (t) => {
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  for (const k of Object.keys(HEADERS)) assert.deepEqual(real.EDITOR_TABS[k].headers, HEADERS[k], k);
  assert.deepEqual(real.STATUSES, createMemoryStore().STATUSES);
});

test("meta lists every sheet and what each allows", () => {
  const { svc } = setup();
  const m = svc.meta();
  assert.deepEqual(m.sheets.map((s) => s.key), ["students", "codes", "quiz", "progress", "links", "videos"]);
  const students = m.sheets[0];
  assert.deepEqual(students.editable.filter((i) => [0, 1, 8].includes(i)), [], "reg number, sign-up time and code are locked");
  assert.equal(students.canDelete, true);
  assert.match(students.deleteWarning, /photo, quiz results/);
  assert.equal(students.add.mode, "form");
  assert.equal(m.sheets[1].add.label, "Add codes");
  assert.deepEqual(m.sheets[2].editable, [3, 4]);
  assert.equal(m.sheets[2].canDelete, true);
  assert.ok(m.sheetUrl.startsWith("https://docs.google.com/"));
});

test("read returns every row with its sheet row number", async () => {
  const { svc } = setup();
  const d = await svc.read("students");
  assert.equal(d.rows.length, 3);
  assert.equal(d.rows[0].n, 2);
  assert.equal(d.rows[2].cells[0], "ABECFX/26/0003");
  await rejects(svc.read("photos"), 404);
  await rejects(svc.read("__proto__"), 404);
});

test("changing a student's status writes only that cell", async () => {
  const { svc, store } = setup();
  const original = student(2);
  const out = await svc.update("students", 3, original, { 9: "Certified", 4: original[4] });
  assert.equal(out.changed, true);
  assert.deepEqual(store.calls, [["write", "students", 3, { 9: "Certified" }]]);
  assert.equal(store.data.students[1][9], "Certified");
  assert.equal(store.data.students[0][9], "Uncertified");
});

test("a student edit is checked: status, email, gender, dates, name, phone", async () => {
  const { svc, store } = setup();
  const o = student(1);
  await rejects(svc.update("students", 2, o, { 9: "Wizard" }), 400, 9);
  await rejects(svc.update("students", 2, o, { 5: "not-an-email" }), 400, 5);
  await rejects(svc.update("students", 2, o, { 5: "ADA2@example.com" }), 400, 5); // belongs to student 2 (case ignored)
  await rejects(svc.update("students", 2, o, { 7: "Other" }), 400, 7);
  await rejects(svc.update("students", 2, o, { 4: "Madonna" }), 400, 4);
  await rejects(svc.update("students", 2, o, { 6: "12" }), 400, 6);
  await rejects(svc.update("students", 2, o, { 11: "2026-02-31" }), 400, 11);
  await rejects(svc.update("students", 2, o, { 13: "2999-01-01" }), 400, 13);
  assert.equal(store.calls.length, 0, "nothing was written");
  const ok = await svc.update("students", 2, o, { 5: "  New.Mail@Example.com ", 11: "2026-12-01", 13: "", 4: "Ada  Obi-Eze" });
  assert.equal(ok.row[5], "new.mail@example.com");
  assert.equal(ok.row[4], "Ada Obi-Eze");
  assert.equal(store.data.students[0][11], "2026-12-01");
  assert.equal(store.data.students[0][13], "");
});

test("a student's own email is not a duplicate of itself", async () => {
  const { svc } = setup();
  const o = student(1);
  const out = await svc.update("students", 2, o, { 5: o[5].toUpperCase() });
  assert.equal(out.row[5], o[5]); // lower-cased back to the same value
  assert.equal(out.changed, false);
});

test("country and state must agree", async () => {
  const { svc } = setup();
  const o = student(1); // Nigeria / Lagos
  await rejects(svc.update("students", 2, o, { 2: "Ghana" }), 400, 12); // Lagos is not a Ghana region
  await rejects(svc.update("students", 2, o, { 2: "Atlantis" }), 400, 2);
  const gh = states["Ghana"][0];
  const out = await svc.update("students", 2, o, { 2: "Ghana", 12: gh });
  assert.deepEqual([out.row[2], out.row[12]], ["Ghana", gh]);
});

test("locked columns cannot be changed, and a change to them is refused rather than ignored", async () => {
  const { svc, store } = setup();
  const o = student(1);
  await rejects(svc.update("students", 2, o, { 0: "ABECFX/26/0099" }), 400, 0);
  await rejects(svc.update("students", 2, o, { 8: "SNEAKY" }), 400, 8);
  assert.equal(store.calls.length, 0);
  // sending a locked column unchanged is fine
  const out = await svc.update("students", 2, o, { 0: o[0], 9: "Certified" });
  assert.equal(out.changed, true);
});

test("Team Member is a tick: it needs a role, and a student can hold it too", async () => {
  const { svc } = setup();
  const o = student(1);
  await rejects(svc.update("students", 2, o, { 16: "Yes" }), 400, 14);
  const a = await svc.update("students", 2, o, { 16: "yes", 14: "  Head Mentor " });
  assert.equal(a.row[16], "Yes");
  assert.equal(a.row[9], "Uncertified", "still a student");
  assert.equal(a.row[14], "Head Mentor");
  const b = await svc.update("students", 2, a.row, { 16: "" });
  assert.equal(b.row[14], "", "the role is cleared once they are no longer team");
});

test("Not a student needs another card: Team Member or Alumni Member", async () => {
  const { svc } = setup();
  const o = student(1);
  await rejects(svc.update("students", 2, o, { 9: "Not a student" }), 400, 9);
  const a = await svc.update("students", 2, o, { 9: "Not a student", 17: "Yes" });
  assert.equal(a.row[9], "Not a student");
  assert.equal(a.row[17], "Yes");
  await rejects(svc.update("students", 2, a.row, { 16: "maybe" }), 400, 16);
});

test("a stale screen is refused: the row changed or moved since it was loaded", async () => {
  const { svc, store } = setup();
  const o = student(1);
  store.data.students[0][9] = "Graduate"; // someone edited it in Google Sheets
  await rejects(svc.update("students", 2, o, { 9: "Certified" }), 409);
  await rejects(svc.update("students", 9, o, { 9: "Certified" }), 409); // that row is gone / empty
  await rejects(svc.update("students", 2, undefined, { 9: "Certified" }), 409);
  assert.equal(store.calls.length, 0);
});

test("row numbers are checked", async () => {
  const { svc } = setup();
  for (const n of [1, 0, -4, "abc", 2.5, 5000000]) await rejects(svc.update("students", n, student(1), { 9: "CEO" }), 400);
});

test("mentorship codes: add many at once, upper-cased, with a creation time", async () => {
  const { svc, store } = setup();
  const out = await svc.create("codes", { text: "newcode1, newcode2\nNEW_CODE-3" });
  assert.equal(out.added, 3);
  const rows = store.data.codes.slice(2);
  assert.deepEqual(rows.map((r) => r[0]), ["NEWCODE1", "NEWCODE2", "NEW_CODE-3"]);
  assert.ok(rows.every((r) => r[1] && r[2] === "" && r[3] === ""));
});

test("mentorship codes: bad, repeated and existing codes are refused as a batch", async () => {
  const { svc, store } = setup();
  await rejects(svc.create("codes", { text: "" }), 400);
  await rejects(svc.create("codes", { text: "abc" }), 400); // too short
  await rejects(svc.create("codes", { text: "GOOD1234 bad code!" }), 400);
  await rejects(svc.create("codes", { text: "freecode1" }), 400); // already there (any case)
  await rejects(svc.create("codes", { text: "SAME1234 same1234" }), 400);
  await rejects(svc.create("codes", { text: Array.from({ length: 201 }, (_, i) => "CODE" + String(i).padStart(4, "0")).join(" ") }), 400);
  assert.equal(store.calls.length, 0, "a refused batch adds nothing");
});

test("mentorship codes: a used code is kept; a free one can be renamed or deleted", async () => {
  const { svc, store } = setup();
  const used = store.data.codes[0].slice(), free = store.data.codes[1].slice();
  await rejects(svc.update("codes", 2, used, { 0: "RENAMED1" }), 400, 0);
  await rejects(svc.update("codes", 3, free, { 0: "usedcode1" }), 400, 0); // taken
  await rejects(svc.update("codes", 3, free, { 2: "nonsense" }), 400, 2);
  const renamed = await svc.update("codes", 3, free, { 0: "fresh-code" });
  assert.equal(renamed.row[0], "FRESH-CODE");
  const gone = await svc.remove("codes", 3, renamed.row);
  assert.equal(gone.ok, true);
  assert.equal(store.data.codes.length, 1);
});

test("freeing a used code clears its 'used at' time", async () => {
  const { svc } = setup();
  const used = ["USEDCODE1", "1 Oct 2026, 09:00:00", "ABECFX/26/0001", "13 Oct 2026, 14:20:11"];
  const out = await svc.update("codes", 2, used, { 2: "" });
  assert.deepEqual([out.row[2], out.row[3]], ["", ""]);
});

test("site links use the same checks as the Site links tab", async () => {
  const { svc, store } = setup();
  const fb = store.data.links[0].slice();
  await rejects(svc.update("links", 2, fb, { 2: "javascript:alert(1)" }), 400, 2);
  await rejects(svc.update("links", 2, fb, { 2: "http://insecure.example.com" }), 400, 2);
  await rejects(svc.update("links", 2, fb, { 0: "tiktok" }), 400, 0); // the key column is locked
  const ok = await svc.update("links", 2, fb, { 2: "facebook.com/newpage" });
  assert.equal(ok.row[2], "https://facebook.com/newpage");
  const about = store.data.links[1].slice();
  const t = await svc.update("links", 3, about, { 2: "Line one\nLine two" });
  assert.equal(t.row[2], "Line one\nLine two");
  // a row whose key is not a real link cannot be edited
  store.data.links.push(["mystery", "?", "x"]);
  await rejects(svc.update("links", 4, ["mystery", "?", "x"], { 2: "y" }), 400, 2);
});

test("chapter videos only accept YouTube addresses", async () => {
  const { svc, store } = setup();
  const v = store.data.videos[0].slice();
  await rejects(svc.update("videos", 2, v, { 2: "https://example.com/video" }), 400, 2);
  const ok = await svc.update("videos", 2, v, { 2: "https://www.youtube.com/watch?v=abc123XYZ_0&t=5" });
  assert.equal(ok.row[2], "https://youtu.be/abc123XYZ_0");
  const cleared = await svc.update("videos", 3, store.data.videos[1].slice(), { 2: "" });
  assert.equal(cleared.row[2], "");
});

test("text that looks like a formula is stored as plain text, not changed", async () => {
  const { svc, store } = setup();
  const out = await svc.update("students", 2, student(1), { 3: "=HYPERLINK(\"http://evil\")" });
  assert.equal(out.row[3], "=HYPERLINK(\"http://evil\")");
  assert.equal(store.data.students[0][3], "=HYPERLINK(\"http://evil\")");
  // the store is asked to write it as-is (sheets.js sends valueInputOption RAW), never evaluated
});

test("deleting a used code is allowed (the student keeps their account)", async () => {
  const { svc, store } = setup();
  const used = store.data.codes[0].slice();
  assert.equal((await svc.remove("codes", 2, used)).ok, true);
  assert.equal(store.data.students.length, 3);
});

// ---------- create / delete students ----------
const NEW = { 2: "Ghana", 12: states["Ghana"][0], 4: "Kofi Mensah", 5: "Kofi@Example.com", 6: "+233 24 123 4567", 7: "Male" };

test("adding a student fills in number, time, ID date and defaults", async () => {
  const { svc, store } = setup();
  const out = await svc.create("students", { values: NEW });
  assert.match(out.reg, /^ABECFX\/\d{2}\/0004$/); // the seed has 0001 to 0003
  const row = store.data.students[3];
  assert.equal(row[5], "kofi@example.com");
  assert.equal(row[3], "Forex Mentorship");
  assert.equal(row[9], "Uncertified");
  assert.match(row[11], /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(row[1]);
  assert.equal(row.length, 15);
});

test("adding a student is checked like the registration form", async () => {
  const { svc, store } = setup();
  await rejects(svc.create("students", { values: {} }), 400, 2);
  await rejects(svc.create("students", { values: { ...NEW, 5: "ada1@example.com" } }), 400, 5); // taken
  await rejects(svc.create("students", { values: { ...NEW, 12: "Lagos" } }), 400, 12); // not a Ghana region
  await rejects(svc.create("students", { values: { ...NEW, 4: "Kofi" } }), 400, 4);
  await rejects(svc.create("students", { values: { ...NEW, 7: "" } }), 400, 7);
  await rejects(svc.create("students", { values: { ...NEW, 13: "2999-01-01" } }), 400, 13);
  assert.equal(store.calls.length, 0);
});

test("values for locked columns sent when adding are ignored", async () => {
  const { svc, store } = setup();
  await svc.create("students", { values: { ...NEW, 0: "ABECFX/26/0001", 1: "x", 8: "HACK" } });
  const row = store.data.students[3];
  assert.notEqual(row[0], "ABECFX/26/0001");
  assert.notEqual(row[1], "x");
  assert.equal(row[8], "");
});

test("a certified student added by the editor gets a status date", async () => {
  const { svc, store } = setup();
  await svc.create("students", { values: { ...NEW, 9: "Certified" } });
  assert.ok(store.data.students[3][10]);
});

test("a number recorded on a used code is not reused even after the student is deleted", async () => {
  const { svc, store } = setup();
  store.data.codes.push(["CODE3AB", "1 Oct 2026", "ABECFX/26/0003", "2 Oct 2026"]);
  await svc.remove("students", 4, store.data.students[2].slice());
  const a = await svc.create("students", { values: NEW });
  assert.ok(a.reg.endsWith("0004"), a.reg);
});

test("deleting a student also removes their photo, quiz results and progress", async () => {
  const { svc, store } = setup();
  store.data.photos.push(["ABECFX/26/0001", "AAAA"], ["ABECFX/26/0002", "BBBB"]);
  store.data.quiz.push(["x", "ABECFX/26/0002", "Ada Obi 2", "1", "2", "50", "C", "1", "portal", "{}", ""]);
  const gone = store.data.students[0].slice(); // student 1 has a photo, a quiz result and a progress row
  await svc.remove("students", 2, gone);
  assert.equal(store.data.students.length, 2);
  assert.deepEqual(store.data.photos.map((r) => r[0]), ["ABECFX/26/0002"]);
  assert.deepEqual(store.data.quiz.map((r) => r[1]), ["ABECFX/26/0002"]);
  assert.equal(store.data.progress.length, 0);
});

test("deleting a student with a stale screen is refused and removes nothing", async () => {
  const { svc, store } = setup();
  store.data.photos.push(["ABECFX/26/0001", "AAAA"]);
  const stale = student(1); stale[9] = "Graduate";
  await rejects(svc.remove("students", 2, stale), 409);
  assert.equal(store.data.photos.length, 1);
  assert.equal(store.data.students.length, 3);
});

// ---------- quiz ----------
test("editing a quiz score recalculates percent and grade", async () => {
  const { svc, store } = setup();
  const q = store.data.quiz[0].slice(); // 30 / 40 = 75 A
  const out = await svc.update("quiz", 2, q, { 3: "20", 4: "40" });
  assert.deepEqual([out.row[3], out.row[4], out.row[5], out.row[6]], ["20", "40", "50", "C"]);
  await rejects(svc.update("quiz", 2, out.row, { 3: "41" }), 400, 3);
  await rejects(svc.update("quiz", 2, out.row, { 3: "abc" }), 400, 3);
  await rejects(svc.update("quiz", 2, out.row, { 4: "0" }), 400, 4);
  await rejects(svc.update("quiz", 2, out.row, { 1: "ABECFX/26/0003" }), 400, 1); // reg number is locked
});

test("adding a quiz result needs a real student and works out name, grade and attempt", async () => {
  const { svc, store } = setup();
  await rejects(svc.create("quiz", { values: { 1: "nonsense", 3: "5", 4: "10" } }), 400, 1);
  await rejects(svc.create("quiz", { values: { 1: "ABECFX/26/0099", 3: "5", 4: "10" } }), 400, 1);
  await rejects(svc.create("quiz", { values: { 1: "ABECFX/26/0001", 3: "11", 4: "10" } }), 400, 3);
  const out = await svc.create("quiz", { values: { 1: "abecfx/26/0001", 3: "9", 4: "10" } });
  assert.deepEqual(out.row.slice(1, 9), ["ABECFX/26/0001", "Ada Obi 1", "9", "10", "90", "A", "2", "admin"]);
  assert.equal(store.data.quiz.length, 2);
});

// ---------- handbook progress ----------
test("editing progress recalculates count and percent; unknown chapters are refused", async () => {
  const { svc, store } = setup();
  const p = store.data.progress[0].slice();
  await rejects(svc.update("progress", 2, p, { 2: "01, 99" }), 400, 2);
  const out = await svc.update("progress", 2, p, { 2: "1, 0, 2" });
  assert.equal(out.row[2], "00,01,02");
  assert.equal(out.row[3], "3");
  assert.equal(out.row[5], String(Math.round((3 / Number(out.row[4])) * 100)));
  await rejects(svc.update("progress", 2, out.row, { 0: "ABECFX/26/0002" }), 400, 0); // locked
});

test("adding progress: one row per registered student", async () => {
  const { svc, store } = setup();
  await rejects(svc.create("progress", { values: { 0: "ABECFX/26/0001", 2: "00" } }), 400, 0); // has a row
  await rejects(svc.create("progress", { values: { 0: "ABECFX/26/0077", 2: "00" } }), 400, 0); // not a student
  await rejects(svc.create("progress", { values: { 0: "ABECFX/26/0002", 2: "zz" } }), 400, 2);
  const out = await svc.create("progress", { values: { 0: "abecfx/26/0002", 2: "00,01" } });
  assert.deepEqual([out.row[0], out.row[1], out.row[2], out.row[3]], ["ABECFX/26/0002", "Ada Obi 2", "00,01", "2"]);
  assert.equal(store.data.progress.length, 2);
});

test("fixed tables cannot gain or lose rows", async () => {
  const { svc } = setup();
  await rejects(svc.create("links", { values: { 0: "x" } }), 403);
  await rejects(svc.create("videos", { values: { 0: "x" } }), 403);
  await rejects(svc.remove("links", 2, ["facebook", "Facebook", "https://www.facebook.com/abeconsultfx"]), 403);
  await rejects(svc.remove("videos", 2, ["01", "Welcome", ""]), 403);
});
