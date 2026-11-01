// Dashboard > Funds: run the money of a fund. Add money, sponsor an Alumni member, record the fund's trading result,
// pay or reject withdrawal requests, and see every member's share and the ledger.
// admin.js calls setup() once with its api helper, open() when the tab opens and clear() on sign-out.
(function () {
  var api = null;       // admin.js: api(path, method, body) -> Promise
  var onAuth = null;    // admin.js: showLogin(message)
  var view = null;      // the open fund's data from the server
  var fundId = "";
  var busy = false;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function money(n, cur) {
    return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? " " + cur : "");
  }
  function signed(n, cur) { var v = Number(n) || 0; return (v > 0 ? "+" : v < 0 ? "-" : "") + money(Math.abs(v), cur); }
  function pct(n) { return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 4 }) + "%"; }

  function table(mount, heads, rows) {
    mount.replaceChildren();
    var thead = el("thead"), tr = el("tr");
    heads.forEach(function (h) { tr.appendChild(el("th", null, h)); });
    thead.appendChild(tr); mount.appendChild(thead);
    var body = el("tbody");
    rows.forEach(function (r) {
      var row = el("tr");
      r.forEach(function (c) {
        var td = el("td");
        if (c && typeof c === "object" && c.nodeType) td.appendChild(c); else td.textContent = c == null ? "" : String(c);
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    mount.appendChild(body);
  }

  function fail(err, msgId) {
    if (err && err.auth) { onAuth(err.message); return; }
    $(msgId || "fnMsg").textContent = (err && err.message) || "Something went wrong.";
  }

  function showErrors(prefix, fields) {
    ["holder", "amount", "newValue", "note"].forEach(function (k) {
      var e = $(prefix + "-e-" + k);
      if (e) e.textContent = (fields && fields[k]) || "";
    });
  }

  // ---- Drawing ----
  function tile(label, value, sub) {
    var d = el("div", "kpi");
    d.appendChild(el("b", null, value));
    d.appendChild(el("span", null, label));
    if (sub) { d.appendChild(document.createElement("br")); d.appendChild(el("span", null, sub)); }
    return d;
  }

  function render(v, flash) {
    view = v;
    var cur = v.currency;
    $("fnTitle").textContent = v.fund.name;
    $("fnAbout").textContent = v.fund.description;
    $("fnCur").textContent = cur;
    $("fnCur2").textContent = cur;
    $("fnCur3").textContent = cur;
    var t = v.totals;
    var tiles = $("fnTiles");
    tiles.replaceChildren(
      tile("In the fund", money(t.value, cur)),
      tile("Growth since the start", (t.growthPct > 0 ? "+" : "") + t.growthPct + "%", "Unit value " + t.unitValue.toFixed(4)),
      tile("Members with a share", String(t.members)),
      tile("In the reserve (not given out yet)", money(t.reserve, cur), pct(t.reservePct) + " of the fund")
    );

    // problems typed into the sheet by hand
    var pr = $("fnProblems");
    pr.replaceChildren();
    pr.hidden = !(v.problems && v.problems.length);
    if (!pr.hidden) {
      pr.appendChild(el("b", null, "Some rows of the Fund Ledger sheet could not be used, so they are ignored:"));
      v.problems.slice(0, 10).forEach(function (p) { pr.appendChild(el("div", null, p)); });
    }

    // withdrawal requests
    var pending = v.requests.filter(function (r) { return r.status === "Pending"; });
    $("fnReqNote").textContent = pending.length
      ? pending.length + " waiting. Send the money first, then press \"Mark paid\". Only then does it leave the fund."
      : "No withdrawal is waiting.";
    table($("fnReqTable"), ["Asked", "Member", "Amount", "Pay to", "Status", ""], v.requests.map(function (r) {
      var amount = money(r.amountNow, cur) + (r.all && r.status === "Pending" ? " (everything)" : "");
      var status = r.status + (r.decidedBy ? " by " + r.decidedBy : "") + (r.note ? ": " + r.note : "");
      var actions = "";
      if (r.status === "Pending") {
        var box = el("div", "fn-actions");
        var pay = el("button", "btn ghost sh-rowbtn", "Mark paid");
        pay.type = "button";
        pay.addEventListener("click", function () { payRequest(r, pay); });
        var rej = el("button", "btn ghost sh-rowbtn sh-del", "Reject");
        rej.type = "button";
        rej.addEventListener("click", function () { rejectRequest(r, rej); });
        box.appendChild(pay); box.appendChild(rej);
        actions = box;
      }
      var who = r.name ? r.name + " (" + r.reg + ")" : r.reg;
      var worth = r.status === "Pending" ? " Share now worth " + money(r.worth, cur) + "." : "";
      var payTo = el("span", "fn-pay", r.details);
      return [r.at, who, amount + worth, payTo, status, actions];
    }));

    // holders
    table($("fnHolders"), ["Member", "Share", "Amount now", "Put in", "Withdrawn", "Gain"], v.holders.map(function (h) {
      var who = h.reg === "RESERVE" ? h.name : (h.name ? h.name + " (" + h.reg + ")" : h.reg);
      var isReserve = h.reg === "RESERVE";
      return [who, pct(h.sharePct), money(h.value, cur), money(h.putIn, cur), money(h.withdrawn, cur) + (isReserve ? " (given as sponsorship)" : ""), isReserve ? "" : signed(h.gain, cur) + (h.putIn > 0 ? " (" + (h.gainPct > 0 ? "+" : "") + h.gainPct + "%)" : "")];
    }));
    $("fnHoldersNote").textContent = v.holders.length ? "" : "Nobody holds a share yet. Add money to the reserve, then sponsor a member.";

    // ledger
    var NAMES = { deposit: "Money added", allocate: "Sponsorship", performance: "Result", withdrawal: "Withdrawal" };
    table($("fnLedger"), ["Date", "What", "Member", "Amount", "Fund after", "Source", "Note", "By"], v.ledger.map(function (e) {
      return [e.date, NAMES[e.type] || e.type, e.holder === "RESERVE" ? "Reserve" : e.holder, (e.type === "withdrawal" ? "-" : e.type === "performance" ? "" : "") + (e.type === "performance" ? signed(e.amount, cur) : money(e.amount, cur)), money(e.valueAfter, cur), e.source, e.note, e.by];
    }));
    if (flash) $("fnMsg").textContent = flash;
  }

  function load(flash) {
    return api("/api/admin/funds/" + encodeURIComponent(fundId)).then(function (v) { render(v, flash); });
  }

  // ---- Actions ----
  function send(path, body, prefix, button, okText) {
    if (busy) return;
    busy = true; button.disabled = true;
    $("fnMsg").textContent = "";
    showErrors(prefix, null);
    api(path, "POST", body)
      .then(function (v) {
        render(v, okText(v.done));
        if (prefix) { var f = $(prefix + "Form"); if (f) f.reset(); }
      })
      .catch(function (err) {
        if (err.auth) return onAuth(err.message);
        if (err.fields && prefix) showErrors(prefix, err.fields);
        $("fnMsg").textContent = err.message;
      })
      .then(function () { busy = false; button.disabled = false; });
  }

  function who(r) { return r.name ? r.name + " (" + r.reg + ")" : r.reg; }

  function payRequest(r, btn) {
    var cur = view.currency;
    var text = "Mark this withdrawal as paid?\n\n" + who(r) + "\n" + money(r.amountNow, cur) + (r.all ? " (their whole share, at today's value)" : "") + "\n\nOnly do this after you have sent the money. It is taken out of the fund now, at today's value, and cannot be undone here.";
    if (!window.confirm(text)) return;
    send("/api/admin/funds/" + encodeURIComponent(fundId) + "/withdrawals/" + encodeURIComponent(r.id) + "/pay", {}, "", btn, function (d) { return "Marked paid: " + money(d.paid, view.currency) + " taken out of the fund."; });
  }
  function rejectRequest(r, btn) {
    var note = window.prompt("Why is this withdrawal being rejected? The member will see this.", "");
    if (note === null) return;
    send("/api/admin/funds/" + encodeURIComponent(fundId) + "/withdrawals/" + encodeURIComponent(r.id) + "/reject", { note: note }, "", btn, function () { return "Rejected. The money stays in the fund."; });
  }

  function wire() {
    $("fnDepForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var holder = $("fnDep-holder").value.trim();
      var amount = $("fnDep-amount").value;
      var ask = "Add " + money(amount, view && view.currency) + " " + (holder ? "for " + holder : "to the reserve") + "?";
      if (!window.confirm(ask)) return;
      send("/api/admin/funds/" + encodeURIComponent(fundId) + "/deposit", { holder: holder, amount: amount, note: $("fnDep-note").value }, "fnDep", $("fnDepGo"), function (d) { return "Added " + money(d.amount, view.currency) + "."; });
    });
    $("fnAllForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var holder = $("fnAll-holder").value.trim();
      var amount = $("fnAll-amount").value;
      if (!window.confirm("Give " + money(amount, view && view.currency) + " of the reserve to " + holder + " as sponsorship?")) return;
      send("/api/admin/funds/" + encodeURIComponent(fundId) + "/allocate", { holder: holder, amount: amount, note: $("fnAll-note").value }, "fnAll", $("fnAllGo"), function (d) { return "Sponsorship of " + money(d.amount, view.currency) + " given."; });
    });
    $("fnPerForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var amount = $("fnPer-amount").value.trim();
      var value = $("fnPer-newValue").value.trim();
      if (amount && value) { showErrors("fnPer", { amount: "Fill in only one of these two." }); return; }
      if (!amount && !value) { showErrors("fnPer", { amount: "Enter the result, or the new value of the fund." }); return; }
      var body = amount ? { amount: amount } : { newValue: value };
      body.note = $("fnPer-note").value;
      if (!window.confirm(amount ? "Record a result of " + amount + " " + view.currency + " for the whole fund? It changes every member's amount." : "Set the fund's value to " + value + " " + view.currency + "? It changes every member's amount.")) return;
      send("/api/admin/funds/" + encodeURIComponent(fundId) + "/performance", body, "fnPer", $("fnPerGo"), function (d) { return "Result recorded: " + signed(d.amount, view.currency) + ". Fund now " + money(d.fundValue, view.currency) + "."; });
    });
    $("fnReload").addEventListener("click", function () {
      $("fnMsg").textContent = "Loading...";
      load("").then(function () { $("fnMsg").textContent = ""; }).catch(function (err) { fail(err); });
    });
    $("fnPick").addEventListener("change", function () { fundId = $("fnPick").value; $("fnReload").click(); });
  }
  var wired = false;

  window.abecAdminFunds = {
    setup: function (a) { api = a.api; onAuth = a.onAuth; },
    open: function () {
      if (!wired) { wire(); wired = true; }
      $("fnMsg").textContent = "Loading...";
      api("/api/admin/funds").then(function (r) {
        var pick = $("fnPick");
        pick.replaceChildren();
        r.funds.forEach(function (f) { var o = el("option", null, f.name); o.value = f.id; pick.appendChild(o); });
        pick.hidden = r.funds.length < 2;
        if (!fundId || !r.funds.some(function (f) { return f.id === fundId; })) fundId = r.funds[0].id;
        pick.value = fundId;
        return load("");
      }).then(function () { $("fnMsg").textContent = ""; }).catch(function (err) { fail(err); });
    },
    clear: function () {
      view = null;
      ["fnTiles", "fnReqTable", "fnHolders", "fnLedger", "fnProblems"].forEach(function (id) { var n = $(id); if (n) n.replaceChildren(); });
      ["fnMsg", "fnReqNote", "fnHoldersNote"].forEach(function (id) { var n = $(id); if (n) n.textContent = ""; });
    },
  };
})();
