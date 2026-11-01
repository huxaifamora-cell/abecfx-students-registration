// Funds inside the student portal (Trading > Funds, Alumni members only).
// Shows the fund as a whole, the signed-in member's own share and amount, how the fund has grown, and lets the member
// ask to withdraw. All numbers come from the website (fund.js); this file only draws them.
// portal.js calls setup() once with its sign-in helpers, show() when the page opens and reset() on sign-out.
(function () {
  var api = null; // { authFetch(url, opts), signedOut(msg) } from portal.js
  var mount = null;
  var openId = null; // fund being looked at, or null for the list
  var data = null;   // the open fund's view from the server
  var busy = false;
  var NS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function money(n, cur) {
    var v = Number(n) || 0;
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? " " + cur : "");
  }
  function pct(n) { return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%"; }
  function signed(n, cur) { var v = Number(n) || 0; return (v > 0 ? "+" : v < 0 ? "-" : "") + money(Math.abs(v), cur); }
  function signedPct(n) { var v = Number(n) || 0; return (v > 0 ? "+" : v < 0 ? "-" : "") + pct(Math.abs(v)); }
  function tone(n) { return n > 0 ? "fd-up" : n < 0 ? "fd-down" : ""; }

  function readJson(r) {
    return r.json().then(function (b) {
      if (r.status === 401) { api.signedOut(b.error); throw new Error("signed out"); }
      if (!r.ok) { var e = new Error(b.error || "Something went wrong. Please try again."); e.fields = b.errors; throw e; }
      return b;
    });
  }
  function get(url) { return api.authFetch(url).then(readJson); }
  function post(url, body) {
    return api.authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(readJson);
  }

  // ---- A small line chart of the unit value (what one unit of the fund is worth), drawn with SVG ----
  function chart(points) {
    var wrap = el("div", "fd-chart");
    if (!points || points.length < 2) {
      wrap.appendChild(el("p", "cert-note", "The growth chart appears after the fund has recorded its first result."));
      return wrap;
    }
    var W = 560, H = 160, padL = 8, padR = 8, padT = 12, padB = 12;
    var vals = points.map(function (p) { return p.unitValue; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-9) { lo -= 0.01; hi += 0.01; }
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Fund growth: one unit started at 1.00 and is now worth " + vals[vals.length - 1].toFixed(4));
    svg.setAttribute("class", "fd-svg");
    var x = function (i) { return padL + (i * (W - padL - padR)) / (points.length - 1); };
    var y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB); };
    var line = points.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.unitValue).toFixed(1); }).join(" ");
    var area = document.createElementNS(NS, "polygon");
    area.setAttribute("points", padL + "," + (H - padB) + " " + line + " " + x(points.length - 1).toFixed(1) + "," + (H - padB));
    area.setAttribute("class", "fd-area");
    var path = document.createElementNS(NS, "polyline");
    path.setAttribute("points", line);
    path.setAttribute("class", "fd-line");
    var dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", x(points.length - 1).toFixed(1));
    dot.setAttribute("cy", y(vals[vals.length - 1]).toFixed(1));
    dot.setAttribute("r", "4");
    dot.setAttribute("class", "fd-dot");
    svg.appendChild(area); svg.appendChild(path); svg.appendChild(dot);
    wrap.appendChild(svg);
    wrap.appendChild(el("p", "cert-note", "Value of one unit of the fund, from " + points[0].date + " to " + points[points.length - 1].date + "."));
    return wrap;
  }

  function stat(label, value, cls, sub) {
    var d = el("div", "fd-stat");
    d.appendChild(el("span", "fd-label", label));
    d.appendChild(el("b", "fd-value" + (cls ? " " + cls : ""), value));
    if (sub) d.appendChild(el("span", "fd-sub", sub));
    return d;
  }

  function table(headers, rows, caption) {
    var wrap = el("div", "hb-tablewrap");
    var t = el("table", "cls-table");
    if (caption) t.appendChild(el("caption", null, caption));
    var thead = el("tr");
    headers.forEach(function (h) { thead.appendChild(el("th", null, h)); });
    var head = el("thead"); head.appendChild(thead); t.appendChild(head);
    var body = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      r.forEach(function (c) {
        var td = el("td");
        if (c && typeof c === "object" && c.nodeType) td.appendChild(c); else td.textContent = c == null ? "" : String(c);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    t.appendChild(body); wrap.appendChild(t);
    return wrap;
  }

  var TYPE_NAME = { deposit: "Money added", allocate: "Sponsorship", withdrawal: "Withdrawal", performance: "Result" };

  // ---- The list of funds ----
  function renderList(list, currency) {
    mount.replaceChildren();
    if (!list.length) { mount.appendChild(el("p", "live", "There are no funds yet.")); return; }
    list.forEach(function (f) {
      var card = el("section", "quizcard fd-listcard");
      card.appendChild(el("h3", null, f.name));
      card.appendChild(el("p", "cert-note", f.tagline));
      var row = el("div", "fd-stats");
      row.appendChild(stat("In the fund", money(f.value, currency)));
      row.appendChild(stat("Growth", signedPct(f.growthPct), tone(f.growthPct)));
      row.appendChild(stat("Your amount", money(f.myValue, currency), null, f.myValue > 0 ? pct(f.mySharePct) + " of the fund" : "No share yet"));
      card.appendChild(row);
      var open = el("button", "btn primary wide", "Open " + f.name);
      open.type = "button";
      open.addEventListener("click", function () { openFund(f.id); });
      card.appendChild(open);
      mount.appendChild(card);
    });
  }

  // ---- One fund ----
  function renderFund(d, flash) {
    mount.replaceChildren();
    var cur = d.currency;
    var me = d.me;

    if (listCount > 1) {
      var back = el("button", "btn ghost fd-back", "All funds");
      back.type = "button";
      back.addEventListener("click", function () { openId = null; load(); });
      mount.appendChild(back);
    }

    var head = el("section", "quizcard fd-head");
    head.appendChild(el("h3", null, d.fund.name));
    head.appendChild(el("p", "cert-note", d.fund.description));
    var top = el("div", "fd-stats");
    top.appendChild(stat("In the fund", money(d.totals.value, cur)));
    top.appendChild(stat("Growth since the start", signedPct(d.totals.growthPct), tone(d.totals.growthPct), "Value of one unit: " + d.totals.unitValue.toFixed(4)));
    top.appendChild(stat("Members", String(d.totals.members)));
    head.appendChild(top);
    head.appendChild(chart(d.history));
    mount.appendChild(head);

    // your share
    var mine = el("section", "quizcard fd-mine");
    mine.appendChild(el("h3", null, "Your share"));
    if (me.units > 0 || me.putIn > 0 || me.withdrawn > 0) {
      var big = el("p", "fd-bigamount", money(me.value, cur));
      mine.appendChild(big);
      mine.appendChild(el("p", "cert-note", "That is " + pct(me.sharePct) + " of the fund. Your amount grows (or falls) with every result the fund records, and the profit you have already made keeps working for you."));
      var grid = el("div", "fd-stats");
      grid.appendChild(stat("Your share", pct(me.sharePct)));
      grid.appendChild(stat("Put in for you", money(me.putIn, cur)));
      grid.appendChild(stat("Withdrawn", money(me.withdrawn, cur)));
      grid.appendChild(stat("Gain so far", signed(me.gain, cur), tone(me.gain), me.putIn > 0 ? signedPct(me.gainPct) : ""));
      mine.appendChild(grid);
    } else {
      mine.appendChild(el("p", "cert-note", "You do not have a share in this fund yet. When ABEC-FX sponsors you, your amount and your percentage will show here."));
    }
    mount.appendChild(mine);

    // withdraw
    var wd = el("section", "quizcard fd-withdraw");
    wd.appendChild(el("h3", null, "Withdraw"));
    var pendingReq = (d.withdrawals || []).filter(function (w) { return w.status === "Pending"; })[0];
    if (pendingReq) {
      wd.appendChild(el("p", "live live-soon", "Waiting for ABEC-FX to pay: " + (pendingReq.all ? "everything (" + money(pendingReq.amount, cur) + " at today's value)" : money(pendingReq.amount, cur)) + ". Asked on " + pendingReq.at + "."));
      var cancel = el("button", "btn ghost", "Cancel this request");
      cancel.type = "button";
      cancel.addEventListener("click", function () {
        if (busy) return;
        busy = true; cancel.disabled = true;
        post("/api/portal/funds/" + encodeURIComponent(openId) + "/withdrawals/" + encodeURIComponent(pendingReq.id) + "/cancel")
          .then(function (v) { data = v; renderFund(v, "Request cancelled."); })
          .catch(function (err) { if (err.message !== "signed out") { cancel.disabled = false; flashMsg(err.message, true); } })
          .then(function () { busy = false; });
      });
      wd.appendChild(cancel);
    } else if (me.value > 0) {
      wd.appendChild(el("p", "cert-note", "You can withdraw up to " + money(me.available, cur) + ". Your request goes to ABEC-FX, who send you the money and then take it out of the fund at the value of that day."));
      wd.appendChild(withdrawForm(me, cur));
    } else {
      wd.appendChild(el("p", "cert-note", "There is nothing to withdraw yet."));
    }
    var msg = el("p", "formErr");
    msg.id = "fdMsg";
    msg.setAttribute("role", "status");
    wd.appendChild(msg);
    mount.appendChild(wd);
    if (flash) flashMsg(flash, false);

    // history
    if ((d.results || []).length) {
      var sec = el("section", "quizcard");
      sec.appendChild(el("h3", null, "Recent results of the fund"));
      sec.appendChild(table(["Date", "Result", "Unit value"], d.results.map(function (r) {
        return [r.date, colored(signed(r.amount, cur), tone(r.amount)), Number(r.unitValue).toFixed(4)];
      })));
      mount.appendChild(sec);
    }
    if ((d.activity || []).length) {
      var act = el("section", "quizcard");
      act.appendChild(el("h3", null, "Your activity"));
      act.appendChild(table(["Date", "What", "Amount", "Note"], d.activity.map(function (a) {
        return [a.date, TYPE_NAME[a.type] || a.type, a.type === "withdrawal" ? "-" + money(a.amount, cur) : money(a.amount, cur), a.note || ""];
      })));
      mount.appendChild(act);
    }
    if ((d.withdrawals || []).length) {
      var wl = el("section", "quizcard");
      wl.appendChild(el("h3", null, "Your withdrawal requests"));
      wl.appendChild(table(["Asked", "Amount", "Status", "Note"], d.withdrawals.map(function (w) {
        return [w.at, money(w.amount, cur) + (w.all && w.status === "Pending" ? " (everything)" : ""), w.status, w.note || ""];
      })));
      mount.appendChild(wl);
    }
    mount.appendChild(el("p", "cert-note", "Trading carries risk. The value of a fund can go down as well as up, and no profit is promised. Sponsorship and withdrawals are managed by ABEC-FX."));
  }

  function colored(text, cls) { var s = el("span", cls, text); return s; }

  function flashMsg(text, bad) {
    var m = document.getElementById("fdMsg");
    if (!m) return;
    m.textContent = text || "";
    m.style.color = bad ? "" : "#1e8449";
  }

  function withdrawForm(me, cur) {
    var form = el("form", "bot-form fd-form");
    form.noValidate = true;

    var f1 = el("div", "field");
    var l1 = el("label", null, "Amount (" + cur + ")"); l1.setAttribute("for", "fd-amount");
    var amount = el("input"); amount.id = "fd-amount"; amount.type = "number"; amount.step = "0.01"; amount.min = "0.01"; amount.max = String(me.available); amount.inputMode = "decimal";
    var e1 = el("p", "formErr"); e1.id = "fd-e-amount"; e1.setAttribute("role", "alert");
    f1.appendChild(l1); f1.appendChild(amount); f1.appendChild(e1);

    var all = el("label", "bot-switch");
    var allBox = el("input"); allBox.type = "checkbox"; allBox.id = "fd-all";
    all.appendChild(allBox);
    all.appendChild(document.createTextNode(" Withdraw everything (my whole share, at the value on the day it is paid)"));
    allBox.addEventListener("change", function () { amount.disabled = allBox.checked; if (allBox.checked) amount.value = ""; });

    var f2 = el("div", "field");
    var l2 = el("label", null, "Where should we send the money?"); l2.setAttribute("for", "fd-details");
    var details = el("textarea"); details.id = "fd-details"; details.rows = 3; details.maxLength = 300;
    details.placeholder = "Bank name, account number and account name, or your wallet address and network";
    var e2 = el("p", "formErr"); e2.id = "fd-e-details"; e2.setAttribute("role", "alert");
    f2.appendChild(l2); f2.appendChild(details); f2.appendChild(e2);

    var go = el("button", "btn primary wide", "Request withdrawal"); go.type = "submit";
    form.appendChild(f1); form.appendChild(all); form.appendChild(f2); form.appendChild(go);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;
      e1.textContent = ""; e2.textContent = ""; flashMsg("");
      var body = { details: details.value };
      if (allBox.checked) body.all = true; else body.amount = amount.value;
      var ask = allBox.checked ? "Withdraw your whole share" : "Withdraw " + money(amount.value, cur);
      if (!window.confirm(ask + "? This sends a request to ABEC-FX. Nothing leaves the fund until it is paid.")) return;
      busy = true; go.disabled = true;
      post("/api/portal/funds/" + encodeURIComponent(openId) + "/withdrawals", body)
        .then(function (v) { data = v; renderFund(v, "Request sent. ABEC-FX will pay you and mark it done."); })
        .catch(function (err) {
          if (err.message === "signed out") return;
          go.disabled = false;
          if (err.fields) { e1.textContent = err.fields.amount || ""; e2.textContent = err.fields.details || ""; }
          else flashMsg(err.message, true);
        })
        .then(function () { busy = false; });
    });
    return form;
  }

  // ---- Loading ----
  var listCount = 0;
  function load() {
    mount.replaceChildren(el("p", "live", "Loading the funds..."));
    var seq = ++loadSeq;
    var p = openId
      ? get("/api/portal/funds/" + encodeURIComponent(openId)).then(function (d) { if (seq === loadSeq) { data = d; renderFund(d); } })
      : get("/api/portal/funds").then(function (d) {
          if (seq !== loadSeq) return;
          listCount = d.funds.length;
          if (d.funds.length === 1) { openId = d.funds[0].id; return get("/api/portal/funds/" + encodeURIComponent(openId)).then(function (v) { if (seq === loadSeq) { data = v; renderFund(v); } }); }
          renderList(d.funds, d.currency);
        });
    return p.catch(function (err) {
      if (err.message === "signed out" || seq !== loadSeq) return;
      mount.replaceChildren(el("p", "live live-bad", err.message));
    });
  }
  var loadSeq = 0;
  function openFund(id) { openId = id; load(); }

  window.abecFunds = {
    setup: function (a) { api = a; mount = document.getElementById("fundsMount"); },
    show: function () { if (!mount) return; openId = null; load(); },
    reset: function () { loadSeq++; openId = null; data = null; listCount = 0; if (mount) mount.replaceChildren(); },
  };
})();
