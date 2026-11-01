// Copy trading page inside the student portal (Alumni members follow a master; staff and mentors can be a master).
// Everything is drawn with textContent (never innerHTML), so nothing a master types can run as script.
(function () {
  var api = null; // { authFetch(url, opts), signedOut(msg) } from portal.js
  var allowFollow = false, allowMaster = false;
  var timer = null, busy = false, followData = null, masterData = null, chosen = "";

  function $(id) { return document.getElementById(id); }
  function money(n, cur) { return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? " " + cur : ""); }
  function when(iso) { return iso ? new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; }
  function pnl(n, cur) { return { t: (n > 0 ? "+" : "") + money(n, cur), cls: n > 0 ? "bot-up" : n < 0 ? "bot-down" : "" }; }
  function fillTable(t, head, rows, empty) {
    t.replaceChildren();
    if (!rows.length) { var cap = document.createElement("caption"); cap.textContent = empty; t.appendChild(cap); return; }
    var hr = t.createTHead().insertRow();
    head.forEach(function (h) { var th = document.createElement("th"); th.textContent = h; hr.appendChild(th); });
    var body = t.createTBody();
    rows.forEach(function (r) {
      var row = body.insertRow();
      r.forEach(function (v) {
        var c = row.insertCell();
        if (v && v.node) c.appendChild(v.node);
        else if (v && v.cls) { c.textContent = v.t; c.className = v.cls; }
        else c.textContent = v == null ? "" : v;
      });
    });
  }
  function fillList(ul, items) {
    ul.replaceChildren();
    if (!items.length) { var li0 = document.createElement("li"); li0.textContent = "Nothing yet."; ul.appendChild(li0); }
    items.forEach(function (e) { var li = document.createElement("li"); li.className = "bot-" + e.kind; li.textContent = when(e.at) + " - " + e.message; ul.appendChild(li); });
  }

  function call(url, method, body) {
    var o = { method: method || "GET", headers: {} };
    if (body) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return api.authFetch(url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (r.status === 401) { stop(); api.signedOut(b.error); throw new Error("signed out"); }
        if (!r.ok) { var e = new Error(b.error || "Something went wrong."); e.fields = b.errors; throw e; }
        return b;
      });
    });
  }
  function fail(el) { return function (err) { if (err.message !== "signed out") el.textContent = err.message; }; }

  // ---------- follow a master ----------
  function fillFollowForm(d) {
    var s = d.settings;
    $("cp-lot").value = s.lot; $("cp-open").value = s.maxOpen; $("cp-daily").value = s.maxDaily;
    $("cpAcceptRow").hidden = s.accepted;
    chosen = s.master || chosen;
  }

  function renderFollow(d, keepForm) {
    followData = d;
    var st = $("copyStatus");
    var s = d.settings;
    if (!d.enabled) st.textContent = "Copy trading is switched off on the server. Ask the admin to turn it on.";
    else if (!d.connection.linked) st.textContent = "First link your MetaTrader 5 account: open Bot trading, then Account link, and set up the connector.";
    else if (!d.connection.connected) st.textContent = "Your account is linked, but your MT5 connector is not reporting right now. Check that MT5 is open and the connector is on a chart.";
    else if (s.on) st.textContent = "Copying " + s.masterName + ". Today: " + d.today.used + " of " + d.today.max + " copied trades used." + (d.hosted ? " Your connector runs on the ABEC-FX VPS." : "");
    else st.textContent = "Connected. Choose a master below to start copying.";
    if (!keepForm) fillFollowForm(d);

    var rows = d.masters.map(function (m) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn " + (m.mine ? "ghost" : "primary");
      btn.textContent = m.self ? "You" : m.mine ? "Following" : chosen === m.code ? "Chosen" : "Choose";
      btn.disabled = m.self || m.mine;
      btn.addEventListener("click", function () { chosen = m.code; $("copyMsg").textContent = "Chosen " + m.name + ". Check your settings and press Start copying."; renderFollow(followData, true); });
      var who = document.createElement("span");
      who.textContent = m.name;
      var about = document.createElement("small");
      about.className = "hint";
      about.textContent = m.about ? " " + m.about : "";
      var cell = document.createElement("span");
      cell.appendChild(who);
      if (m.about) { cell.appendChild(document.createElement("br")); cell.appendChild(about); }
      return [
        { node: cell }, (m.online ? "Online" : "Offline") + (m.hosted ? " (ABEC-FX VPS)" : ""), m.openNow, m.stats.trades, m.stats.winRate == null ? "-" : m.stats.winRate + "%",
        pnl(m.stats.profit, m.currency), m.followers, { node: btn },
      ];
    });
    fillTable($("copyMasters"), ["Master", "Status", "Open now", "Closed trades", "Win rate", "Net profit", "Followers", ""], rows, "No master is listed yet. Check again later.");
    $("copyChosen").textContent = chosen
      ? "Selected: " + ((d.masters.filter(function (m) { return m.code === chosen; })[0] || {}).name || chosen) : "No master selected.";
    $("copyStop").hidden = !s.on;
    $("copyStart").textContent = s.on ? "Save settings" : "Start copying";

    fillTable($("copyOpen"), ["Market", "Type", "Lots", "SL", "TP", "Profit / loss"],
      d.copied.map(function (p) { return [p.symbol, p.side, p.lots, p.sl || "-", p.tp || "-", pnl(p.profit, "")]; }), "No copied trades are open.");
    fillList($("copyActivity"), d.activity);
  }

  function loadFollow(keepForm) {
    return call("/api/portal/copy").then(function (d) { renderFollow(d, keepForm); }).catch(fail($("copyStatus")));
  }

  function saveFollow(on) {
    ["master", "lot", "maxOpen", "maxDaily", "acceptRisk", "connection"].forEach(function (k) { var e = $("cp-e-" + k); if (e) e.textContent = ""; });
    $("copyMsg").textContent = "";
    var body = { lot: $("cp-lot").value, maxOpen: $("cp-open").value, maxDaily: $("cp-daily").value, on: on, acceptRisk: $("cp-accept").checked };
    if (on) body.master = chosen;
    busy = true;
    $("copyStart").disabled = true; $("copyStop").disabled = true;
    return call("/api/portal/copy/follow", "PUT", body).then(function (d) {
      renderFollow(d, false);
      $("copyMsg").textContent = on ? "Saved." : "Stopped. Trades already open stay open: manage them in MT5.";
    }).catch(function (err) {
      if (err.message === "signed out") return;
      var f = err.fields || {};
      ["master", "lot", "maxOpen", "maxDaily", "acceptRisk", "connection"].forEach(function (k) { var e = $("cp-e-" + k); if (e) e.textContent = f[k] || ""; });
      $("copyMsg").textContent = err.fields ? "Please fix the highlighted fields." : err.message;
    }).then(function () { busy = false; $("copyStart").disabled = false; $("copyStop").disabled = false; });
  }

  // ---------- hosting on the ABEC-FX VPS ----------
  var hostData = null;
  function renderHost(d) {
    hostData = d;
    var c = d.current;
    var open = c && (c.status === "Requested" || c.status === "Approved" || c.status === "Active");
    var msg = {
      Requested: "Your request is waiting for ABEC-FX. Nothing is needed from you yet.",
      Approved: "Approved. ABEC-FX will contact you to arrange access privately. Do not send your password through this website.",
      Active: "Your connector runs on the ABEC-FX VPS. You do not need to keep your own MT5 open.",
      Declined: "Your last request was declined. You can ask again.",
      Cancelled: "You cancelled your last request. You can ask again.",
      Ended: "Hosting has ended. If you gave your trading password to ABEC-FX staff, change it in MT5 now to be sure access is gone.",
    };
    $("hostStatus").textContent = !d.enabled ? "Hosting is switched off right now." : c ? "Status: " + c.status + ". " + (msg[c.status] || "") : "No hosting request yet.";
    $("hostForm").hidden = !(d.enabled && d.canRequest);
    $("hostEnd").hidden = !open;
    $("hostEnd").textContent = c && c.status === "Active" ? "End hosting" : "Cancel request";
  }
  function loadHost() {
    return call("/api/portal/hosting").then(renderHost).catch(fail($("hostStatus")));
  }
  function setupHost() {
    $("hostForm").addEventListener("submit", function (e) {
      e.preventDefault();
      ["account", "server", "type", "consent"].forEach(function (k) { $("host-e-" + k).textContent = ""; });
      $("hostMsg").textContent = "";
      busy = true;
      call("/api/portal/hosting", "POST", { account: $("host-account").value, server: $("host-server").value, type: $("host-type").value, consent: $("host-consent").checked })
        .then(function (d) { renderHost(d); $("hostMsg").textContent = "Request sent."; $("host-consent").checked = false; })
        .catch(function (err) {
          if (err.message === "signed out") return;
          var f = err.fields || {};
          ["account", "server", "type", "consent"].forEach(function (k) { $("host-e-" + k).textContent = f[k] || ""; });
          $("hostMsg").textContent = err.fields ? "Please fix the highlighted fields." : err.message;
        }).then(function () { busy = false; });
    });
    $("hostEnd").addEventListener("click", function () {
      var running = hostData && hostData.current && hostData.current.status === "Active";
      if (!window.confirm(running ? "End hosting? Your connector stops running on the VPS. Change your trading password in MT5 afterwards if you gave it to ABEC-FX." : "Cancel your hosting request?")) return;
      call("/api/portal/hosting/end", "POST", {}).then(function (d) { renderHost(d); $("hostMsg").textContent = running ? "Hosting ended. Remember to change your trading password in MT5." : "Request cancelled."; }).catch(fail($("hostMsg")));
    });
  }

  // ---------- be a master ----------
  function renderMaster(d, keepForm) {
    masterData = d;
    var st = $("masterStatus");
    if (!d.enabled) st.textContent = "Copy trading is switched off on the server.";
    else if (!d.linked) st.textContent = "Not linked. Link your MetaTrader 5 account to become a master.";
    else if (!d.connected) st.textContent = "Linked, but your MT5 connector is not reporting right now.";
    else st.textContent = (d.listed ? "You are listed. " : "You are not listed yet. ") + d.followers + (d.followers === 1 ? " member follows" : " members follow") + " you.";
    if (!keepForm) {
      $("master-name").value = d.name || ""; $("master-about").value = d.about || ""; $("master-listed").checked = Boolean(d.listed);
    }
    $("masterLinkBtn").textContent = d.linked ? "Make a new key" : "Link account";
    $("masterDisconnect").hidden = !d.linked;
    $("masterSiteUrl").textContent = location.origin;
    var cur = (d.account && d.account.currency) || "";
    $("masterStats").textContent = d.stats.trades
      ? "Your closed trades: " + d.stats.trades + ", win rate " + d.stats.winRate + "%, net " + (d.stats.profit > 0 ? "+" : "") + money(d.stats.profit, cur) + ". Followers see these numbers."
      : "No closed trades recorded yet.";
    fillTable($("masterOpen"), ["Market", "Type", "Lots", "SL", "TP", "Profit / loss"],
      d.positions.map(function (p) { return [p.symbol, p.side, p.lots, p.sl || "-", p.tp || "-", pnl(p.profit, cur)]; }), "No open trades.");
  }
  function loadMaster(keepForm) {
    return call("/api/portal/copy/master").then(function (d) { renderMaster(d, keepForm); }).catch(fail($("masterStatus")));
  }

  function tick() { if (busy) return; if (allowFollow) { loadFollow(true); loadHost(); } if (allowMaster) loadMaster(true); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function show(follow, master) {
    stop();
    allowFollow = follow; allowMaster = master;
    $("copyFollowSection").hidden = !follow;
    $("copyMasterSection").hidden = !master;
    $("copyStatus").textContent = follow ? "Loading..." : "";
    $("masterStatus").textContent = master ? "Loading..." : "";
    if (follow) { loadFollow(false); loadHost(); }
    if (master) loadMaster(false);
    timer = setInterval(tick, 5000);
  }

  function setup(a) {
    api = a;
    setupHost();
    $("copyForm").addEventListener("submit", function (e) { e.preventDefault(); saveFollow(true); });
    $("copyStop").addEventListener("click", function () {
      if (window.confirm("Stop copying? Trades already open stay open and are no longer managed: close them in MT5 yourself.")) saveFollow(false);
    });
    $("copyBotPage").addEventListener("click", function () { window.location.hash = "#/bot"; });

    $("masterForm").addEventListener("submit", function (e) {
      e.preventDefault();
      ["name", "listed"].forEach(function (k) { $("master-e-" + k).textContent = ""; });
      $("masterMsg").textContent = "";
      busy = true;
      call("/api/portal/copy/master", "PUT", { name: $("master-name").value, about: $("master-about").value, listed: $("master-listed").checked })
        .then(function (d) { renderMaster(d, false); $("masterMsg").textContent = "Saved."; })
        .catch(function (err) {
          if (err.message === "signed out") return;
          var f = err.fields || {};
          ["name", "listed"].forEach(function (k) { $("master-e-" + k).textContent = f[k] || ""; });
          $("masterMsg").textContent = err.fields ? "Please fix the highlighted fields." : err.message;
        }).then(function () { busy = false; });
    });
    $("masterLinkBtn").addEventListener("click", function () {
      if (masterData && masterData.linked && !window.confirm("Making a new key stops the connector you have now. You will need to paste the new key into MT5. Continue?")) return;
      $("masterLinkMsg").textContent = "";
      call("/api/portal/copy/master/link", "POST", {}).then(function (r) {
        $("masterKey").textContent = r.key;
        $("masterKeyBox").hidden = false;
        return loadMaster(true);
      }).catch(fail($("masterLinkMsg")));
    });
    $("masterKeyCopy").addEventListener("click", function () {
      var key = $("masterKey").textContent;
      var done = function () { $("masterKeyCopy").textContent = "Copied"; setTimeout(function () { $("masterKeyCopy").textContent = "Copy key"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(key).then(done, function () {});
    });
    $("masterDisconnect").addEventListener("click", function () {
      if (!window.confirm("Disconnect your account? You are unlisted and followers stop copying you until you link again.")) return;
      call("/api/portal/copy/master/disconnect", "POST", {}).then(function (d) { $("masterKeyBox").hidden = true; renderMaster(d, false); $("masterLinkMsg").textContent = "Disconnected."; }).catch(fail($("masterLinkMsg")));
    });
    $("masterDownload").addEventListener("click", function () {
      api.authFetch("/api/portal/bot/connector").then(function (r) {
        if (!r.ok) throw new Error("The connector could not be downloaded.");
        return r.blob();
      }).then(function (blob) {
        var a2 = document.createElement("a");
        a2.href = URL.createObjectURL(blob);
        a2.download = "ABECFX_Bot_Connector.mq5";
        document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
      }).catch(function (err) { $("masterLinkMsg").textContent = err.message; });
    });
  }

  window.abecCopy = { setup: setup, show: show, stop: stop };
})();
