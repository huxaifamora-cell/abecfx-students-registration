// The student Community page: the official WhatsApp / Telegram, only for signed-in students.
// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const links = require("../links");
const { boot, A } = require("./support/boot-server");

test("community links: new fields, https only, and a fallback to the official channel", () => {
  assert.ok(links.FIELDS.some((f) => f.key === "communityWhatsapp"));
  assert.ok(links.FIELDS.some((f) => f.key === "communityTelegram"));
  const ok = links.sanitize({ communityWhatsapp: "chat.whatsapp.com/ABC123", communityTelegram: "https://t.me/+xyz" });
  assert.equal(ok.values.communityWhatsapp, "https://chat.whatsapp.com/ABC123");
  assert.deepEqual(ok.errors, {});
  const bad = links.sanitize({ communityWhatsapp: "javascript:alert(1)", communityTelegram: "http://t.me/x" });
  assert.ok(bad.errors.communityWhatsapp && bad.errors.communityTelegram);

  const set = { whatsapp: "https://whatsapp.com/channel/official", telegram: "https://t.me/official", communityWhatsapp: "https://chat.whatsapp.com/G", communityTelegram: "" };
  assert.deepEqual(links.communityFor(set), { whatsapp: "https://chat.whatsapp.com/G", telegram: "https://t.me/official" }, "an empty community link falls back to the official one");
  assert.deepEqual(links.communityFor({}), { whatsapp: "", telegram: "" });
  assert.deepEqual(links.communityFor(links.DEFAULTS), { whatsapp: links.DEFAULTS.whatsapp, telegram: links.DEFAULTS.telegram });
  const pub = links.publicView(set);
  assert.ok(!("communityWhatsapp" in pub) && !("communityTelegram" in pub), "not in the public list");
  assert.equal(pub.whatsapp, set.whatsapp);
});

test("community page: students only, falls back to the official links, then uses the ones an admin sets", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const a = await s.studentToken(A);
  const admin = await s.adminToken();

  // not signed in: nothing
  assert.equal((await s.call("GET", "/api/community")).status, 401);
  assert.equal((await s.call("GET", "/api/community", { token: admin })).status, 401, "an admin token is not a student sign-in");

  // nothing set yet: the official WhatsApp and Telegram
  let r = await s.call("GET", "/api/community", { token: a });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { whatsapp: links.DEFAULTS.whatsapp, telegram: links.DEFAULTS.telegram });

  // an admin sets the community links on Site links
  const cur = (await s.call("GET", "/api/admin/links", { token: admin })).body;
  assert.ok(cur.fields.some((f) => f.key === "communityWhatsapp"), "the dashboard offers the new fields");
  r = await s.call("PUT", "/api/admin/links", { token: admin, body: { ...cur.values, communityWhatsapp: "https://chat.whatsapp.com/GROUP1", communityTelegram: "https://t.me/+GROUP2" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await s.call("GET", "/api/community", { token: a });
  assert.deepEqual(r.body, { whatsapp: "https://chat.whatsapp.com/GROUP1", telegram: "https://t.me/+GROUP2" });

  // the invite links are not on the public list
  r = await s.call("GET", "/api/links");
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.body).includes("GROUP1") && !JSON.stringify(r.body).includes("GROUP2"));
  assert.equal(r.body.facebook, links.DEFAULTS.facebook, "the other links are still public");

  // a bad address is refused
  r = await s.call("PUT", "/api/admin/links", { token: admin, body: { ...cur.values, communityTelegram: "javascript:alert(1)" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.communityTelegram);
  assert.equal(s.log(), "", s.log());
});
