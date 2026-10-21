// Starts the real server.js on a free port against the in-memory sheet (support/fake-sheets.js), for the HTTP tests.
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
  const child = spawn(process.execPath, ["-r", path.join(__dirname, "fake-sheets.js"), path.join(__dirname, "../../server.js")], {
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
  return { base, call, studentToken, adminToken, bot, stop: () => child.kill(), log: () => log };
}


module.exports = { boot, KEY, OWNER_PW, A, B, C, email };
