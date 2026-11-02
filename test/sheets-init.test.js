// Start-up must not use up Google's 60 reads a minute: the tab list and every header row are read once, not once per tab.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

const reads = [];
const writes = [];
const tabs = new Map(); // title -> sheetId
let nextId = 1;
const realLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === "google-auth-library") {
    return {
      JWT: class {
        async request({ url, method = "GET", data }) {
          const path = url.replace(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[^/?:]+/, "");
          if (method === "GET") {
            reads.push(path);
            if (path.startsWith("?fields=")) return { data: { sheets: [...tabs].map(([title, sheetId]) => ({ properties: { title, sheetId } })) } };
            if (path.startsWith("/values:batchGet")) {
              const ranges = [...path.matchAll(/ranges=([^&]+)/g)].map((m) => decodeURIComponent(m[1]));
              return { data: { valueRanges: ranges.map(() => ({})) } };
            }
            return { data: {} }; // a single range with no values
          }
          writes.push({ method, path });
          if (path === ":batchUpdate" && data.requests[0].addSheet) {
            const title = data.requests[0].addSheet.properties.title;
            tabs.set(title, nextId++);
            return { data: { replies: [{ addSheet: { properties: { title, sheetId: tabs.get(title) } } }] } };
          }
          return { data: {} };
        }
      },
    };
  }
  return realLoad.call(this, req, ...rest);
};
process.env.GOOGLE_SHEET_ID = "x";
process.env.GOOGLE_CLIENT_EMAIL = "a@b.c";
process.env.GOOGLE_PRIVATE_KEY = "k";
const sheets = require("../sheets");

test("start-up on a sheet that already has its tabs makes only a handful of reads", async () => {
  await sheets.init(); // first run creates the tabs
  reads.length = 0; writes.length = 0;
  await sheets.init(); // restart: every tab already exists
  assert.ok(tabs.size >= 30, "the site keeps many tabs (" + tabs.size + ")");
  assert.ok(reads.length <= 8, "reads at start-up: " + reads.length + " (Google allows 60 a minute)");
  assert.equal(writes.filter((w) => w.path === ":batchUpdate" && w.method === "POST").length, 1, "only the dropdown batch, no tab is created again");
});

test("a new Multi-FX tab is created and given its header without re-reading the tab list", async () => {
  tabs.delete("Multi-FX Codes");
  reads.length = 0; writes.length = 0;
  await sheets.init();
  assert.ok(tabs.has("Multi-FX Codes"));
  assert.ok(reads.length <= 8, "reads: " + reads.length);
  assert.ok(writes.some((w) => w.method === "PUT" && /Multi-FX%20Codes/.test(w.path)), "header row written");
});
