// End to end: the real server.js runs against an in-memory Google Sheet (test/support/fake-sheets.js) and is
// called over HTTP, so this checks the routes and the lock itself, not just quizcodes.js.
// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const KEY = "test-quiz-key";
const OWNER_PW = "owner-password-1";
const A = "ABECFX/26/0001";
const B = "ABECFX/26/0002";
const C = "ABECFX/26/0003";
const email = (reg) => "ada" + Number(reg.slice(-4)) + "@example.com";

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on("error", reject);
  });
}

// Start server.js with extra environment variables. Returns helpers and a stop().
async function boot(extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ["-r", path.join(__dirname, "support/fake-sheets.js"), path.join(__dirname, "../server.js")], {
    env: { ...process.env, PORT: String(port), QUIZ_API_KEY: KEY, ADMIN_PASSWORD: OWNER_PW, QUIZ_APP_URL: "https://quiz.example.com", KEEP_AWAKE: "off", RENDER_EXTERNAL_URL: "", ...extraEnv },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let log = "";
  child.stderr.on("data", (d) => { log += d; });
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/healthz")).ok) break; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
    if (child.exitCode !== null) throw new Error("server exited early: " + log);
  }
  const call = async (method, url, { token, body, headers } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}), ...(headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, body: json };
  };
  const studentToken = async (reg) => (await call("POST", "/api/portal/login", { body: { reg, email: email(reg) } })).body.token;
  const adminToken = async (username = "owner", password = OWNER_PW) => (await call("POST", "/api/admin/login", { body: { username, password } })).body.token;
  const bot = (method, url, body) => call(method, url, { body, headers: { "x-quiz-key": KEY } });
  return { call, studentToken, adminToken, bot, stop: () => child.kill(), log: () => log };
}

const portalResult = (reg, score, total) => ({ reg, score, total, source: "portal" });

test("the quiz is locked until a code is entered, and a code works for one quiz", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const admin = await s.adminToken();
  const a = await s.studentToken(A);
  assert.ok(admin && a);

  // 1. locked
  let r = await s.call("GET", "/api/results", { token: a });
  assert.equal(r.status, 200);
  assert.equal(r.body.unlocked, false);
  r = await s.call("GET", "/api/quiz/session", { token: a });
  assert.equal(r.status, 403);
  assert.equal(r.body.locked, true);
  r = await s.bot("POST", "/api/quiz/result", portalResult(A, 8, 10));
  assert.equal(r.status, 403, "a result cannot be saved while the quiz is locked");
  assert.equal(r.body.locked, true);
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.attempts.length, 0, "and nothing was saved");

  // 2. an admin makes a code
  r = await s.call("POST", "/api/admin/quiz-codes", { token: admin, body: { count: 2 } });
  assert.equal(r.status, 200);
  const [c1, c2] = r.body.codes.map((c) => c.code);
  assert.match(c1, /^QZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  // 3. entering it opens the quiz (any capitals/dashes)
  r = await s.call("POST", "/api/quiz/unlock", { token: a, body: { code: c1.toLowerCase().replace(/-/g, " ") } });
  assert.equal(r.status, 200);
  assert.equal(r.body.unlocked, true);
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.unlocked, true);
  r = await s.call("GET", "/api/quiz/session", { token: a });
  assert.equal(r.status, 200);
  assert.match(r.body.url, /^https:\/\/quiz\.example\.com\/#t=/);

  // 4. the code is one-time: nobody else can use it while it is open
  const b = await s.studentToken(B);
  r = await s.call("POST", "/api/quiz/unlock", { token: b, body: { code: c1 } });
  assert.equal(r.status, 400);
  assert.equal((await s.call("GET", "/api/quiz/session", { token: b })).status, 403);

  // 5. it stays open until the quiz is finished (e.g. after signing in again on another device)
  const a2 = await s.studentToken(A);
  assert.equal((await s.call("GET", "/api/results", { token: a2 })).body.unlocked, true);

  // 6. the finished quiz is saved, and the quiz locks again
  r = await s.bot("POST", "/api/quiz/result", portalResult(A, 8, 10));
  assert.equal(r.status, 200);
  assert.equal(r.body.grade, "A");
  r = await s.call("GET", "/api/results", { token: a });
  assert.equal(r.body.unlocked, false);
  assert.equal(r.body.attempts.length, 1);
  assert.equal((await s.call("GET", "/api/quiz/session", { token: a })).status, 403);

  // 7. the same finished result sent twice is still just one result ...
  r = await s.bot("POST", "/api/quiz/result", portalResult(A, 8, 10));
  assert.equal(r.status, 200);
  assert.equal(r.body.duplicate, true);
  // ... but trying the quiz again with the old page is refused
  r = await s.bot("POST", "/api/quiz/result", portalResult(A, 10, 10));
  assert.equal(r.status, 403);
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.attempts.length, 1);

  // 8. the spent code is dead; a new code opens the quiz for the next attempt
  r = await s.call("POST", "/api/quiz/unlock", { token: a, body: { code: c1 } });
  assert.equal(r.status, 400);
  r = await s.call("POST", "/api/quiz/unlock", { token: a, body: { code: c2 } });
  assert.equal(r.status, 200);
  r = await s.bot("POST", "/api/quiz/result", portalResult(A, 5, 10));
  assert.equal(r.status, 200);
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.attempts.length, 2);

  // 9. the dashboard shows what happened
  r = await s.call("GET", "/api/admin/quiz-codes", { token: admin });
  assert.deepEqual(r.body.codes.map((c) => [c.code, c.status, c.usedBy]).sort(), [[c1, "Completed", A], [c2, "Completed", A]].sort());
  assert.equal(r.body.codes[0].usedByName, "Ada Obi 1");
  assert.equal(s.log(), "", "no server errors: " + s.log());
});

