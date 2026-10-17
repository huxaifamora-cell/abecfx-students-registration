(function () {
  "use strict";
  var SS_KEY = "abecfx_admin";
  var MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NS = "http://www.w3.org/2000/svg";

  var $ = function (id) { return document.getElementById(id); };
  var password = "";
  var stats = null;
  var results = [];
  var scale = [];

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
    var opts = { method: method || "GET", headers: { Authorization: "Bearer " + password } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (b) {
        if (r.status === 401) { var e = new Error(b.error || "Wrong password."); e.auth = true; throw e; }
        if (!r.ok) { var e2 = new Error(b.error || "Something went wrong."); e2.fields = b.errors; throw e2; }
        return b;
      });
    });
  }

  function showLogin(msg) {
    $("dash").hidden = true;
    $("topActions").hidden = true;
    $("login").hidden = false;
    $("loginErr").textContent = msg || "";
  }

  function load() {
    return Promise.all([api("/api/admin/stats"), api("/api/admin/results")]).then(function (res) {
      stats = res[0];
      results = res[1].results;
      scale = res[1].scale;
      save(password);
      $("login").hidden = true;
      $("dash").hidden = false;
      $("topActions").hidden = false;
      $("stamp").textContent = "Updated " + stats.generatedAt;
      renderOverview();
      renderQuiz();
    });
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
      kpi("Certified / graduates", s.graduates, { kind: "graduates" }),
      kpi("Uncertified", s.uncertified, { kind: "uncertified" }),
      kpi("Mentors, staff and CEO", s.team, { kind: "team" }),
      kpi("Took the quiz", s.quiz.students, { kind: "quiz-students" }),
      kpi("Average quiz score", s.quiz.avgPct == null ? "-" : s.quiz.avgPct + "%", { kind: "quiz-avg" })
    );
    var by = function (kind) { return function (i) { return { kind: kind, value: i.label }; }; };
    bars($("c-status"), s.status.filter(function (x) { return x.count > 0; }), { total: s.total, drill: by("status") });
    $("c-status-note").textContent = "Certified / graduates = Certified, Graduate and Alumni Member.";
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
  function renderLinks(fields, values) {
    linkFields = fields;
    var form = $("linksForm");
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

  // ---------- Events ----------
  function setTab(name) {
    ["overview", "quiz", "links", "videos"].forEach(function (n) {
      $("view-" + n).hidden = n !== name;
      $("tab-" + n).setAttribute("aria-selected", n === name ? "true" : "false");
    });
    $("statsHint").hidden = name === "links" || name === "videos";
    if (name === "videos") {
      $("videosMsg").textContent = "Loading...";
      loadVideos().catch(function (err) { if (err.auth) showLogin(err.message); else $("videosMsg").textContent = err.message; });
    }
    if (name === "links") {
      $("linksMsg").textContent = "Loading...";
      loadLinks().catch(function (err) { if (err.auth) showLogin(err.message); else $("linksMsg").textContent = err.message; });
    }
  }
  $("tab-overview").addEventListener("click", function () { setTab("overview"); });
  $("tab-quiz").addEventListener("click", function () { setTab("quiz"); });
  $("tab-links").addEventListener("click", function () { setTab("links"); });
  $("tab-videos").addEventListener("click", function () { setTab("videos"); });
  $("yearSel").addEventListener("change", drawMonthYear);
  ["q", "gradeFilter", "viewMode"].forEach(function (id) {
    $(id).addEventListener(id === "q" ? "input" : "change", renderResults);
  });
  $("csvBtn").addEventListener("click", downloadCsv);

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("pw").value;
    if (!pw) { $("loginErr").textContent = "Enter the password."; return; }
    password = pw;
    var b = $("loginBtn");
    b.disabled = true;
    b.textContent = "Checking...";
    $("loginErr").textContent = "";
    load()
      .catch(function (err) { password = ""; $("loginErr").textContent = err.message; })
      .then(function () { b.disabled = false; b.textContent = "Sign in"; $("pw").value = ""; });
  });

  $("refreshBtn").addEventListener("click", function () {
    var b = this;
    b.disabled = true;
    load()
      .catch(function (err) { if (err.auth) showLogin(err.message); else $("stamp").textContent = err.message; })
      .then(function () { b.disabled = false; });
  });

  $("logoutBtn").addEventListener("click", function () {
    if (dlg.open) dlg.close();
    password = "";
    save("");
    stats = null;
    showLogin("");
  });

  // Come back without retyping during the same browser session.
  var remembered = getSaved();
  if (remembered) {
    password = remembered;
    load().catch(function () { password = ""; save(""); showLogin(""); });
  }
})();
