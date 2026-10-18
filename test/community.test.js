// The student Community page: the WhatsApp and Telegram groups an admin (or a role with the "community" access) sets,
// only for signed-in students. Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const links = require("../links");
const { boot, A } = require("./support/boot-server");

test("community links: their own fields, https only, and no fallback to the official channel", () => {
  assert.deepEqual(links.COMMUNITY_KEYS, ["communityWhatsapp", "communityTelegram"]);
  assert.ok(links.siteFields().every((f) => !links.COMMUNITY_KEYS.includes(f.key)), "Site links does not list the groups");
  assert.deepEqual(links.communityFields().map((f) => f.key), links.COMMUNITY_KEYS);
  const ok = links.sanitize({ communityWhatsapp: "chat.whatsapp.com/ABC123", communityTelegram: "https://t.me/+xyz" });
  assert.equal(ok.values.communityWhatsapp, "https://chat.whatsapp.com/ABC123");
  assert.deepEqual(ok.errors, {});
  const bad = links.sanitize({ communityWhatsapp: "javascript:alert(1)", communityTelegram: "http://t.me/x" });
  assert.ok(bad.errors.communityWhatsapp && bad.errors.communityTelegram);

  const set = { whatsapp: "https://whatsapp.com/channel/official", telegram: "https://t.me/official", communityWhatsapp: "https://chat.whatsapp.com/G", communityTelegram: "" };
  assert.deepEqual(links.communityFor(set), { whatsapp: "https://chat.whatsapp.com/G", telegram: "" }, "an empty group is not replaced by the official channel");
  assert.deepEqual(links.communityFor({}), { whatsapp: "", telegram: "" });
  assert.deepEqual(links.communityFor(links.DEFAULTS), { whatsapp: "", telegram: "" }, "nothing is offered until a group is set");
  const pub = links.publicView(set);
  assert.ok(!("communityWhatsapp" in pub) && !("communityTelegram" in pub), "not in the public list");
  assert.equal(pub.whatsapp, set.whatsapp);
});

test("community page: students only, empty until a group is set, then the groups an admin sets", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const a = await s.studentToken(A);
  const admin = await s.adminToken();

  assert.equal((await s.call("GET", "/api/community")).status, 401);
  assert.equal((await s.call("GET", "/api/community", { token: admin })).status, 401, "an admin token is not a student sign-in");

  // nothing set yet: no buttons (the official channel is NOT used instead)
  let r = await s.call("GET", "/api/community", { token: a });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { whatsapp: "", telegram: "" });

  // the Community tab offers exactly the two group fields
  const cur = (await s.call("GET", "/api/admin/community", { token: admin })).body;
  assert.deepEqual(cur.fields.map((f) => f.key), ["communityWhatsapp", "communityTelegram"]);
  r = await s.call("PUT", "/api/admin/community", { token: admin, body: { communityWhatsapp: "https://chat.whatsapp.com/GROUP1", communityTelegram: "https://t.me/+GROUP2" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await s.call("GET", "/api/community", { token: a });
  assert.deepEqual(r.body, { whatsapp: "https://chat.whatsapp.com/GROUP1", telegram: "https://t.me/+GROUP2" });

  // one group can be cleared on its own
  r = await s.call("PUT", "/api/admin/community", { token: admin, body: { communityWhatsapp: "https://chat.whatsapp.com/GROUP1", communityTelegram: "" } });
  assert.equal(r.status, 200);
  assert.deepEqual((await s.call("GET", "/api/community", { token: a })).body, { whatsapp: "https://chat.whatsapp.com/GROUP1", telegram: "" });

  // the invite links are not on the public list, nor on the Site links tab
  r = await s.call("GET", "/api/links");
  assert.ok(!JSON.stringify(r.body).includes("GROUP1"));
  assert.equal(r.body.facebook, links.DEFAULTS.facebook, "the other links are still public");
  const site = (await s.call("GET", "/api/admin/links", { token: admin })).body;
  assert.ok(!site.fields.some((f) => /^community/.test(f.key)) && !("communityWhatsapp" in site.values));

  // saving Site links neither shows nor wipes the groups; saving the groups leaves Site links alone
  r = await s.call("PUT", "/api/admin/links", { token: admin, body: { ...site.values, facebook: "https://www.facebook.com/changed", communityWhatsapp: "https://chat.whatsapp.com/HIJACK" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual((await s.call("GET", "/api/community", { token: a })).body, { whatsapp: "https://chat.whatsapp.com/GROUP1", telegram: "" }, "Site links cannot change the groups");
  r = await s.call("PUT", "/api/admin/community", { token: admin, body: { communityWhatsapp: "https://chat.whatsapp.com/GROUP3", communityTelegram: "https://t.me/+GROUP4", facebook: "https://evil.example/" } });
  assert.equal(r.status, 200);
  assert.equal((await s.call("GET", "/api/links")).body.facebook, "https://www.facebook.com/changed", "the Community tab leaves the other links alone");

  // a bad address is refused
  r = await s.call("PUT", "/api/admin/community", { token: admin, body: { communityWhatsapp: "https://chat.whatsapp.com/OK", communityTelegram: "javascript:alert(1)" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.communityTelegram);
  assert.equal(s.log(), "", s.log());
});

test("community access: admin and editor have it; a custom role can be given just this; others cannot", async (t) => {
  const s = await boot();
  t.after(() => s.stop());
  const owner = await s.adminToken();
  const a = await s.studentToken(A);
  const put = (token) => s.call("PUT", "/api/admin/community", { token, body: { communityWhatsapp: "https://chat.whatsapp.com/ROLEGRP", communityTelegram: "" } });

  assert.equal((await s.call("GET", "/api/admin/community")).status, 401, "not signed in");
  assert.equal((await s.call("GET", "/api/admin/community", { token: a })).status, 401, "a student's sign-in is not enough");

  // moderator cannot; editor can
  for (const [role, status] of [["moderator", 403], ["editor", 200]]) {
    let r = await s.call("POST", "/api/admin/team", { token: owner, body: { username: role + "1", fullName: "Test " + role, role, password: "goodpass123" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const tok = await s.adminToken(role + "1", "goodpass123");
    assert.equal((await s.call("GET", "/api/admin/community", { token: tok })).status, status, role + " read");
    assert.equal((await put(tok)).status, status, role + " save");
  }

  // the dashboard offers "community" as access for a custom role; with only that, nothing else opens
  let r = await s.call("GET", "/api/admin/team", { token: owner });
  assert.ok(r.body.permissions.some((p) => p.key === "community"));
  r = await s.call("POST", "/api/admin/roles", { token: owner, body: { name: "Community manager", perms: ["community"] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.perms, ["view", "community"]);
  r = await s.call("POST", "/api/admin/team", { token: owner, body: { username: "comm1", fullName: "Com Munity", role: "community-manager", password: "goodpass123" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cm = await s.adminToken("comm1", "goodpass123");
  assert.equal((await put(cm)).status, 200, "a role in charge of the community can set the groups");
  assert.deepEqual((await s.call("GET", "/api/community", { token: a })).body, { whatsapp: "https://chat.whatsapp.com/ROLEGRP", telegram: "" });
  assert.equal((await s.call("GET", "/api/admin/links", { token: cm })).status, 403, "no Site links");
  assert.equal((await s.call("PUT", "/api/admin/links", { token: cm, body: {} })).status, 403);
  assert.equal((await s.call("GET", "/api/admin/team", { token: cm })).status, 403);
  assert.equal((await s.call("GET", "/api/admin/database", { token: cm })).status, 403);
});
