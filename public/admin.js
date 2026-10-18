(function () {
  "use strict";
  var SS_KEY = "abecfx_admin";
  var MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NS = "http://www.w3.org/2000/svg";

  var $ = function (id) { return document.getElementById(id); };
  var token = "";   // sign-in token (it says who you are; your role is checked by the server on every request)
  var me = null;    // { username, name, role, roleLabel, perms, canChangePassword }
  var stats = null;
  var results = [];
  var scale = [];
  // The Database view: meta = what each table allows, data = the table being looked at, row = the record open in the form.
  var sh = { meta: null, key: "students", data: null, page: 0, mode: "edit", row: null, flash: "" };
  var shSeq = 0;
  var SH_PAGE = 50;
  var qc = { codes: [], newCodes: [] }; // the Quiz codes tab: every code, and the ones just made

  function getSaved() { try { return sessionStorage.getItem(SS_KEY) || ""; } catch (e) { return ""; } }
  function save(v) { try { if (v) sessionStorage.setItem(SS_KEY, v); else sessionStorage.removeItem(SS_KEY); } catch (e) {} }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }

  // ---------- API ----------
  function api(path, method, body) {
    var opts = { method: method || "GET", headers: { Authorization: "Bearer " + token } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (b) {
        if (r.status === 401) { var e = new Error(b.error || "Please sign in again."); e.auth = true; throw e; }
        if (!r.ok) { var e2 = new Error(b.error || "Something went wrong."); e2.fields = b.errors; e2.status = r.status; throw e2; }
        return b;
      });
    });
  }

  function showLogin(msg) {
    // Leave no student details on the screen once signed out.
    shSeq++;
    sh.meta = null; sh.data = null; sh.row = null; sh.flash = "";
    if ($("shDlg").open) $("shDlg").close();
    $("shTable").replaceChildren();
    $("shSearch").value = "";
    me = null;
    teamData = null;
    if ($("tmDlg").open) $("tmDlg").close();
    if ($("pwDlg").open) $("pwDlg").close();
    $("tmTable").replaceChildren();
    if ($("rlDlg").open) $("rlDlg").close();
    $("rlTable").replaceChildren();
    $("qcTable").replaceChildren();
    $("qcNew").hidden = true;
    $("qcNewList").replaceChildren();
    qc.codes = [];
    $("dash").hidden = true;
    $("topActions").hidden = true;
    $("login").hidden = false;
    $("loginErr").textContent = msg || "";
  }

  function load() {
    return Promise.all([api("/api/admin/stats"), api("/api/admin/results"), api("/api/admin/me")]).then(function (res) {
      stats = res[0];
      results = res[1].results;
      scale = res[1].scale;
      me = res[2];
      save(token);
      applyRole();
      $("login").hidden = true;
      $("dash").hidden = false;
      $("topActions").hidden = false;
      $("stamp").textContent = "Updated " + stats.generatedAt;
      renderOverview();
      renderQuiz();
    });
  }

  // Show only what this role may use. (The server enforces it too; hiding is just so nobody meets a dead end.)
  var TAB_NEEDS = { overview: "view", quiz: "view", quizcodes: "quizcodes", links: "links", community: "community", videos: "videos", database: "database", team: "team" };
  function allowed(perm) { return !!(me && me.perms.indexOf(perm) >= 0); }
  function applyRole() {
    Object.keys(TAB_NEEDS).forEach(function (n) { $("tab-" + n).hidden = !allowed(TAB_NEEDS[n]); });
    $("who").textContent = me.name + " · " + me.roleLabel;
    $("acctBtn").hidden = !me.canChangePassword;
    // if the open tab is no longer allowed (a role was changed), go back to the overview
    var open = Object.keys(TAB_NEEDS).filter(function (n) { return !$("view-" + n).hidden; })[0];
    if (open && !allowed(TAB_NEEDS[open])) setTab("overview");
  }

  // ---------- Building blocks ----------
  function bars(container, items, opts) {
    opts = opts || {};
    var total = opts.total != null ? opts.total : items.reduce(function (n, i) { return n + i.count; }, 0);
    var limit = opts.limit || 0;
    container.replaceChildren();
    if (!items.length) { container.appendChild(el("p", "empty", "No data yet.")); return; }
    var max = Math.max.apply(null, items.map(function (i) { return i.count; })) || 1;
    var list = el("div", "bars");
    container.appendChild(list);
    function draw(all) {
      list.replaceChildren();
      (all || !limit ? items : items.slice(0, limit)).forEach(function (i) {
        var row = el(opts.drill ? "button" : "div", "bar");
        if (opts.drill) {
          row.type = "button";
          row.setAttribute("aria-label", i.label + ": " + i.count + ". Show the list");
          row.addEventListener("click", function () { var d = opts.drill(i); openDrill(d.kind, d.value, row); });
        }
        row.appendChild(el("span", "lbl", i.label));
        row.title = i.label;
        var track = el("span", "track");
        var fill = el("span", "fill");
        fill.style.width = (i.count ? Math.max(2, (i.count / max) * 100) : 0) + "%";
        track.appendChild(fill);
        row.appendChild(track);
        var num = el("span", "num", String(i.count));
        num.appendChild(el("small", null, pct(i.count, total) + "%"));
        row.appendChild(num);
        list.appendChild(row);
      });
    }
    draw(false);
    if (limit && items.length > limit) {
      var more = el("button", "btn ghost more", "Show all " + items.length);
      more.type = "button";
      var open = false;
      more.addEventListener("click", function () {
        open = !open;
        draw(open);
        more.textContent = open ? "Show fewer" : "Show all " + items.length;
      });
      container.appendChild(more);
    }
  }

  // A headline number. With a drill target it is a button that opens the list behind it.
  function kpi(label, value, target) {
    var d = el(target ? "button" : "div", "kpi");
    if (target) {
      d.type = "button";
      d.setAttribute("aria-label", label + ": " + value + ". Show the list");
      d.addEventListener("click", function () { openDrill(target.kind, target.value, d); });
    }
    d.appendChild(el("b", null, String(value)));
    d.appendChild(el("span", null, label));
    if (target) d.appendChild(el("em", "kpi-cue", "View list \u203a"));
    return d;
  }

  // Make an SVG shape behave like a button (mouse, touch and keyboard).
  function svgButton(node, labelText, target) {
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", labelText + ". Show the list");
    var go = function () { openDrill(target.kind, target.value, node); };
    node.addEventListener("click", go);
    node.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    return node;
  }

  // Column chart; points = [{label, value}]
  function columns(container, points, color) {
    container.replaceChildren();
    var W = 720, H = 220, L = 30, B = 26, T = 14, R = 8;
    var max = Math.max.apply(null, points.map(function (p) { return p.value; }).concat([1]));
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Column chart" });
    [0, 0.5, 1].forEach(function (f) {
      var y = T + (H - T - B) * (1 - f);
      s.appendChild(svg("line", { x1: L, x2: W - R, y1: y, y2: y, "class": "grid-line" }));
      var t = svg("text", { x: L - 6, y: y + 4, "text-anchor": "end" });
      t.textContent = Math.round(max * f);
      s.appendChild(t);
    });
    var slot = (W - L - R) / points.length;
    points.forEach(function (p, i) {
      var h = (H - T - B) * (p.value / max);
      var x = L + slot * i + slot * 0.18;
      var r = svg("rect", { x: x, y: H - B - h, width: slot * 0.64, height: h, rx: 4, "class": "bar-rect" });
      s.appendChild(r);
      if (p.drill) {
        var hit = svg("rect", { x: L + slot * i, y: T, width: slot, height: H - T - B, "class": "hit" });
        var tt = svg("title");
        tt.textContent = p.label + ": " + p.value + " (click for the list)";
        hit.appendChild(tt);
        s.appendChild(svgButton(hit, p.label + ": " + p.value, p.drill));
      }
      if (p.value) {
        var v = svg("text", { x: x + slot * 0.32, y: H - B - h - 4, "text-anchor": "middle" });
        v.textContent = p.value;
        s.appendChild(v);
      }
      var lab = svg("text", { x: x + slot * 0.32, y: H - 8, "text-anchor": "middle" });
      lab.textContent = p.label;
      s.appendChild(lab);
    });
    var wrap = el("div", "chart");
    wrap.appendChild(s);
    container.appendChild(wrap);
  }

  // Bars = new per month, line = running total
  function growthChart(container, months) {
    container.replaceChildren();
    if (!months.length) { container.appendChild(el("p", "empty", "No joining dates yet.")); return; }
    var W = 720, H = 260, L = 34, B = 30, T = 16, R = 34;
    var maxNew = Math.max.apply(null, months.map(function (m) { return m.new; }).concat([1]));
    var maxTot = Math.max.apply(null, months.map(function (m) { return m.total; }).concat([1]));
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Monthly growth chart" });
    [0, 0.5, 1].forEach(function (f) {
      var y = T + (H - T - B) * (1 - f);
      s.appendChild(svg("line", { x1: L, x2: W - R, y1: y, y2: y, "class": "grid-line" }));
      var a = svg("text", { x: L - 6, y: y + 4, "text-anchor": "end" });
      a.textContent = Math.round(maxNew * f);
      s.appendChild(a);
      var b = svg("text", { x: W - R + 6, y: y + 4 });
      b.textContent = Math.round(maxTot * f);
      s.appendChild(b);
    });
    var slot = (W - L - R) / months.length;
    var step = Math.ceil(months.length / 12);
    var pts = [];
    months.forEach(function (m, i) {
      var h = (H - T - B) * (m.new / maxNew);
      var x = L + slot * i + slot * 0.15;
      var r = svg("rect", { x: x, y: H - B - h, width: slot * 0.7, height: h, rx: 3, "class": "bar-rect" });
      s.appendChild(r);
      var hit = svg("rect", { x: L + slot * i, y: T, width: slot, height: H - T - B, "class": "hit" });
      var tt = svg("title");
      tt.textContent = label(m.ym) + ": " + m.new + " new, " + m.total + " total (click for the students who joined)";
      hit.appendChild(tt);
      s.appendChild(svgButton(hit, label(m.ym) + ": " + m.new + " new, " + m.total + " total", { kind: "month", value: m.ym }));
      pts.push([x + slot * 0.35, T + (H - T - B) * (1 - m.total / maxTot)]);
      if (i % step === 0) {
        var t = svg("text", { x: x + slot * 0.35, y: H - 10, "text-anchor": "middle" });
        t.textContent = label(m.ym);
        s.appendChild(t);
      }
    });
    s.appendChild(svg("polyline", { points: pts.map(function (p) { return p.join(","); }).join(" "), "class": "line" }));
    pts.forEach(function (p, i) {
      var dot = svg("circle", { cx: p[0], cy: p[1], r: 6, "class": "dot" });
      var dt = svg("title");
      dt.textContent = label(months[i].ym) + ": " + months[i].total + " students in total (click for the list)";
      dot.appendChild(dt);
      s.appendChild(svgButton(dot, label(months[i].ym) + ": " + months[i].total + " students in total", { kind: "upto", value: months[i].ym }));
    });
    var wrap = el("div", "chart");
    wrap.appendChild(s);
    container.appendChild(wrap);
  }

  function label(ym) {
    var p = ym.split("-");
    return MONTH[Number(p[1]) - 1] + " " + p[0].slice(2);
  }

  function table(tbl, head, rows) {
    tbl.replaceChildren();
    var thead = el("thead"), tr = el("tr");
    head.forEach(function (h) { tr.appendChild(el("th", h.n ? "n" : "", h.t)); });
    thead.appendChild(tr);
    tbl.appendChild(thead);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var row = el("tr");
      r.forEach(function (c, i) {
        var td = el("td", head[i].n ? "n" : "");
        if (c && c.node) td.appendChild(c.node); else td.textContent = c == null ? "" : String(c);
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    tbl.appendChild(tb);
  }

  // A table cell that opens a list.
  function linkCell(text, kind, value) {
    var b = el("button", "linkbtn", String(text));
    b.type = "button";
    b.addEventListener("click", function () { openDrill(kind, value, b); });
    return { node: b };
  }

  function gradeBadge(g) { return { node: el("span", "grade g-" + g, g) }; }

  // ---------- Overview ----------
  function renderOverview() {
    var s = stats;
    var k = $("kpis");
    k.replaceChildren(
      kpi("Total students", s.total, { kind: "all" }),
      kpi("Certified graduates", s.graduates, { kind: "graduates" }),
      kpi("Uncertified", s.uncertified, { kind: "uncertified" }),
      kpi("Team members", s.team, { kind: "team" }),
      kpi("Took the quiz", s.quiz.students, { kind: "quiz-students" }),
      kpi("Average quiz score", s.quiz.avgPct == null ? "-" : s.quiz.avgPct + "%", { kind: "quiz-avg" })
    );
    var by = function (kind) { return function (i) { return { kind: kind, value: i.label }; }; };
    bars($("c-status"), s.status.filter(function (x) { return x.count > 0; }), { total: s.total, drill: by("status") });
    $("c-status-note").textContent = "Certified graduates = Certified and Alumni Member.";
    bars($("c-gender"), s.gender, { drill: by("gender") });
    bars($("c-programme"), s.programme, { drill: by("programme") });
    bars($("c-year"), s.byYear, { drill: by("year") });
    bars($("c-country"), s.country, { limit: 10, drill: by("country") });
    bars($("c-state"), s.state, { limit: 10, drill: by("state") });

    var years = Object.keys(s.monthsByYear).sort();
    var sel = $("yearSel");
    var keep = sel.value;
    sel.replaceChildren();
    years.forEach(function (y) { var o = el("option", null, y); o.value = y; sel.appendChild(o); });
    if (years.length) sel.value = years.indexOf(keep) >= 0 ? keep : years[years.length - 1];
    drawMonthYear();

    growthChart($("c-growth"), s.months);
    var rows = s.months.slice().reverse().map(function (m) {
      var g = m.growthPct;
      var cell = g == null ? "-" : { node: el("span", g >= 0 ? "up" : "down", (g >= 0 ? "+" : "") + g + "%") };
      return [linkCell(label(m.ym), "month", m.ym), linkCell(m.new, "month", m.ym), linkCell(m.total, "upto", m.ym), cell];
    });
    table($("growthTable"), [{ t: "Month" }, { t: "New students", n: 1 }, { t: "Total", n: 1 }, { t: "Change vs last month", n: 1 }], rows);
    $("undatedNote").textContent = s.undated
      ? s.undated + " student(s) have no joining date and are left out of the month charts."
      : "";
    $("undatedNote").replaceChildren();
    if (s.undated) {
      $("undatedNote").appendChild(document.createTextNode(s.undated + " student(s) have no joining date and are left out of the month charts. "));
      $("undatedNote").appendChild(linkCell("Show them", "undated", "").node);
    }
  }

  function drawMonthYear() {
    var y = $("yearSel").value;
    var data = (stats.monthsByYear[y] || Array(12).fill(0));
    if (!y) { $("c-monthyear").replaceChildren(el("p", "empty", "No joining dates yet.")); return; }
    columns($("c-monthyear"), MONTH.map(function (m, i) {
      return { label: m, value: data[i], drill: { kind: "month", value: y + "-" + String(i + 1).padStart(2, "0") } };
    }));
  }

  // ---------- Quiz ----------
  function renderQuiz() {
    var q = stats.quiz;
    $("quizKpis").replaceChildren(
      kpi("Students who took the quiz", q.students, { kind: "quiz-students" }),
      kpi("Not yet taken", q.notTaken, { kind: "quiz-not-taken" }),
      kpi("Total attempts", q.attempts, { kind: "quiz-attempts" }),
      kpi("Average score", q.avgPct == null ? "-" : q.avgPct + "%", { kind: "quiz-avg" })
    );
    bars($("c-grades"), q.gradeDist.map(function (g) { return { label: g.grade + " - " + g.label, count: g.count, grade: g.grade }; }),
      { total: q.students, drill: function (i) { return { kind: "grade", value: i.grade }; } });
    table($("c-scale"), [{ t: "Grade" }, { t: "Score" }, { t: "Meaning" }],
      scale.map(function (s, i) {
        var hi = i === 0 ? 100 : scale[i - 1].min - 1;
        return [gradeBadge(s.grade), s.min + " - " + hi + "%", s.label];
      }));
    var gf = $("gradeFilter");
    if (gf.options.length <= 1) scale.forEach(function (s) { var o = el("option", null, "Grade " + s.grade); o.value = s.grade; gf.appendChild(o); });
    renderResults();
  }

  function filtered() {
    var term = $("q").value.trim().toLowerCase();
    var grade = $("gradeFilter").value;
    var mode = $("viewMode").value;
    var list = results;
    if (mode !== "all") {
      var map = new Map();
      // results is newest first
      list.forEach(function (r) {
        var cur = map.get(r.regNumber);
        if (mode === "latest") { if (!cur) map.set(r.regNumber, r); }
        else if (!cur || r.pct > cur.pct) map.set(r.regNumber, r);
      });
      list = Array.from(map.values());
    }
    return list.filter(function (r) {
      if (grade && r.grade !== grade) return false;
      if (term && (r.fullName + " " + r.regNumber).toLowerCase().indexOf(term) < 0) return false;
      return true;
    });
  }

  function renderResults() {
    var list = filtered();
    table($("resultsTable"),
      [{ t: "Date" }, { t: "Reg number" }, { t: "Name" }, { t: "Score", n: 1 }, { t: "Percent", n: 1 }, { t: "Grade" }, { t: "Attempt", n: 1 }],
      list.slice(0, 500).map(function (r) {
        return [r.date, r.regNumber, r.fullName, r.score + " / " + r.total, r.pct + "%", gradeBadge(r.grade), r.attempt];
      }));
    $("resultsNote").textContent = list.length
      ? "Showing " + Math.min(list.length, 500) + " of " + list.length + " result(s). Download the CSV for the full list."
      : "No quiz results match.";
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheets running names as formulas
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv() {
    var head = ["Date", "Reg Number", "Name", "Score", "Total", "Percent", "Grade", "Attempt"];
    var lines = [head.join(",")].concat(filtered().map(function (r) {
      return [r.date, r.regNumber, r.fullName, r.score, r.total, r.pct, r.grade, r.attempt].map(csvCell).join(",");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "abecfx-quiz-results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- The list behind a statistic ----------
  var dlg = $("drill");
  var drillData = null; // { title, type, rows, count, truncated }
  var drillSeq = 0;
  var STUDENT_COLS = [{ t: "Reg number" }, { t: "Name" }, { t: "Gender" }, { t: "Status" }, { t: "Country" }, { t: "State" }, { t: "Programme" }, { t: "Joined" }];
  var QUIZ_COLS = [{ t: "Date" }, { t: "Reg number" }, { t: "Name" }, { t: "Score", n: 1 }, { t: "Percent", n: 1 }, { t: "Grade" }, { t: "Attempt", n: 1 }];

  function openDrill(kind, value, trigger) {
    var seq = ++drillSeq;
    drillData = null;
    $("drillTitle").textContent = "Loading...";
    $("drillSummary").textContent = "";
    $("drillNote").textContent = "";
    $("drillSearch").value = "";
    $("drillTable").replaceChildren();
    $("drillCsv").disabled = true;
    if (!dlg.open) dlg.showModal();
    api("/api/admin/drill?kind=" + encodeURIComponent(kind) + "&value=" + encodeURIComponent(value || ""))
      .then(function (d) {
        if (seq !== drillSeq) return; // a newer click replaced this one
        drillData = d;
        $("drillTitle").textContent = d.title;
        $("drillCsv").disabled = !d.rows.length;
        renderDrill();
      })
      .catch(function (err) {
        if (seq !== drillSeq) return;
        if (err.auth) { dlg.close(); showLogin(err.message); return; }
        $("drillTitle").textContent = "Could not load this list";
        $("drillSummary").textContent = err.message;
      });
  }

  function rowText(r) { return Object.keys(r).map(function (k) { return r[k]; }).join(" ").toLowerCase(); }

  function drillRows() {
    if (!drillData) return [];
    var term = $("drillSearch").value.trim().toLowerCase();
    return term ? drillData.rows.filter(function (r) { return rowText(r).indexOf(term) >= 0; }) : drillData.rows;
  }

  function renderDrill() {
    if (!drillData) return;
    var d = drillData, list = drillRows(), isQuiz = d.type === "quiz";
    var unit = isQuiz ? "result" : "student";
    var summary = d.count + " " + unit + (d.count === 1 ? "" : "s");
    if (!isQuiz && stats && stats.total) summary += " (" + pct(d.count, stats.total) + "% of " + stats.total + " students)";
    if (isQuiz && d.count && /Average quiz score/.test(d.title)) {
      summary += ". Average: " + Math.round(d.rows.reduce(function (n, r) { return n + r.pct; }, 0) / d.rows.length) + "%";
    }
    $("drillSummary").textContent = summary + ".";
    if (isQuiz) {
      table($("drillTable"), QUIZ_COLS, list.slice(0, 500).map(function (r) {
        return [r.date, r.regNumber, r.fullName, r.score + " / " + r.total, r.pct + "%", gradeBadge(r.grade), r.attempt];
      }));
    } else {
      table($("drillTable"), STUDENT_COLS, list.slice(0, 500).map(function (r) {
        return [r.regNumber, r.fullName, r.gender, r.status, r.country, r.state, r.programme, r.joined];
      }));
    }
    var note = "";
    if (!d.rows.length) note = "Nothing to show here yet.";
    else if (!list.length) note = "No one in this list matches your search.";
    else if (list.length > 500) note = "Showing the first 500 of " + list.length + ". Download the CSV for the full list.";
    if (d.truncated) note += (note ? " " : "") + "The list is limited to " + d.rows.length + " rows.";
    $("drillNote").textContent = note;
  }

  function downloadDrillCsv() {
    if (!drillData) return;
    var isQuiz = drillData.type === "quiz";
    var head = isQuiz ? ["Date", "Reg Number", "Name", "Score", "Total", "Percent", "Grade", "Attempt"]
      : ["Reg Number", "Name", "Gender", "Status", "Country", "State", "Programme", "Joined"];
    var lines = [head.join(",")].concat(drillRows().map(function (r) {
      var cells = isQuiz ? [r.date, r.regNumber, r.fullName, r.score, r.total, r.pct, r.grade, r.attempt]
        : [r.regNumber, r.fullName, r.gender, r.status, r.country, r.state, r.programme, r.joined];
      return cells.map(csvCell).join(",");
    }));
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "abecfx-" + drillData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  $("drillClose").addEventListener("click", function () { dlg.close(); });
  $("drillSearch").addEventListener("input", renderDrill);
  $("drillCsv").addEventListener("click", downloadDrillCsv);
  // a click on the dimmed area (the dialog itself, not its content) closes it
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", function () { drillSeq++; drillData = null; });

  // ---------- Site links ----------
  var linkFields = [];
  // ---------- Quiz codes: make, list and cancel the one-time codes that unlock the quiz ----------
  var QC_LABEL = { Unused: "Unused", Unlocked: "In use", Completed: "Completed", Revoked: "Cancelled" };

  function copyText(text, done) {
    var ok = function () { if (done) done(true); };
    var fallback = function () {
      var t = el("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      var good = false;
      try { good = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(t);
      if (done) done(good);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }

  function showQcErrors(errs) {
    $("qc-e-count").textContent = (errs && errs.count) || "";
    $("qc-e-for").textContent = (errs && errs.forReg) || "";
  }

  function qcWho(reg, name) { return reg ? (name ? name + " (" + reg + ")" : reg) : ""; }

  function renderQcNew() {
    var list = $("qcNewList");
    list.replaceChildren();
    $("qcNew").hidden = !qc.newCodes.length;
    qc.newCodes.forEach(function (c) {
      var li = el("li");
      var left = el("div");
      left.appendChild(el("span", "qc-code", c.code));
      if (c.forReg) { left.appendChild(document.createElement("br")); left.appendChild(el("span", "qc-for", "Only for " + qcWho(c.forReg, c.forName))); }
      li.appendChild(left);
      var b = el("button", "btn ghost", "Copy");
      b.type = "button";
      b.addEventListener("click", function () {
        copyText(c.code, function (ok) { b.textContent = ok ? "Copied" : "Copy failed"; setTimeout(function () { b.textContent = "Copy"; }, 1500); });
      });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  function qcVisible() {
    var term = $("qcSearch").value.trim().toLowerCase();
    var st = $("qcStatus").value;
    return qc.codes.filter(function (c) {
      if (st && c.status !== st) return false;
      if (!term) return true;
      return [c.code, c.usedBy, c.usedByName, c.forReg, c.forName, c.createdBy].join(" ").toLowerCase().indexOf(term) >= 0;
    });
  }

  function renderQcTable() {
    var rows = qcVisible();
    var open = qc.codes.filter(function (c) { return c.status === "Unlocked"; }).length;
    var unused = qc.codes.filter(function (c) { return c.status === "Unused"; }).length;
    $("qcNote").textContent = qc.codes.length
      ? "Showing " + Math.min(rows.length, 500) + " of " + qc.codes.length + " codes. " + unused + " unused, " + open + " in use right now."
      : "No quiz codes yet. Make some above.";
    table($("qcTable"), [
      { t: "Code" }, { t: "Status" }, { t: "For" }, { t: "Used by" }, { t: "Unlocked at" }, { t: "Completed at" }, { t: "Made by" }, { t: "" },
    ], rows.slice(0, 500).map(function (c) {
      var badge = el("span", "qc-status qc-" + c.status, QC_LABEL[c.status] || c.status);
      var action = "";
      if (c.status === "Unused" || c.status === "Unlocked") {
        var b = el("button", "btn ghost sh-rowbtn sh-del", "Cancel");
        b.type = "button";
        b.addEventListener("click", function () { revokeQc(c, b); });
        action = { node: b };
      }
      var code = el("span", "qc-code", c.code);
      return [{ node: code }, { node: badge }, qcWho(c.forReg, c.forName) || "Any student", qcWho(c.usedBy, c.usedByName), c.unlockedAt, c.completedAt || (c.revoked ? "Cancelled: " + c.revoked : ""), c.createdBy, action];
    }));
  }

  function loadQuizCodes() {
    return api("/api/admin/quiz-codes").then(function (r) { qc.codes = r.codes; renderQcTable(); });
  }

  function revokeQc(c, btn) {
    var msg = c.status === "Unlocked"
      ? "This code is in use: " + qcWho(c.usedBy, c.usedByName) + " has the quiz open right now. Cancelling locks their quiz straight away, and a quiz they have not finished will not be saved. Cancel it?"
      : "Cancel code " + c.code + "? Nobody will be able to use it.";
    if (!window.confirm(msg)) return;
    btn.disabled = true;
    api("/api/admin/quiz-codes/revoke", "POST", { code: c.code })
      .then(function () { $("qcMsg").textContent = "Code " + c.code + " cancelled."; return loadQuizCodes(); })
      .catch(function (err) {
        if (err.auth) return showLogin(err.message);
        btn.disabled = false;
        $("qcMsg").textContent = err.message;
        loadQuizCodes().catch(function () {});
      });
  }

  function openQuizCodes() {
    $("qcNote").textContent = "Loading...";
    loadQuizCodes().catch(function (err) { if (err.auth) showLogin(err.message); else $("qcNote").textContent = err.message; });
  }

  $("qcForm").addEventListener("submit", function (e) {
    e.preventDefault();
    showQcErrors(null);
    $("qcMsg").textContent = "";
    var b = $("qcMake");
    b.disabled = true;
    api("/api/admin/quiz-codes", "POST", { count: Number($("qc-count").value), forReg: $("qc-for").value })
      .then(function (r) {
        qc.newCodes = r.codes;
        renderQcNew();
        $("qcMsg").textContent = r.codes.length === 1 ? "1 code made." : r.codes.length + " codes made.";
        return loadQuizCodes();
      })
      .catch(function (err) {
        if (err.auth) return showLogin(err.message);
        showQcErrors(err.fields);
        $("qcMsg").textContent = err.fields ? "" : err.message;
      })
      .then(function () { b.disabled = false; });
  });
  $("qcCopyAll").addEventListener("click", function () {
    var b = $("qcCopyAll");
    copyText(qc.newCodes.map(function (c) { return c.code; }).join("\n"), function (ok) { b.textContent = ok ? "Copied" : "Copy failed"; setTimeout(function () { b.textContent = "Copy all"; }, 1500); });
  });
  $("qcReload").addEventListener("click", openQuizCodes);
  $("qcSearch").addEventListener("input", renderQcTable);
  $("qcStatus").addEventListener("change", renderQcTable);

  function renderLinks(fields, values) {
    linkFields = fields;
    renderFields($("linksForm"), fields, values);
  }
  // Builds the labelled boxes for a list of link fields (used by Site links and Community).
  function renderFields(form, fields, values) {
    form.replaceChildren();
    fields.forEach(function (f) {
      var wrap = el("div", "field");
      wrap.id = "lk-wrap-" + f.key;
      var label = el("label", null, f.label);
      label.setAttribute("for", "lk-" + f.key);
      var input;
      if (f.kind === "text") { input = el("textarea"); input.maxLength = f.max || 700; }
      else { input = el("input"); input.type = f.kind === "phone" ? "tel" : "url"; input.autocomplete = "off"; input.spellcheck = false; }
      input.id = "lk-" + f.key;
      input.placeholder = f.hint || "";
      input.value = values[f.key] || "";
      var err = el("p", "lk-err");
      err.id = "lk-err-" + f.key;
      err.setAttribute("role", "alert");
      wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(err);
      form.appendChild(wrap);
    });
  }
  function showLinkErrors(errs) {
    linkFields.forEach(function (f) {
      var msg = (errs && errs[f.key]) || "";
      $("lk-err-" + f.key).textContent = msg;
      $("lk-wrap-" + f.key).classList.toggle("invalid", !!msg);
    });
  }
  // ---------- Student community (WhatsApp and Telegram groups) ----------
  var communityFields = [];
  function showCommunityErrors(errs) {
    communityFields.forEach(function (f) {
      var msg = (errs && errs[f.key]) || "";
      $("lk-err-" + f.key).textContent = msg;
      $("lk-wrap-" + f.key).classList.toggle("invalid", !!msg);
    });
  }
  function loadCommunity() {
    return api("/api/admin/community").then(function (r) {
      communityFields = r.fields;
      renderFields($("communityForm"), r.fields, r.values);
      $("communityMsg").textContent = "";
    });
  }
  $("communitySave").addEventListener("click", function () {
    var b = this, body = {};
    communityFields.forEach(function (f) { body[f.key] = $("lk-" + f.key).value; });
    b.disabled = true;
    $("communityMsg").textContent = "Saving...";
    showCommunityErrors(null);
    api("/api/admin/community", "PUT", body)
      .then(function (r) { renderFields($("communityForm"), communityFields, r.values); $("communityMsg").textContent = "Saved. Students now see these groups on their Community page."; })
      .catch(function (err) {
        if (err.auth) { showLogin(err.message); return; }
        showCommunityErrors(err.fields);
        $("communityMsg").textContent = err.message;
      })
      .then(function () { b.disabled = false; });
  });

  function loadLinks() {
    return api("/api/admin/links").then(function (r) { renderLinks(r.fields, r.values); $("linksMsg").textContent = ""; });
  }
  $("linksSave").addEventListener("click", function () {
    var b = this, body = {};
    linkFields.forEach(function (f) { body[f.key] = $("lk-" + f.key).value; });
    b.disabled = true;
    $("linksMsg").textContent = "Saving...";
    showLinkErrors(null);
    api("/api/admin/links", "PUT", body)
      .then(function (r) { renderLinks(linkFields, r.values); $("linksMsg").textContent = "Saved. The website now shows these links."; })
      .catch(function (err) {
        if (err.auth) { showLogin(err.message); return; }
        showLinkErrors(err.fields);
        $("linksMsg").textContent = err.message;
      })
      .then(function () { b.disabled = false; });
  });

  // ---------- Chapter videos ----------
  var videoChapters = [];
  function renderVideos(chapters, values) {
    videoChapters = chapters;
    var form = $("videosForm");
    form.replaceChildren();
    chapters.forEach(function (c) {
      var wrap = el("div", "field");
      wrap.id = "vd-wrap-" + c.id;
      var label = el("label", null, "Chapter " + c.id + ": " + c.title);
      label.setAttribute("for", "vd-" + c.id);
      var input = el("input");
      input.type = "url"; input.autocomplete = "off"; input.spellcheck = false;
      input.id = "vd-" + c.id;
      input.placeholder = "https://youtu.be/...";
      input.value = values[c.id] || "";
      var err = el("p", "lk-err");
      err.id = "vd-err-" + c.id;
      err.setAttribute("role", "alert");
      wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(err);
      form.appendChild(wrap);
    });
  }
  function showVideoErrors(errs) {
    videoChapters.forEach(function (c) {
      var msg = (errs && errs[c.id]) || "";
      $("vd-err-" + c.id).textContent = msg;
      $("vd-wrap-" + c.id).classList.toggle("invalid", !!msg);
    });
  }
  function loadVideos() {
    return api("/api/admin/videos").then(function (r) { renderVideos(r.chapters, r.values); $("videosMsg").textContent = ""; });
  }
  $("videosSave").addEventListener("click", function () {
    var b = this, body = {};
    videoChapters.forEach(function (c) { body[c.id] = $("vd-" + c.id).value; });
    b.disabled = true;
    $("videosMsg").textContent = "Saving...";
    showVideoErrors(null);
    api("/api/admin/videos", "PUT", body)
      .then(function (r) { renderVideos(videoChapters, r.values); $("videosMsg").textContent = "Saved. Students see these videos in the handbook."; })
      .catch(function (err) {
        if (err.auth) { showLogin(err.message); return; }
        showVideoErrors(err.fields);
        $("videosMsg").textContent = err.message;
      })
      .then(function () { b.disabled = false; });
  });

  // ---------- Database: browse, add, edit and delete the records ----------
  // The server decides what each sheet allows (sh.data.editable, canDelete, add) and checks every change again.
  var shDlg = $("shDlg");

  function loadSheetMeta() {
    return api("/api/admin/database").then(function (m) {
      sh.meta = m;
      var open = $("shOpen");
      var ok = typeof m.sheetUrl === "string" && m.sheetUrl.indexOf("https://docs.google.com/") === 0;
      open.hidden = !ok;
      if (ok) open.href = m.sheetUrl;
      renderPicker();
    });
  }

  function renderPicker() {
    var box = $("shPicker");
    box.replaceChildren();
    ((sh.meta && sh.meta.sheets) || []).forEach(function (s) {
      var b = el("button", "sh-pick", s.label);
      b.type = "button";
      b.setAttribute("aria-pressed", s.key === sh.key ? "true" : "false");
      b.addEventListener("click", function () { $("shSearch").value = ""; loadSheet(s.key); });
      box.appendChild(b);
    });
  }

  function loadSheet(key) {
    sh.key = key;
    renderPicker();
    $("shNote").textContent = "Loading...";
    var seq = ++shSeq;
    return api("/api/admin/database/" + encodeURIComponent(key)).then(function (d) {
      if (seq !== shSeq) return; // a newer click replaced this one
      sh.data = d;
      sh.page = 0;
      renderSheet();
    }).catch(function (err) {
      if (seq !== shSeq) return;
      if (err.auth) { showLogin(err.message); return; }
      sh.data = null;
      $("shTable").replaceChildren();
      $("shNote").textContent = err.message;
    });
  }

  function shVisibleRows() {
    var d = sh.data;
    if (!d) return [];
    var rows = d.rows.slice();
    if (d.newestFirst) rows.reverse();
    var term = $("shSearch").value.trim().toLowerCase();
    if (term) rows = rows.filter(function (r) { return r.cells.join(" ").toLowerCase().indexOf(term) >= 0; });
    return rows;
  }

  function renderSheet() {
    var d = sh.data;
    if (!d) return;
    $("shHelp").textContent = d.help;
    $("shAdd").hidden = !d.add;
    if (d.add) $("shAdd").textContent = d.add.label;
    var rows = shVisibleRows();
    var pages = Math.max(1, Math.ceil(rows.length / SH_PAGE));
    if (sh.page >= pages) sh.page = pages - 1;
    var slice = rows.slice(sh.page * SH_PAGE, (sh.page + 1) * SH_PAGE);
    var canOpen = d.editable.length > 0 || d.canDelete;
    var head = [{ t: "Row", n: 1 }].concat(canOpen ? [{ t: "Actions" }] : []).concat(d.headers.map(function (h) { return { t: h }; }));
    table($("shTable"), head, slice.map(function (r) {
      var first = r.n;
      var lead = [];
      if (canOpen) {
        var b = el("button", "linkbtn", String(r.n));
        b.type = "button";
        b.setAttribute("aria-label", (d.editable.length ? "Edit" : "Open") + " row " + r.n);
        b.addEventListener("click", function () { openRow(r); });
        first = { node: b };
        // visible buttons, right after the row number so they never scroll out of sight
        var box = el("span", "sh-actions");
        var eb = el("button", "btn ghost sh-rowbtn", d.editable.length ? "Edit" : "Open");
        eb.type = "button";
        eb.setAttribute("aria-label", (d.editable.length ? "Edit" : "Open") + " record " + r.n);
        eb.addEventListener("click", function () { openRow(r); });
        box.appendChild(eb);
        if (d.canDelete) {
          var db = el("button", "btn ghost sh-rowbtn sh-del", "Delete");
          db.type = "button";
          db.setAttribute("aria-label", "Delete record " + r.n);
          db.addEventListener("click", function () { deleteRow(r, db); });
          box.appendChild(db);
        }
        lead = [{ node: box }];
      }
      return [first].concat(lead).concat(r.cells.map(function (c) {
        var s = el("span", "sh-cell", c);
        if (c.length > 30) s.title = c;
        return { node: s };
      }));
    }));
    var term = $("shSearch").value.trim();
    var note = !d.rows.length ? "There are no records here yet."
      : term ? rows.length + " of " + d.rows.length + " record(s) match your search."
      : d.rows.length + " record(s)." + (d.newestFirst ? " Newest first." : "");
    if (rows.length && !canOpen) note += " This table is view only.";
    if (sh.flash) { note = sh.flash + " " + note; sh.flash = ""; }
    $("shNote").textContent = note;
    $("shPage").textContent = "Page " + (sh.page + 1) + " of " + pages;
    $("shPrev").disabled = sh.page <= 0;
    $("shNext").disabled = sh.page >= pages - 1;
    $("shPager").hidden = pages <= 1;
  }

  // Country changed in the form: offer that country's states / regions in the State box.
  function fillStates(country) {
    var dl = $("shStates");
    if (!dl) return;
    dl.replaceChildren();
    if (!country) return;
    fetch("/api/states?country=" + encodeURIComponent(country))
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var now = $("shStates");
        if (!now || !Array.isArray(list)) return;
        now.replaceChildren();
        list.forEach(function (s) { var o = el("option"); o.value = s; now.appendChild(o); });
      })
      .catch(function () {});
  }

  function buildFields(d, cells, only) {
    var box = $("shFields");
    box.replaceChildren();
    (only || d.headers.map(function (h, n) { return n; })).forEach(function (i) {
      var h = d.headers[i];
      var editable = only ? true : d.editable.indexOf(i) >= 0;
      var wrap = el("div", "field");
      wrap.id = "sh-wrap-" + i;
      var label = el("label", null, h + (editable ? "" : " (locked)"));
      label.setAttribute("for", "sh-f-" + i);
      var input;
      var opts = d.selects && d.selects[i];
      if (opts) {
        input = el("select");
        var list = opts.slice();
        if (list.indexOf(cells[i]) < 0) list.unshift(cells[i]); // keep a value that is not on the list (older rows)
        list.forEach(function (o) { var op = el("option", null, o === "" ? "(none)" : o); op.value = o; input.appendChild(op); });
        input.value = cells[i];
      } else if (d.multiline && d.multiline.indexOf(i) >= 0) {
        input = el("textarea");
        input.value = cells[i];
      } else {
        input = el("input");
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.value = cells[i];
      }
      input.id = "sh-f-" + i;
      input.disabled = !editable;
      if (d.placeholders && d.placeholders[i]) input.placeholder = d.placeholders[i];
      if (d.key === "students" && i === 12 && editable) input.setAttribute("list", "shStates");
      if (d.key === "students" && i === 2 && editable) input.addEventListener("change", function () { fillStates(input.value); });
      if (only && !(d.selects && d.selects[i])) input.autocomplete = "off";
      input.addEventListener("input", function () {
        var e = $("sh-err-" + i), w = $("sh-wrap-" + i);
        if (e) e.textContent = "";
        if (w) w.classList.remove("invalid");
      });
      var err = el("p", "lk-err");
      err.id = "sh-err-" + i;
      err.setAttribute("role", "alert");
      wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(err);
      box.appendChild(wrap);
    });
    if (d.key === "students") {
      var dl = el("datalist");
      dl.id = "shStates";
      box.appendChild(dl);
      fillStates(cells[2]);
    }
  }

  function showShErrors(errs) {
    if (!sh.data) return;
    var first = null;
    sh.data.headers.forEach(function (h, i) {
      var msg = (errs && errs[i]) || "";
      var p = $("sh-err-" + i), w = $("sh-wrap-" + i);
      if (p) p.textContent = msg;
      if (w) w.classList.toggle("invalid", !!msg);
      if (msg && !first) first = w;
    });
    if (first && first.scrollIntoView) first.scrollIntoView({ block: "nearest" });
  }

  function openRow(r) {
    var d = sh.data;
    sh.mode = "edit";
    sh.row = r;
    $("shDlgTitle").textContent = d.label + ": record " + r.n;
    $("shDlgNote").textContent = d.editable.length
      ? "Greyed-out fields are locked. Changes are saved straight away."
      : "You can delete this record if it should not be there.";
    buildFields(d, r.cells);
    $("shSave").hidden = !d.editable.length;
    $("shSave").textContent = "Save changes";
    $("shDelete").hidden = !d.canDelete;
    $("shDelete").textContent = "Delete";
    $("shDlgErr").textContent = "";
    shDlg.showModal();
  }

  function openAdd() {
    var d = sh.data;
    if (!d || !d.add) return;
    sh.row = null;
    $("shDlgTitle").textContent = d.add.label;
    $("shDlgNote").textContent = d.add.help;
    var focus;
    if (d.add.mode === "text") {
      sh.mode = "add";
      var box = $("shFields");
      box.replaceChildren();
      var wrap = el("div", "field");
      var label = el("label", null, d.add.label);
      label.setAttribute("for", "sh-add-text");
      var ta = el("textarea");
      ta.id = "sh-add-text";
      ta.rows = 6;
      ta.spellcheck = false;
      ta.autocomplete = "off";
      wrap.appendChild(label); wrap.appendChild(ta);
      box.appendChild(wrap);
      focus = ta;
    } else {
      sh.mode = "create";
      var blank = d.headers.map(function (h, i) { return (d.add.defaults && d.add.defaults[i]) || ""; });
      buildFields(d, blank, d.add.fields);
      focus = $("sh-f-" + d.add.fields[0]);
    }
    $("shSave").hidden = false;
    $("shSave").textContent = "Add";
    $("shDelete").hidden = true;
    $("shDlgErr").textContent = "";
    shDlg.showModal();
    if (focus) focus.focus();
  }

  // After a failed change: sign-in problems go to the login, a changed row reloads, anything else shows in the form.
  function shFail(err) {
    if (err.auth) { shDlg.close(); showLogin(err.message); return; }
    if (err.status === 409) { shDlg.close(); sh.flash = err.message; loadSheet(sh.key); return; }
    showShErrors(err.fields);
    $("shDlgErr").textContent = err.message;
  }

  $("shForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var d = sh.data, btn = $("shSave");
    if (!d) return;
    btn.disabled = true;
    $("shDlgErr").textContent = "Saving...";
    var base = "/api/admin/database/" + encodeURIComponent(d.key) + "/rows";
    var job;
    if (sh.mode === "add" || sh.mode === "create") {
      var payload;
      if (sh.mode === "add") payload = { text: $("sh-add-text").value };
      else {
        var vals = {};
        d.add.fields.forEach(function (i) { vals[i] = $("sh-f-" + i).value; });
        payload = { values: vals };
        showShErrors(null);
      }
      job = api(base, "POST", payload).then(function (r) {
        sh.flash = r.reg ? "Added " + r.reg + "." : "Added " + r.added + " record" + (r.added === 1 ? "" : "s") + ".";
        shDlg.close();
        $("shSearch").value = "";
        return loadSheet(d.key);
      });
    } else {
      var row = sh.row, values = {};
      d.editable.forEach(function (i) { values[i] = $("sh-f-" + i).value; });
      showShErrors(null);
      job = api(base + "/" + row.n, "PUT", { original: row.cells, values: values }).then(function (r) {
        row.cells = r.row;
        sh.flash = r.changed ? "Saved record " + row.n + "." : "Nothing was changed.";
        shDlg.close();
        renderSheet();
      });
    }
    job.catch(shFail).then(function () { btn.disabled = false; });
  });

  // Delete one record (from the row's Delete button or from inside the record's window).
  function deleteRow(row, btn) {
    var d = sh.data;
    if (!d || !row) return;
    if (!window.confirm("Delete record " + row.n + " from \"" + d.label + "\"? " + (d.deleteWarning || "This cannot be undone."))) return;
    btn.disabled = true;
    $("shDlgErr").textContent = "Deleting...";
    $("shNote").textContent = "Deleting...";
    api("/api/admin/database/" + encodeURIComponent(d.key) + "/rows/" + row.n + "/delete", "POST", { original: row.cells })
      .then(function () {
        sh.flash = "Deleted record " + row.n + ".";
        if (shDlg.open) shDlg.close();
        return loadSheet(d.key);
      })
      .catch(function (err) {
        if (shDlg.open) return shFail(err);
        if (err.auth) return showLogin(err.message);
        if (err.status === 409) { sh.flash = err.message; return loadSheet(sh.key); }
        $("shNote").textContent = err.message;
      })
      .then(function () { btn.disabled = false; });
  }
  $("shDelete").addEventListener("click", function () { deleteRow(sh.row, this); });

  $("shDlgClose").addEventListener("click", function () { shDlg.close(); });
  shDlg.addEventListener("click", function (e) { if (e.target === shDlg) shDlg.close(); });
  shDlg.addEventListener("close", function () { $("shDlgErr").textContent = ""; });
  $("shSearch").addEventListener("input", function () { sh.page = 0; renderSheet(); });
  $("shReload").addEventListener("click", function () { loadSheet(sh.key); });
  $("shAdd").addEventListener("click", openAdd);
  $("shPrev").addEventListener("click", function () { sh.page--; renderSheet(); });
  $("shNext").addEventListener("click", function () { sh.page++; renderSheet(); });

  function openSheets() {
    var go = function () { return loadSheet(sh.key); };
    Promise.resolve(sh.meta ? go() : loadSheetMeta().then(go)).catch(function (err) {
      if (err.auth) showLogin(err.message); else $("shNote").textContent = err.message;
    });
  }

  // ---------- Team ----------
  var teamData = null; // { members, roles }
  var tm = { mode: "add", member: null };
  var tmDlg = $("tmDlg");
  var TM_FIELDS = ["username", "fullName", "role", "password"];

  function openTeam() {
    $("tmNote").textContent = "Loading...";
    return api("/api/admin/team").then(function (r) {
      teamData = r;
      $("tmNote").textContent = "";
      renderTeam();
      renderRoles();
    }).catch(function (err) {
      if (err.auth) showLogin(err.message); else $("tmNote").textContent = err.message;
    });
  }

  function roleLabel(key) {
    var r = teamData && teamData.roles.filter(function (x) { return x.key === key; })[0];
    return r ? r.label : key;
  }

  function renderTeam() {
    var t = $("tmTable");
    t.replaceChildren();
    var head = el("tr");
    ["Name", "Username", "Role", "Status", "Added by", "Added"].forEach(function (h) { head.appendChild(el("th", null, h)); });
    head.appendChild(el("th"));
    var thead = el("thead"); thead.appendChild(head); t.appendChild(thead);
    var body = el("tbody");
    var list = teamData ? teamData.members : [];
    if (!list.length) {
      var tr0 = el("tr"), td0 = el("td", "empty", "No team members yet. Use \"Add team member\" to create the first one.");
      td0.colSpan = 7; tr0.appendChild(td0); body.appendChild(tr0);
    }
    list.forEach(function (m) {
      var tr = el("tr");
      tr.appendChild(el("td", null, m.name));
      tr.appendChild(el("td", null, m.username));
      tr.appendChild(el("td", null, roleLabel(m.role)));
      tr.appendChild(el("td", null, m.active ? "Active" : "Disabled"));
      tr.appendChild(el("td", null, m.createdBy));
      tr.appendChild(el("td", null, m.createdAt));
      var act = el("td");
      var b = el("button", "linkbtn", "Edit");
      b.type = "button";
      b.setAttribute("aria-label", "Edit " + m.name);
      b.addEventListener("click", function () { openTeamDlg("edit", m); });
      act.appendChild(b);
      tr.appendChild(act);
      body.appendChild(tr);
    });
    t.appendChild(body);
  }

  function showTeamErrors(errs) {
    TM_FIELDS.forEach(function (f) {
      var msg = errs && errs[f] ? errs[f] : "";
      $("tm-e-" + f).textContent = msg;
      $("tm-w-" + f).classList.toggle("invalid", !!msg);
    });
  }

  function permLabel(key) {
    var p = teamData && teamData.permissions.filter(function (x) { return x.key === key; })[0];
    return p ? p.label : key;
  }
  function roleFor(key) {
    return teamData && teamData.roles.filter(function (x) { return x.key === key; })[0];
  }
  function accessText(r) {
    return r ? r.perms.map(permLabel).join(", ") : "";
  }
  function roleHelp() {
    var r = roleFor($("tm-role").value);
    $("tm-roleHelp").textContent = r ? "Can open: " + accessText(r) + "." : "";
  }

  function openTeamDlg(mode, member) {
    tm = { mode: mode, member: member || null };
    var adding = mode === "add";
    $("tmDlgTitle").textContent = adding ? "Add team member" : member.name;
    var sel = $("tm-role");
    sel.replaceChildren();
    (teamData ? teamData.roles : []).forEach(function (r) {
      // hide roles that allow more than the signed-in person has, except the one this member already holds
      if (!r.canGrant && !(member && member.role === r.key)) return;
      var o = el("option", null, r.label + (r.builtin ? "" : " (custom)")); o.value = r.key;
      if (!r.canGrant) o.disabled = true;
      sel.appendChild(o);
    });
    $("tm-username").value = adding ? "" : member.username;
    $("tm-username").disabled = !adding;
    $("tm-fullName").value = adding ? "" : member.name;
    sel.value = adding ? "moderator" : member.role;
    if (adding && sel.value !== "moderator" && sel.options.length) sel.selectedIndex = 0;
    $("tm-password").value = "";
    $("tm-passwordLabel").textContent = adding ? "Password" : "New password (optional)";
    $("tm-passwordHelp").textContent = adding
      ? "At least 8 characters. Share it with them privately; they can change it after signing in."
      : "Leave empty to keep their current password. Typing one replaces it.";
    $("tm-active").value = !adding && !member.active ? "no" : "yes";
    $("tm-w-active").hidden = adding;
    var self = !adding && me && member.username === me.username;
    // nobody can demote, disable or remove themselves
    sel.disabled = self;
    $("tm-active").disabled = self;
    $("tmRemove").hidden = adding || self;
    $("tmSave").textContent = adding ? "Add team member" : "Save changes";
    $("tmDlgErr").textContent = "";
    showTeamErrors(null);
    roleHelp();
    tmDlg.showModal();
    (adding ? $("tm-username") : $("tm-fullName")).focus();
  }

  function teamFail(err) {
    if (err.auth) { tmDlg.close(); return showLogin(err.message); }
    showTeamErrors(err.fields);
    $("tmDlgErr").textContent = err.message;
  }

  $("tmAdd").addEventListener("click", function () { openTeamDlg("add"); });
  $("tmDlgClose").addEventListener("click", function () { tmDlg.close(); });
  tmDlg.addEventListener("click", function (e) { if (e.target === tmDlg) tmDlg.close(); });
  $("tm-role").addEventListener("change", roleHelp);
  TM_FIELDS.forEach(function (f) {
    $("tm-" + f).addEventListener("input", function () { $("tm-e-" + f).textContent = ""; $("tm-w-" + f).classList.remove("invalid"); });
  });

  $("tmForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("tmSave");
    btn.disabled = true;
    $("tmDlgErr").textContent = "Saving...";
    showTeamErrors(null);
    var job;
    if (tm.mode === "add") {
      job = api("/api/admin/team", "POST", {
        username: $("tm-username").value, fullName: $("tm-fullName").value, role: $("tm-role").value, password: $("tm-password").value,
      });
    } else {
      var body = { fullName: $("tm-fullName").value, role: $("tm-role").value, active: $("tm-active").value === "yes" };
      if ($("tm-password").value) body.password = $("tm-password").value;
      job = api("/api/admin/team/" + encodeURIComponent(tm.member.username), "PUT", body);
    }
    job.then(function () {
      tmDlg.close();
      return openTeam().then(function () { $("tmNote").textContent = tm.mode === "add" ? "Team member added." : "Changes saved."; });
    }).catch(teamFail).then(function () { btn.disabled = false; });
  });

  $("tmRemove").addEventListener("click", function () {
    var m = tm.member;
    if (!m) return;
    if (!window.confirm("Remove " + m.name + " (" + m.username + ") from the team? They will be signed out and cannot sign in again. This cannot be undone.")) return;
    var btn = this;
    btn.disabled = true;
    api("/api/admin/team/" + encodeURIComponent(m.username) + "/delete", "POST", {}).then(function () {
      tmDlg.close();
      return openTeam().then(function () { $("tmNote").textContent = m.name + " was removed."; });
    }).catch(teamFail).then(function () { btn.disabled = false; });
  });


  // ---------- Roles and access ----------
  var rl = { mode: "add", role: null };
  var rlDlg = $("rlDlg");
  var RL_FIELDS = ["name", "perms"];

  function renderRoles() {
    var t = $("rlTable");
    t.replaceChildren();
    var head = el("tr");
    ["Role", "Type", "Can open", "People"].forEach(function (h) { head.appendChild(el("th", null, h)); });
    head.appendChild(el("th"));
    var thead = el("thead"); thead.appendChild(head); t.appendChild(thead);
    var body = el("tbody");
    var list = teamData ? teamData.roles : [];
    list.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", null, r.label));
      tr.appendChild(el("td", null, r.builtin ? "Built in" : "Custom"));
      tr.appendChild(el("td", null, accessText(r)));
      tr.appendChild(el("td", null, String(r.members)));
      var act = el("td");
      if (!r.builtin) {
        var b = el("button", "linkbtn", "Edit");
        b.type = "button";
        b.setAttribute("aria-label", "Edit role " + r.label);
        b.addEventListener("click", function () { openRoleDlg("edit", r); });
        act.appendChild(b);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
    t.appendChild(body);
  }

  function showRoleErrors(errs) {
    RL_FIELDS.forEach(function (f) {
      var msg = errs && errs[f] ? errs[f] : "";
      $("rl-e-" + f).textContent = msg;
      $("rl-w-" + f).classList.toggle("invalid", !!msg);
    });
  }

  function openRoleDlg(mode, role) {
    rl = { mode: mode, role: role || null };
    var adding = mode === "add";
    var mine = me ? me.perms : [];
    $("rlDlgTitle").textContent = adding ? "Create role" : role.label;
    $("rl-name").value = adding ? "" : role.label;
    var box = $("rl-perms");
    box.replaceChildren();
    (teamData ? teamData.permissions : []).forEach(function (p) {
      var row = el("label", "perm-row");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = p.key;
      var always = p.key === "view";
      var have = mine.indexOf(p.key) >= 0;
      cb.checked = always || (!adding && role.perms.indexOf(p.key) >= 0);
      // "view" is always on (signing in needs it); access you do not have yourself cannot be given
      cb.disabled = always || !have;
      var txt = el("span", "perm-txt");
      txt.appendChild(el("b", null, p.label));
      txt.appendChild(el("small", null, always ? p.help : (have ? p.help : "You do not have this access, so you cannot give it.")));
      row.appendChild(cb);
      row.appendChild(txt);
      box.appendChild(row);
    });
    $("rlRemove").hidden = adding;
    $("rlSave").textContent = adding ? "Create role" : "Save changes";
    $("rlDlgErr").textContent = "";
    showRoleErrors(null);
    rlDlg.showModal();
    $("rl-name").focus();
  }

  function roleFail(err) {
    if (err.auth) { rlDlg.close(); return showLogin(err.message); }
    showRoleErrors(err.fields);
    $("rlDlgErr").textContent = err.message;
  }

  function pickedPerms() {
    return Array.prototype.filter.call($("rl-perms").querySelectorAll("input[type=checkbox]"), function (c) { return c.checked; })
      .map(function (c) { return c.value; });
  }

  $("rlAdd").addEventListener("click", function () { openRoleDlg("add"); });
  $("rlDlgClose").addEventListener("click", function () { rlDlg.close(); });
  rlDlg.addEventListener("click", function (e) { if (e.target === rlDlg) rlDlg.close(); });
  RL_FIELDS.forEach(function (f) {
    ["input", "change"].forEach(function (ev) {
      $("rl-w-" + f).addEventListener(ev, function () { $("rl-e-" + f).textContent = ""; $("rl-w-" + f).classList.remove("invalid"); $("rlDlgErr").textContent = ""; });
    });
  });

  $("rlForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("rlSave");
    btn.disabled = true;
    $("rlDlgErr").textContent = "Saving...";
    showRoleErrors(null);
    var body = { name: $("rl-name").value, perms: pickedPerms() };
    var job = rl.mode === "add"
      ? api("/api/admin/roles", "POST", body)
      : api("/api/admin/roles/" + encodeURIComponent(rl.role.key), "PUT", body);
    job.then(function () {
      rlDlg.close();
      var msg = rl.mode === "add" ? "Role created." : "Role saved. People with this role get the new access straight away.";
      return openTeam().then(function () { $("rlNote").textContent = msg; });
    }).catch(roleFail).then(function () { btn.disabled = false; });
  });

  $("rlRemove").addEventListener("click", function () {
    var r = rl.role;
    if (!r) return;
    if (!window.confirm("Delete the role " + r.label + "? This cannot be undone.")) return;
    var btn = this;
    btn.disabled = true;
    api("/api/admin/roles/" + encodeURIComponent(r.key) + "/delete", "POST", {}).then(function () {
      rlDlg.close();
      return openTeam().then(function () { $("rlNote").textContent = "The role " + r.label + " was deleted."; });
    }).catch(roleFail).then(function () { btn.disabled = false; });
  });

  // ---------- Your own password ----------
  var pwDlg = $("pwDlg");
  function showPwErrors(errs) {
    ["current", "next"].forEach(function (f) {
      var msg = errs && errs[f] ? errs[f] : "";
      $("pw-e-" + f).textContent = msg;
      $("pw-w-" + f).classList.toggle("invalid", !!msg);
    });
  }
  $("acctBtn").addEventListener("click", function () {
    $("pw-current").value = ""; $("pw-next").value = "";
    $("pwDlgErr").textContent = "";
    showPwErrors(null);
    pwDlg.showModal();
    $("pw-current").focus();
  });
  $("pwDlgClose").addEventListener("click", function () { pwDlg.close(); });
  pwDlg.addEventListener("click", function (e) { if (e.target === pwDlg) pwDlg.close(); });
  $("pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("pwSave");
    btn.disabled = true;
    $("pwDlgErr").textContent = "Saving...";
    showPwErrors(null);
    api("/api/admin/me/password", "POST", { current: $("pw-current").value, next: $("pw-next").value }).then(function () {
      pwDlg.close();
      $("stamp").textContent = "Password changed.";
    }).catch(function (err) {
      if (err.auth) { pwDlg.close(); return showLogin(err.message); }
      showPwErrors(err.fields);
      $("pwDlgErr").textContent = err.message;
    }).then(function () { btn.disabled = false; });
  });

  // ---------- Events ----------
  function setTab(name) {
    if (TAB_NEEDS[name] && !allowed(TAB_NEEDS[name])) name = "overview";
    ["overview", "quiz", "quizcodes", "links", "community", "videos", "database", "team"].forEach(function (n) {
      $("view-" + n).hidden = n !== name;
      $("tab-" + n).setAttribute("aria-selected", n === name ? "true" : "false");
    });
    $("statsHint").hidden = name === "links" || name === "community" || name === "videos" || name === "database" || name === "team" || name === "quizcodes";
    if (name === "quizcodes") openQuizCodes();
    if (name === "database") openSheets();
    if (name === "team") openTeam();
    if (name === "videos") {
      $("videosMsg").textContent = "Loading...";
      loadVideos().catch(function (err) { if (err.auth) showLogin(err.message); else $("videosMsg").textContent = err.message; });
    }
    if (name === "community") {
      $("communityMsg").textContent = "Loading...";
      loadCommunity().catch(function (err) { if (err.auth) showLogin(err.message); else $("communityMsg").textContent = err.message; });
    }
    if (name === "links") {
      $("linksMsg").textContent = "Loading...";
      loadLinks().catch(function (err) { if (err.auth) showLogin(err.message); else $("linksMsg").textContent = err.message; });
    }
  }
  $("tab-overview").addEventListener("click", function () { setTab("overview"); });
  $("tab-quiz").addEventListener("click", function () { setTab("quiz"); });
  $("tab-quizcodes").addEventListener("click", function () { setTab("quizcodes"); });
  $("tab-links").addEventListener("click", function () { setTab("links"); });
  $("tab-community").addEventListener("click", function () { setTab("community"); });
  $("tab-videos").addEventListener("click", function () { setTab("videos"); });
  $("tab-database").addEventListener("click", function () { setTab("database"); });
  $("tab-team").addEventListener("click", function () { setTab("team"); });
  $("yearSel").addEventListener("change", drawMonthYear);
  ["q", "gradeFilter", "viewMode"].forEach(function (id) {
    $(id).addEventListener(id === "q" ? "input" : "change", renderResults);
  });
  $("csvBtn").addEventListener("click", downloadCsv);

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var un = $("un").value.trim(), pw = $("pw").value;
    if (!un) { $("loginErr").textContent = "Enter your username."; return; }
    if (!pw) { $("loginErr").textContent = "Enter your password."; return; }
    var b = $("loginBtn");
    b.disabled = true;
    b.textContent = "Checking...";
    $("loginErr").textContent = "";
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: un, password: pw }),
    })
      .then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.error || "Could not sign in.");
          token = body.token;
          return load();
        });
      })
      .catch(function (err) { token = ""; $("loginErr").textContent = err.message; })
      .then(function () { b.disabled = false; b.textContent = "Sign in"; $("pw").value = ""; });
  });

  $("refreshBtn").addEventListener("click", function () {
    var b = this;
    b.disabled = true;
    load()
      .then(function () { if (!$("view-database").hidden) return loadSheet(sh.key); })
      .then(function () { if (!$("view-quizcodes").hidden) return loadQuizCodes(); })
      .catch(function (err) { if (err.auth) showLogin(err.message); else $("stamp").textContent = err.message; })
      .then(function () { b.disabled = false; });
  });

  $("logoutBtn").addEventListener("click", function () {
    if (dlg.open) dlg.close();
    token = "";
    save("");
    stats = null;
    showLogin("");
  });

  // Come back without retyping during the same browser session.
  var remembered = getSaved();
  if (remembered) {
    token = remembered;
    load().catch(function () { token = ""; save(""); showLogin(""); });
  }
})();
