// Multi-FX inside the student portal: a supplementary course unlocked with a one-time code.
// Locked: a box to enter the code. Unlocked: Handbook, Workbook, Community, Live class and Quiz as tabs.
// Addresses: #/multifx, #/multifx/handbook, #/multifx/handbook/08, #/multifx/workbook/03, #/multifx/community, #/multifx/class, #/multifx/quiz.
// portal.js calls setup() once with its sign-in helpers and show(tab, id) whenever the route is Multi-FX.
(function () {
  var api = null; // { authFetch(url, opts), signedOut(msg) }
  var mount = null;
  var P = "/api/portal/multifx";
  var state = { unlocked: null, progress: null };
  var cache = {}; // handbook / workbook data
  var cur = { tab: "", id: "" };
  var cls = { id: "", link: "", win: null, timer: null };
  var TABS = [["handbook", "Handbook"], ["workbook", "Workbook"], ["community", "Community"], ["class", "Live class"], ["quiz", "Quiz"]];
  var busy = false;

  function el(tag, cls2, text) {
    var e = document.createElement(tag);
    if (cls2) e.className = cls2;
    if (text != null) e.textContent = text;
    return e;
  }
  function readJson(r) {
    return r.json().catch(function () { return {}; }).then(function (b) {
      if (r.status === 401) { api.signedOut(); throw new Error("signed out"); }
      if (r.status === 403 && b.locked) { state.unlocked = false; cache = {}; var e = new Error(b.error || "Multi-FX is locked."); e.locked = true; throw e; }
      if (!r.ok) { var er = new Error(b.error || "Something went wrong. Please try again."); er.fields = b.errors; throw er; }
      return b;
    });
  }
  function get(path) { return api.authFetch(P + path).then(readJson); }
  function post(path, body) {
    return api.authFetch(P + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(readJson);
  }
  function failBox(e, retry) {
    var box = el("div");
    box.appendChild(el("p", "quiz-empty", e.message || "Something went wrong."));
    if (retry) { var b = el("button", "btn ghost", "Try again"); b.type = "button"; b.addEventListener("click", retry); box.appendChild(b); }
    return box;
  }
  function pct(p) { return p ? p.percent : 0; }

  // ---------- Locked ----------
  function renderLocked(note) {
    stopBeat();
    mount.replaceChildren();
    mount.appendChild(el("h2", null, "Multi-FX"));
    mount.appendChild(el("p", "lead", "A supplementary course on Volatility Indices and the Smart Money Concept, with its own handbook, workbook, community, live classes and quiz."));
    var card = el("section", "quizcard quizgate");
    card.appendChild(el("h3", null, "Unlock Multi-FX"));
    card.appendChild(el("p", "quizgate-note", note || "Multi-FX is locked. Enter the one-time code you received from your mentor or ABEC-FX."));
    var form = el("form"); form.noValidate = true;
    var f = el("div", "field");
    var lab = el("label", null, "Multi-FX code"); lab.setAttribute("for", "mfxCode");
    var inp = el("input"); inp.id = "mfxCode"; inp.type = "text"; inp.autocomplete = "off"; inp.setAttribute("autocapitalize", "characters"); inp.spellcheck = false; inp.maxLength = 24; inp.placeholder = "MF-XXXX-XXXX";
    f.appendChild(lab); f.appendChild(inp);
    var err = el("p", "formErr"); err.setAttribute("role", "alert");
    var btn = el("button", "primary", "Unlock Multi-FX"); btn.type = "submit";
    form.appendChild(f); form.appendChild(err); form.appendChild(btn);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      err.textContent = "";
      if (!inp.value.trim()) { err.textContent = "Enter your Multi-FX code."; return; }
      btn.disabled = true;
      post("/unlock", { code: inp.value }).then(function () {
        state.unlocked = null; cache = {};
        load();
      }).catch(function (e) {
        btn.disabled = false;
        if (e.message !== "signed out") err.textContent = e.message;
      });
    });
    card.appendChild(form);
    card.appendChild(el("p", "quizgate-foot", "A code works once and unlocks Multi-FX on your account for good, on any device."));
    mount.appendChild(card);
  }

  // ---------- Frame (header + tabs) ----------
  var body = null;
  function frame() {
    mount.replaceChildren();
    mount.appendChild(el("h2", null, "Multi-FX"));
    mount.appendChild(el("p", "lead", "Volatility Indices and the Smart Money Concept. Study the handbook, do the workbook, join the live classes and test yourself with the quiz."));
    var prog = el("section", "hb-progress");
    var top = el("div", "hb-progress-top");
    top.appendChild(el("strong", null, "Your Multi-FX progress"));
    var pc = el("span", "hb-pct", pct(state.progress) + "%"); pc.id = "mfxPct";
    top.appendChild(pc);
    prog.appendChild(top);
    var track = window.abecHandbook.bar(pct(state.progress)); track.id = "mfxBar";
    prog.appendChild(track);
    mount.appendChild(prog);
    var tabs = el("nav", "sig-tabs mfx-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Multi-FX sections");
    TABS.forEach(function (t) {
      var a = el("a", "mfx-tab", t[1]);
      a.href = "#/multifx/" + t[0];
      a.setAttribute("role", "tab");
      a.setAttribute("aria-selected", t[0] === cur.tab ? "true" : "false");
      tabs.appendChild(a);
    });
    mount.appendChild(tabs);
    body = el("div", "mfx-body");
    mount.appendChild(body);
  }
  function refreshProgress(p) {
    state.progress = p;
    var a = document.getElementById("mfxPct"), b = document.getElementById("mfxBar");
    if (a) a.textContent = pct(p) + "%";
    if (b) { b.setAttribute("aria-valuenow", String(pct(p))); b.firstChild.style.width = pct(p) + "%"; }
  }

  // ---------- Handbook ----------
  function openPdf(btn, page) {
    btn.disabled = true;
    get("/pdf-link").then(function (b) { window.open(b.url + (page ? "#page=" + page : ""), "_blank", "noopener"); })
      .catch(function (e) { if (e.message === "signed out") return; if (e.locked) { load(); return; } window.alert(e.message); })
      .then(function () { btn.disabled = false; });
  }
  function pdfButton(label, page) {
    var b = el("button", "btn ghost wide", label); b.type = "button";
    b.addEventListener("click", function () { openPdf(b, page); });
    return b;
  }
  function isRead(id) { return cache.handbook.progress.handbook.ids.indexOf(id) !== -1; }
  function pagesText(s) { return s.pdf[0] === s.pdf[1] ? "page " + s.pdf[0] : "pages " + s.pdf[0] + " to " + s.pdf[1]; }

  function renderHandbook() {
    var d = cache.handbook;
    body.replaceChildren();
    if (cur.id) return renderSection(cur.id);
    var h = d.progress.handbook;
    body.appendChild(el("p", "hb-progress-sub", h.count === h.total ? "You have read the whole handbook. Well done." : h.count + " of " + h.total + " sections read"));
    var list = el("ol", "hb-chapters");
    d.sections.forEach(function (s) {
      var li = el("li");
      var a = el("a", "hb-chapter" + (isRead(s.id) ? " is-read" : ""));
      a.href = "#/multifx/handbook/" + s.id;
      a.appendChild(el("span", "hb-num", isRead(s.id) ? "✓" : s.id));
      var t = el("span", "hb-chapter-txt");
      t.appendChild(el("strong", null, s.title));
      t.appendChild(el("span", null, (isRead(s.id) ? "Read" : "Not read yet") + " · PDF " + pagesText(s)));
      a.appendChild(t); li.appendChild(a); list.appendChild(li);
    });
    body.appendChild(list);
    if (h.count === h.total) {
      var fin = el("section", "hb-final");
      fin.appendChild(el("h3", null, d.final.title));
      d.final.paragraphs.forEach(function (t) { fin.appendChild(el("p", null, t)); });
      var q = el("a", "btn primary wide", "Take the quiz"); q.href = "#/multifx/quiz"; fin.appendChild(q);
      body.appendChild(fin);
    }
    var foot = el("div", "hb-foot");
    foot.appendChild(el("p", "hb-foot-note", "The PDF has the candlestick drawings and the annotated chart examples."));
    foot.appendChild(pdfButton("Open the full handbook PDF"));
    body.appendChild(foot);
  }

  function renderSection(id) {
    var d = cache.handbook;
    var idx = -1;
    d.sections.forEach(function (s, i) { if (s.id === id) idx = i; });
    if (idx < 0) { location.hash = "#/multifx/handbook"; return; }
    var s = d.sections[idx];
    body.replaceChildren();
    var back = el("a", "hb-back", "← All sections"); back.href = "#/multifx/handbook"; body.appendChild(back);
    var art = el("article", "hb-article");
    art.appendChild(el("p", "hb-kicker", s.id === "00" ? "Introduction" : "Section " + s.id));
    art.appendChild(el("h2", null, s.title));
    art.appendChild(el("p", "hb-tagline", s.tagline));
    s.blocks.forEach(function (b) { art.appendChild(window.abecHandbook.renderBlock(b)); });
    body.appendChild(art);
    var done = isRead(s.id);
    var mark = el("button", (done ? "btn ghost wide" : "btn primary wide") + " hb-mark", done ? "✓ Read. Mark as not read" : "Mark this section as read");
    mark.type = "button";
    var msg = el("p", "hb-msg"); msg.setAttribute("role", "status");
    mark.addEventListener("click", function () { save("handbook", s.id, !isRead(s.id), mark, msg); });
    body.appendChild(mark); body.appendChild(msg);
    var nav = el("div", "hb-pager");
    if (idx > 0) { var pv = el("a", "btn ghost", "← Previous"); pv.href = "#/multifx/handbook/" + d.sections[idx - 1].id; nav.appendChild(pv); } else nav.appendChild(el("span"));
    if (idx < d.sections.length - 1) { var nx = el("a", "btn ghost", "Next →"); nx.href = "#/multifx/handbook/" + d.sections[idx + 1].id; nav.appendChild(nx); }
    body.appendChild(nav);
    body.appendChild(pdfButton("See this section in the PDF (" + pagesText(s) + ")", s.pdf[0]));
    window.scrollTo(0, 0);
  }

  function save(kind, id, on, btn, msg) {
    if (busy) return;
    busy = true; btn.disabled = true; msg.textContent = "Saving...";
    post("/progress", { kind: kind, id: id, done: on }).then(function (p) {
      busy = false;
      var c = kind === "handbook" ? cache.handbook : cache.workbook;
      c.progress = p;
      if (cache.handbook) cache.handbook.progress = p;
      if (cache.workbook) cache.workbook.progress = p;
      refreshProgress(p);
      if (kind === "handbook") renderSection(id); else renderWorkbookItem(id);
      var m = body.querySelector(".hb-msg");
      if (m) m.textContent = "Saved. Your Multi-FX progress is now " + p.percent + "%.";
      var again = body.querySelector(".hb-mark"); if (again) again.focus({ preventScroll: true });
    }).catch(function (e) {
      busy = false;
      if (e.message === "signed out") return;
      if (e.locked) { load(); return; }
      btn.disabled = false; msg.textContent = e.message;
    });
  }

  // ---------- Workbook ----------
  function wbDone(id) { return cache.workbook.progress.workbook.ids.indexOf(id) !== -1; }
  function renderWorkbook() {
    var d = cache.workbook;
    body.replaceChildren();
    if (cur.id) return renderWorkbookItem(cur.id);
    body.appendChild(el("p", "lead", "A workbook for every handbook section: the key terms, a self-check with answers, practical tasks, and a video where your mentor has added one."));
    var list = el("ol", "wb-list");
    d.items.forEach(function (w) {
      var li = el("li", "wb-row");
      li.appendChild(el("span", "hb-num", wbDone(w.id) ? "✓" : w.id));
      var t = el("span", "hb-chapter-txt");
      t.appendChild(el("strong", null, w.title));
      t.appendChild(el("span", null, (wbDone(w.id) ? "Done" : "Not done yet") + (w.video ? " · Video" : "") + (w.resource ? " · Extra material" : "")));
      li.appendChild(t);
      var a = el("a", "btn ghost", wbDone(w.id) ? "Open again" : "Open"); a.href = "#/multifx/workbook/" + w.id;
      li.appendChild(a); list.appendChild(li);
    });
    body.appendChild(list);
  }
  function renderWorkbookItem(id) {
    var d = cache.workbook;
    var idx = -1;
    d.items.forEach(function (w, i) { if (w.id === id) idx = i; });
    if (idx < 0) { location.hash = "#/multifx/workbook"; return; }
    var w = d.items[idx];
    body.replaceChildren();
    var back = el("a", "hb-back", "← All workbooks"); back.href = "#/multifx/workbook"; body.appendChild(back);
    var art = el("article", "hb-article");
    art.appendChild(el("p", "hb-kicker", "Workbook " + w.id));
    art.appendChild(el("h2", null, w.title));
    art.appendChild(el("p", "hb-tagline", "Goal: " + w.goal));

    var vbox = el("section", "hb-video");
    vbox.appendChild(el("h3", null, "Video"));
    if (w.video && /^[A-Za-z0-9_-]{11}$/.test(w.video)) {
      var fr = el("div", "hb-video-frame");
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + w.video + "?rel=0";
      f.title = "Workbook video: " + w.title; f.loading = "lazy";
      f.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      f.setAttribute("allowfullscreen", ""); f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      fr.appendChild(f); vbox.appendChild(fr);
      var yl = el("a", "hb-video-link", "Not playing? Watch on YouTube");
      yl.href = "https://www.youtube.com/watch?v=" + w.video; yl.target = "_blank"; yl.rel = "noopener noreferrer";
      vbox.appendChild(yl);
    } else vbox.appendChild(el("p", "hb-video-soon", "The video for this workbook is coming soon. Check back later."));
    art.appendChild(vbox);
    if (w.resource && /^https:\/\//.test(w.resource.url)) {
      var ex = el("a", "btn ghost wide", w.resource.title); ex.href = w.resource.url; ex.target = "_blank"; ex.rel = "noopener noreferrer";
      art.appendChild(ex);
    }

    art.appendChild(el("h4", "hb-h", "Key terms"));
    var wrap = el("div", "hb-tablewrap"); var tb = el("table", "hb-table");
    var tbody = el("tbody");
    w.terms.forEach(function (t) { var tr = el("tr"); tr.appendChild(el("th", null, t[0])); tr.appendChild(el("td", null, t[1])); tbody.appendChild(tr); });
    tb.appendChild(tbody); wrap.appendChild(tb); art.appendChild(wrap);

    art.appendChild(el("h4", "hb-h", "Self-check"));
    art.appendChild(el("p", "hb-p", "Answer each question in your head or on paper, then open it to check."));
    w.check.forEach(function (c, i) {
      var det = el("details", "mfx-check");
      det.appendChild(el("summary", null, (i + 1) + ". " + c[0]));
      det.appendChild(el("p", "mfx-answer", c[1]));
      art.appendChild(det);
    });

    art.appendChild(el("h4", "hb-h", "Practical tasks"));
    var ul = el("ul", "hb-list"); w.tasks.forEach(function (t) { ul.appendChild(el("li", null, t)); }); art.appendChild(ul);
    body.appendChild(art);

    var done = wbDone(w.id);
    var mark = el("button", (done ? "btn ghost wide" : "btn primary wide") + " hb-mark", done ? "✓ Done. Mark as not done" : "Mark this workbook as done");
    mark.type = "button";
    var msg = el("p", "hb-msg"); msg.setAttribute("role", "status");
    mark.addEventListener("click", function () { save("workbook", w.id, !wbDone(w.id), mark, msg); });
    body.appendChild(mark); body.appendChild(msg);
    var nav = el("div", "hb-pager");
    if (idx > 0) { var pv = el("a", "btn ghost", "← Previous"); pv.href = "#/multifx/workbook/" + d.items[idx - 1].id; nav.appendChild(pv); } else nav.appendChild(el("span"));
    if (idx < d.items.length - 1) { var nx = el("a", "btn ghost", "Next →"); nx.href = "#/multifx/workbook/" + d.items[idx + 1].id; nav.appendChild(nx); }
    body.appendChild(nav);
    window.scrollTo(0, 0);
  }

  // ---------- Community ----------
  function renderCommunity(d) {
    body.replaceChildren();
    body.appendChild(el("p", "lead", "Join the Multi-FX community to learn alongside other students and get updates from your mentors."));
    var card = el("section", "quizcard communitycard");
    var any = false;
    [["whatsapp", "Open WhatsApp community", "btn primary wide"], ["telegram", "Open Telegram community", "btn ghost wide"]].forEach(function (x) {
      if (d[x[0]] && /^https:\/\//.test(d[x[0]])) {
        var a = el("a", x[2], x[1]); a.href = d[x[0]]; a.target = "_blank"; a.rel = "noopener noreferrer"; card.appendChild(a); any = true;
      }
    });
    if (!any) card.appendChild(el("p", "live", "The Multi-FX community link is coming soon."));
    body.appendChild(card);
  }

  // ---------- Live class ----------
  function stopBeat() { if (cls.timer) { clearInterval(cls.timer); cls.timer = null; } }
  function status(text) { var s = document.getElementById("mfxClsStatus"); if (s) s.textContent = text || ""; }
  function beat() {
    if (!cls.win || cls.win.closed) { stopBeat(); status("Your Meet window is closed, so your time is not being counted. Press Join to go back in."); return; }
    post("/class/heartbeat", { classId: cls.id }).then(function (b) {
      if (!b.live) { stopBeat(); status("This class has ended. Thank you for joining."); renderClass(true); return; }
      status("You are being counted: " + b.minutes + (b.minutes === 1 ? " minute" : " minutes") + " so far.");
    }).catch(function (e) { if (e.locked) { stopBeat(); load(); } /* a missed beat is fine */ });
  }
  function renderClass(keep) {
    if (!keep) { body.replaceChildren(el("p", "live", "Loading...")); }
    get("/class").then(function (b) {
      if (cur.tab !== "class") return;
      body.replaceChildren();
      body.appendChild(el("p", "lead", "Join your Multi-FX class on Google Meet from here. You are marked present when you are in the class for at least " + b.threshold + "% of it."));
      var card = el("section", "quizcard");
      if (b.live) {
        cls.id = b.live.id; cls.link = b.live.link;
        card.appendChild(el("h3", null, b.live.title));
        var j = el("button", "btn primary wide", "Join class on Google Meet"); j.type = "button";
        j.addEventListener("click", function () {
          cls.win = window.open(cls.link, "abecfxMfxMeet");
          if (!cls.win) { status("Your browser blocked the Meet window. Allow pop-ups for this site, then press Join again."); return; }
          stopBeat(); status("Joining..."); beat(); cls.timer = setInterval(beat, 30000);
        });
        card.appendChild(j);
        var st = el("p", "live"); st.id = "mfxClsStatus"; st.setAttribute("role", "status"); card.appendChild(st);
        card.appendChild(el("p", "cert-note", "Keep this page open in your browser while you are in class. Your time is counted while the Meet window stays open."));
      } else {
        stopBeat();
        card.appendChild(el("p", "live", "No Multi-FX class is live right now. When your mentor starts one, it will appear here."));
      }
      body.appendChild(card);
      body.appendChild(el("h3", "cls-h", "Your attendance"));
      var wrap = el("div", "hb-tablewrap"); var t = el("table", "cls-table");
      if (!b.history.length) t.appendChild(el("caption", null, "No classes yet."));
      else {
        var head = t.createTHead().insertRow();
        ["Class", "Date", "Time in class", "Result"].forEach(function (h) { head.appendChild(el("th", null, h)); });
        var tbody = t.createTBody();
        b.history.forEach(function (c) {
          var row = tbody.insertRow();
          [c.title, (c.startedAt || "").split(",")[0], c.minutes + " of " + c.lengthMinutes + " min (" + c.percent + "%)", c.live ? "Live now" : c.present ? "Present" : "Absent"].forEach(function (v) { row.insertCell().textContent = v; });
        });
      }
      wrap.appendChild(t); body.appendChild(wrap);
    }).catch(function (e) { if (e.message === "signed out") return; if (e.locked) { load(); return; } body.replaceChildren(failBox(e, function () { renderClass(); })); });
  }

  // ---------- Quiz ----------
  function renderQuiz() {
    body.replaceChildren(el("p", "live", "Loading..."));
    get("/quiz").then(function (d) {
      if (cur.tab !== "quiz") return;
      body.replaceChildren();
      body.appendChild(el("p", "lead", "Test what you have learned. Each attempt asks " + d.perAttempt + " questions picked at random from a bank of " + d.bank + ". You can take it as often as you like."));
      var card = el("section", "quizcard");
      card.appendChild(el("h3", null, "Quiz results"));
      if (!d.attempts.length) card.appendChild(el("p", "quiz-empty", "You have not taken the Multi-FX quiz yet."));
      else {
        card.appendChild(el("p", "hb-p", "Best: " + d.best.score + " / " + d.best.total + " (" + d.best.pct + "%, grade " + d.best.grade + "). Latest: " + d.latest.score + " / " + d.latest.total + " (grade " + d.latest.grade + ")."));
        var wrap = el("div", "hb-tablewrap"); var t = el("table", "cls-table");
        var head = t.createTHead().insertRow();
        ["Attempt", "Date", "Score", "Grade"].forEach(function (h) { head.appendChild(el("th", null, h)); });
        var tb = t.createTBody();
        d.attempts.slice(0, 10).forEach(function (a) {
          var row = tb.insertRow();
          [String(a.attempt), (a.at || "").split(",")[0], a.score + " / " + a.total + " (" + a.pct + "%)", a.grade].forEach(function (v) { row.insertCell().textContent = v; });
        });
        wrap.appendChild(t); card.appendChild(wrap);
      }
      var go = el("button", "btn primary wide", d.attempts.length ? "Take the quiz again" : "Start the quiz"); go.type = "button";
      go.addEventListener("click", function () { startQuiz(go); });
      card.appendChild(go);
      body.appendChild(card);
    }).catch(function (e) { if (e.message === "signed out") return; if (e.locked) { load(); return; } body.replaceChildren(failBox(e, renderQuiz)); });
  }

  function startQuiz(btn) {
    btn.disabled = true;
    post("/quiz/start").then(function (a) {
      if (cur.tab !== "quiz") return;
      runQuiz(a);
    }).catch(function (e) { btn.disabled = false; if (e.message === "signed out") return; if (e.locked) { load(); return; } window.alert(e.message); });
  }

  function runQuiz(a) {
    body.replaceChildren();
    var answers = a.questions.map(function () { return null; });
    var form = el("form", "mfx-quiz"); form.noValidate = true;
    form.appendChild(el("h3", null, "Multi-FX quiz"));
    var count = el("p", "hb-progress-sub"); count.setAttribute("role", "status");
    form.appendChild(count);
    function updateCount() {
      var n = answers.filter(function (x) { return x !== null; }).length;
      count.textContent = n + " of " + a.total + " answered";
    }
    a.questions.forEach(function (q, i) {
      var fs = el("fieldset", "mfx-q");
      fs.appendChild(el("legend", null, (i + 1) + ". " + q.q));
      q.options.forEach(function (o, j) {
        var lab = el("label", "mfx-opt");
        var r = document.createElement("input"); r.type = "radio"; r.name = "mq" + i; r.value = String(j);
        r.addEventListener("change", function () { answers[i] = j; updateCount(); });
        lab.appendChild(r); lab.appendChild(el("span", null, o));
        fs.appendChild(lab);
      });
      form.appendChild(fs);
    });
    updateCount();
    var err = el("p", "formErr"); err.setAttribute("role", "alert");
    var sub = el("button", "btn primary wide", "Submit answers"); sub.type = "submit";
    form.appendChild(err); form.appendChild(sub);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var left = answers.filter(function (x) { return x === null; }).length;
      if (left && !window.confirm(left + " question" + (left === 1 ? " is" : "s are") + " not answered and will count as wrong. Submit anyway?")) return;
      sub.disabled = true; err.textContent = "";
      post("/quiz/submit", { token: a.token, answers: answers }).then(showResult).catch(function (e) {
        sub.disabled = false;
        if (e.message === "signed out") return;
        if (e.locked) { load(); return; }
        err.textContent = e.message;
      });
    });
    body.appendChild(form);
    window.scrollTo(0, 0);
  }

  var SECTION_NAMES = {};
  function showResult(r) {
    body.replaceChildren();
    var card = el("section", "quizcard");
    card.appendChild(el("h3", null, "Your result"));
    card.appendChild(el("p", "hb-p", r.score + " / " + r.total + " (" + r.pct + "%). Grade " + r.grade + (r.label ? ": " + r.label : "") + ". This was attempt " + r.attempt + "."));
    var secs = Object.keys(r.breakdown).sort();
    if (secs.length) {
      var ul = el("ul", "hb-list");
      secs.forEach(function (s) { ul.appendChild(el("li", null, (SECTION_NAMES[s] || "Section " + s) + ": " + r.breakdown[s][0] + " of " + r.breakdown[s][1] + " right")); });
      card.appendChild(ul);
    }
    var again = el("button", "btn primary wide", "Take the quiz again"); again.type = "button";
    again.addEventListener("click", renderQuiz);
    card.appendChild(again);
    body.appendChild(card);
    body.appendChild(el("h3", "cls-h", "Review your answers"));
    r.review.forEach(function (q, i) {
      var box = el("section", "mfx-review " + (q.right ? "is-right" : "is-wrong"));
      box.appendChild(el("p", "mfx-rq", (i + 1) + ". " + q.q));
      box.appendChild(el("p", null, (q.right ? "✓ Correct: " : "✗ Your answer: ") + (q.chosen === null ? "(no answer)" : q.options[q.chosen])));
      if (!q.right) box.appendChild(el("p", null, "Correct answer: " + q.options[q.correct]));
      box.appendChild(el("p", "mfx-why", q.why));
      body.appendChild(box);
    });
    window.scrollTo(0, 0);
  }

  // ---------- Entry points ----------
  function showTab() {
    stopBeatIfLeaving();
    if (!cur.tab) { location.replace("#/multifx/handbook"); return; }
    frame();
    var t = cur.tab;
    if (t === "handbook" || t === "workbook") {
      var want = t;
      if (cache[want]) { want === "handbook" ? renderHandbook() : renderWorkbook(); return; }
      body.appendChild(el("p", "live", "Opening..."));
      get(want === "handbook" ? "/handbook" : "/workbook").then(function (d) {
        cache[want] = d; refreshProgress(d.progress);
        if (want === "handbook") d.sections.forEach(function (s) { SECTION_NAMES[s.id] = s.title; });
        if (cur.tab === want) { frame(); want === "handbook" ? renderHandbook() : renderWorkbook(); }
      }).catch(function (e) { if (e.message === "signed out") return; if (e.locked) { load(); return; } body.replaceChildren(failBox(e, showTab)); });
    } else if (t === "community") {
      body.appendChild(el("p", "live", "Loading..."));
      get("/community").then(renderCommunity).catch(function (e) { if (e.message === "signed out") return; if (e.locked) { load(); return; } body.replaceChildren(failBox(e, showTab)); });
    } else if (t === "class") renderClass();
    else if (t === "quiz") { ensureNames(); renderQuiz(); }
  }
  function ensureNames() {
    if (Object.keys(SECTION_NAMES).length) return;
    get("/handbook").then(function (d) { d.sections.forEach(function (s) { SECTION_NAMES[s.id] = s.title; }); }).catch(function () {});
  }
  function stopBeatIfLeaving() { if (cur.tab !== "class") stopBeat(); }

  function load() {
    mount.replaceChildren(el("p", "live", "Opening Multi-FX..."));
    return get("").then(function (d) {
      state.unlocked = d.unlocked; state.progress = d.progress || null;
      if (!d.unlocked) { renderLocked(); return; }
      showTab();
    }).catch(function (e) {
      if (e.message === "signed out") return;
      if (e.locked) { renderLocked(e.message); return; }
      mount.replaceChildren(failBox(e, load));
    });
  }

  window.abecMultifx = {
    setup: function (a) { api = a; mount = document.getElementById("mfxMount"); },
    // Called by the portal each time the route is Multi-FX. tab: handbook|workbook|community|class|quiz or "". id: a section id or "".
    show: function (tab, id) {
      var was = cur.tab;
      cur = { tab: tab || "", id: id || "" };
      if (state.unlocked === true) { if (cur.tab) showTab(); else location.replace("#/multifx/handbook"); }
      else if (state.unlocked === false && was !== undefined && mount.querySelector("#mfxCode")) { /* the code box is already showing */ }
      else load();
    },
    stop: function () { stopBeat(); },
    reset: function () { stopBeat(); state = { unlocked: null, progress: null }; cache = {}; cur = { tab: "", id: "" }; if (mount) mount.replaceChildren(); },
  };
})();