test("a code made for one student, and a code cancelled by an admin", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const admin = await s.adminToken();
  const a = await s.studentToken(A);
  const b = await s.studentToken(B);

  let r = await s.call("POST", "/api/admin/quiz-codes", { token: admin, body: { count: 1, forReg: B } });
  assert.equal(r.status, 200);
  assert.equal(r.body.codes[0].forReg, B);
  assert.equal(r.body.codes[0].forName, "Ada Obi 2");
  const forB = r.body.codes[0].code;
  r = await s.call("POST", "/api/quiz/unlock", { token: a, body: { code: forB } });
  assert.equal(r.status, 400, "another student cannot use it");
  r = await s.call("POST", "/api/quiz/unlock", { token: b, body: { code: forB } });
  assert.equal(r.status, 200);
  assert.equal((await s.call("GET", "/api/quiz/session", { token: b })).status, 200);

  // cancelling a code in use locks the quiz at once
  r = await s.call("POST", "/api/admin/quiz-codes/revoke", { token: admin, body: { code: forB } });
  assert.equal(r.status, 200);
  assert.equal(r.body.wasOpen, true);
  assert.equal((await s.call("GET", "/api/quiz/session", { token: b })).status, 403);
  assert.equal((await s.bot("POST", "/api/quiz/result", portalResult(B, 9, 10))).status, 403);

  // a code for a student that does not exist, and bad counts, are refused
  r = await s.call("POST", "/api/admin/quiz-codes", { token: admin, body: { count: 1, forReg: "ABECFX/26/0099" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.forReg);
  r = await s.call("POST", "/api/admin/quiz-codes", { token: admin, body: { count: 500 } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.count);
});

test("only admins and roles given 'quizcodes' can make codes; students and other roles cannot", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const owner = await s.adminToken();
  const a = await s.studentToken(A);

  // not signed in, or a student's sign-in, is not enough
  assert.equal((await s.call("GET", "/api/admin/quiz-codes")).status, 401);
  assert.equal((await s.call("POST", "/api/admin/quiz-codes", { body: { count: 1 } })).status, 401);
  assert.equal((await s.call("POST", "/api/admin/quiz-codes", { token: a, body: { count: 1 } })).status, 401);

  // built-in editor and moderator do not have it
  for (const role of ["editor", "moderator"]) {
    let r = await s.call("POST", "/api/admin/team", { token: owner, body: { username: role + "1", fullName: "Test " + role, role, password: "goodpass123" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const tok = await s.adminToken(role + "1", "goodpass123");
    r = await s.call("GET", "/api/admin/quiz-codes", { token: tok });
    assert.equal(r.status, 403, role);
    r = await s.call("POST", "/api/admin/quiz-codes", { token: tok, body: { count: 1 } });
    assert.equal(r.status, 403, role);
    r = await s.call("POST", "/api/admin/quiz-codes/revoke", { token: tok, body: { code: "QZ-AAAA-BBBB" } });
    assert.equal(r.status, 403, role);
  }

  // the dashboard offers 'quizcodes' as access that a custom role can be given
  let r = await s.call("GET", "/api/admin/team", { token: owner });
  assert.ok(r.body.permissions.some((p) => p.key === "quizcodes"));
  r = await s.call("POST", "/api/admin/roles", { token: owner, body: { name: "Quiz supervisor", perms: ["quizcodes"] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.perms, ["view", "quizcodes"]);
  r = await s.call("POST", "/api/admin/team", { token: owner, body: { username: "supervisor1", fullName: "Sup Ervisor", role: "quiz-supervisor", password: "goodpass123" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sup = await s.adminToken("supervisor1", "goodpass123");
  r = await s.call("POST", "/api/admin/quiz-codes", { token: sup, body: { count: 1 } });
  assert.equal(r.status, 200, "a role in charge of quiz codes can make them");
  const code = r.body.codes[0].code;
  assert.equal((await s.call("GET", "/api/admin/quiz-codes", { token: sup })).status, 200);
  // ... but nothing else beyond the basics
  assert.equal((await s.call("GET", "/api/admin/team", { token: sup })).status, 403);
  assert.equal((await s.call("GET", "/api/admin/database", { token: sup })).status, 403);
  // the code works for a student, and the supervisor is recorded as its maker
  assert.equal((await s.call("POST", "/api/quiz/unlock", { token: a, body: { code } })).status, 200);
  r = await s.call("GET", "/api/admin/quiz-codes", { token: owner });
  assert.equal(r.body.codes.find((c) => c.code === code).createdBy, "supervisor1");
});

test("quiz codes cannot be made or changed through the Database view", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const owner = await s.adminToken();
  const r = await s.call("GET", "/api/admin/database", { token: owner });
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.body).toLowerCase().includes("quizcodes"), "not listed");
  assert.equal((await s.call("POST", "/api/admin/database/quizcodes/rows", { token: owner, body: { text: "QZ-HAND-MADE" } })).status, 404);
  assert.equal((await s.call("GET", "/api/admin/database/quizcodes", { token: owner })).status, 404);
});

test("guessing codes is slowed down per student, not per network", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const c = await s.studentToken(C);
  const other = await s.studentToken(A);
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await s.call("POST", "/api/quiz/unlock", { token: c, body: { code: "QZ-WRONG-" + i } })).status);
  assert.deepEqual(codes, Array(8).fill(400));
  assert.equal((await s.call("POST", "/api/quiz/unlock", { token: c, body: { code: "QZ-WRONG-9" } })).status, 429);
  // a different student on the same network is not locked out
  assert.equal((await s.call("POST", "/api/quiz/unlock", { token: other, body: { code: "QZ-WRONG-1" } })).status, 400);
  // not signed in: refused before any code is looked at
  assert.equal((await s.call("POST", "/api/quiz/unlock", { body: { code: "QZ-WRONG-1" } })).status, 401);
});

test("Telegram: unchanged by default, but a finished Telegram quiz still spends an open code", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const admin = await s.adminToken();
  const a = await s.studentToken(A);

  // default: the bot works exactly as before, with or without a code
  assert.equal((await s.bot("GET", "/api/quiz/student?reg=" + encodeURIComponent(A))).status, 200);
  let r = await s.bot("POST", "/api/quiz/result", { reg: A, score: 4, total: 10, telegramId: "111" });
  assert.equal(r.status, 200);

  // with an open code, finishing on Telegram uses the code up
  const code = (await s.call("POST", "/api/admin/quiz-codes", { token: admin, body: { count: 1 } })).body.codes[0].code;
  await s.call("POST", "/api/quiz/unlock", { token: a, body: { code } });
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.unlocked, true);
  r = await s.bot("POST", "/api/quiz/result", { reg: A, score: 9, total: 10, telegramId: "111" });
  assert.equal(r.status, 200);
  assert.equal((await s.call("GET", "/api/results", { token: a })).body.unlocked, false);
});

test("Telegram with QUIZ_CODE_FOR_TELEGRAM=on: needs an open code to start and to save", async (t) => {
  const s = await boot({ QUIZ_CODE_FOR_TELEGRAM: "on" });
  t.after(() => s.stop());
  const admin = await s.adminToken();
  const a = await s.studentToken(A);

  let r = await s.bot("GET", "/api/quiz/student?reg=" + encodeURIComponent(A));
  assert.equal(r.status, 403);
  assert.equal(r.body.locked, true);
  assert.match(r.body.error, /quiz code/i);
  r = await s.bot("POST", "/api/quiz/result", { reg: A, score: 4, total: 10, telegramId: "111" });
  assert.equal(r.status, 403);
  // the bot's own key is still required
  assert.equal((await s.call("GET", "/api/quiz/student?reg=" + encodeURIComponent(A))).status, 401);

  const code = (await s.call("POST", "/api/admin/quiz-codes", { token: admin, body: { count: 1 } })).body.codes[0].code;
  await s.call("POST", "/api/quiz/unlock", { token: a, body: { code } });
  r = await s.bot("GET", "/api/quiz/student?reg=" + encodeURIComponent(A));
  assert.equal(r.status, 200);
  assert.equal(r.body.fullName, "Ada Obi 1");
  r = await s.bot("POST", "/api/quiz/result", { reg: A, score: 9, total: 10, telegramId: "111" });
  assert.equal(r.status, 200);
  assert.equal((await s.bot("GET", "/api/quiz/student?reg=" + encodeURIComponent(A))).status, 403, "locked again");
});
