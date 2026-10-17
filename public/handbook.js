// Mentorship Handbook inside the student portal: chapter list, reader and learning-progress bar.
// Progress = chapters marked as read / total chapters, saved on the website (Google Sheet) for the
// signed-in student. portal.js calls setup() once with its sign-in helpers.
(function () {
  var api = null; // { authFetch(url, opts), signedOut(msg) } from portal.js
  var data = null; // { chapters, final, progress }
  var openId = null; // chapter being read, or null for the chapter list
  var mount = null;
  var busy = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function readJson(r) {
    return r.json().then(function (b) {
      if (r.status === 401) { api.signedOut(); throw new Error("signed out"); }
      if (!r.ok) throw new Error(b.error || "Something went wrong. Please try again.");
      return b;
    });
  }

  // ---- Progress bar (also used by the small summary on the ID card page) ----
  function bar(percent) {
    var track = el("div", "pbar");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(percent));
    track.setAttribute("aria-label", "Learning progress");
    var fill = el("span", "pbar-fill");
    fill.style.width = percent + "%";
    track.appendChild(fill);
    return track;
  }

  function sub(p) {
    if (p.count === 0) return "You have not started yet. Open the handbook and read your first chapter.";
    if (p.count === p.total) return "You have read the whole handbook. Well done.";
    return p.count + " of " + p.total + " chapters read";
  }

  // Small summary on the ID card page.
  function renderJourney(p) {
    document.getElementById("journeyPct").textContent = p.percent + "%";
    document.getElementById("journeyFill").style.width = p.percent + "%";
    document.getElementById("journeySub").textContent = sub(p);
  }

  function loadSummary() {
    document.getElementById("journeySub").textContent = "Loading your progress...";
    return api.authFetch("/api/handbook/progress").then(readJson).then(renderJourney).catch(function (e) {
      if (e.message === "signed out") return;
      document.getElementById("journeyPct").textContent = "";
      document.getElementById("journeyFill").style.width = "0%";
      document.getElementById("journeySub").textContent = "Open the Mentorship Handbook to see your progress.";
    });
  }

  // ---- Chapter content ----
  function renderBlock(b) {
    var node, i;
    switch (b.t) {
      case "p": return el("p", "hb-p", b.x);
      case "h": return el("h4", "hb-h", b.x);
      case "quote": return el("blockquote", "hb-quote", b.x);
      case "note": return el("p", "hb-note", b.x);
      case "ul":
      case "ol":
        node = el(b.t, "hb-list");
        for (i = 0; i < b.items.length; i++) node.appendChild(el("li", null, b.items[i]));
        return node;
      case "cards":
        node = el("div", "hb-cards");
        for (i = 0; i < b.items.length; i++) {
          var c = el("div", "hb-card");
          c.appendChild(el("strong", null, b.items[i].h));
          c.appendChild(el("span", null, b.items[i].x));
          node.appendChild(c);
        }
        return node;
      case "table":
        var wrap = el("div", "hb-tablewrap");
        var t = el("table", "hb-table");
        var thead = el("thead"), hr = el("tr");
        b.head.forEach(function (h) { hr.appendChild(el("th", null, h)); });
        thead.appendChild(hr);
        t.appendChild(thead);
        var tb = el("tbody");
        b.rows.forEach(function (r) {
          var tr = el("tr");
          r.forEach(function (cell) { tr.appendChild(el("td", null, cell)); });
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        return wrap;
    }
    return el("span");
  }

  function isRead(id) { return data.progress.read.indexOf(id) !== -1; }

  function openPdf(btn) {
    btn.disabled = true;
    api.authFetch("/api/handbook/pdf-link").then(readJson).then(function (b) {
      window.open(b.url, "_blank", "noopener");
    }).catch(function (e) {
      if (e.message !== "signed out") window.alert(e.message);
    }).then(function () { btn.disabled = false; });
  }

  function pdfButton(label) {
    var b = el("button", "btn ghost wide", label);
    b.type = "button";
    b.addEventListener("click", function () { openPdf(b); });
    return b;
  }

  // ---- Screens ----
  function header(p) {
    var box = el("section", "hb-progress");
    var top = el("div", "hb-progress-top");
    top.appendChild(el("strong", null, "Your learning journey"));
    top.appendChild(el("span", "hb-pct", p.percent + "%"));
    box.appendChild(top);
    box.appendChild(bar(p.percent));
    box.appendChild(el("p", "hb-progress-sub", sub(p)));
    return box;
  }

  function hasVideo(id) { return !!(data.videos && data.videos[id]); }

  // The video tutorial for a chapter (chapters 01-12). Until the editor adds one it says "coming soon".
  function videoBlock(id) {
    if (id === "00") return null;
    var box = el("section", "hb-video");
    box.appendChild(el("h3", null, "Video tutorial"));
    var vid = data.videos && data.videos[id];
    if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid)) {
      box.appendChild(el("p", "hb-video-soon", "The video for this chapter is coming soon. Check back later."));
      return box;
    }
    var frame = el("div", "hb-video-frame");
    var f = document.createElement("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + vid + "?rel=0";
    f.title = "Video tutorial";
    f.loading = "lazy";
    f.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.appendChild(f);
    box.appendChild(frame);
    var a = el("a", "hb-video-link", "Not playing? Watch on YouTube");
    a.href = "https://www.youtube.com/watch?v=" + vid;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    box.appendChild(a);
    return box;
  }

  function renderList() {
    var p = data.progress;
    mount.replaceChildren();
    mount.appendChild(el("h2", null, "Mentorship Handbook"));
    mount.appendChild(el("p", "lead", "The Edge Handbook your quiz comes from. Read each chapter, then mark it as read to move your progress bar."));
    mount.appendChild(header(p));

    var list = el("ol", "hb-chapters");
    data.chapters.forEach(function (c) {
      var li = el("li");
      var a = el("a", "hb-chapter" + (isRead(c.id) ? " is-read" : ""));
      a.href = "#/handbook/" + c.id;
      a.appendChild(el("span", "hb-num", isRead(c.id) ? "✓" : c.id));
      var txt = el("span", "hb-chapter-txt");
      txt.appendChild(el("strong", null, c.title));
      txt.appendChild(el("span", null, (isRead(c.id) ? "Read" : "Not read yet") + (hasVideo(c.id) ? " · Video tutorial" : "")));
      a.appendChild(txt);
      li.appendChild(a);
      list.appendChild(li);
    });
    mount.appendChild(list);

    if (p.count === p.total) {
      var fin = el("section", "hb-final");
      fin.appendChild(el("h3", null, data.final.title));
      data.final.paragraphs.forEach(function (t) { fin.appendChild(el("p", null, t)); });
      var q = el("a", "btn primary wide", "Take the quiz");
      q.href = "#/quiz";
      fin.appendChild(q);
      mount.appendChild(fin);
    }
    var foot = el("div", "hb-foot");
    foot.appendChild(el("p", "hb-foot-note", "The PDF also has the charts and the practice workbook pages."));
    foot.appendChild(pdfButton("Open the full handbook PDF"));
    mount.appendChild(foot);
  }

  function renderChapter(id, keepScroll) {
    var idx = -1;
    data.chapters.forEach(function (c, i) { if (c.id === id) idx = i; });
    if (idx < 0) { location.hash = "#/handbook"; return; }
    var c = data.chapters[idx];
    var p = data.progress;
    mount.replaceChildren();

    var back = el("a", "hb-back", "← All chapters");
    back.href = "#/handbook";
    mount.appendChild(back);

    var mini = el("div", "hb-mini");
    mini.appendChild(el("span", null, "Progress " + p.percent + "%"));
    mini.appendChild(bar(p.percent));
    mount.appendChild(mini);

    var art = el("article", "hb-article");
    art.appendChild(el("p", "hb-kicker", c.id === "00" ? "Introduction" : "Chapter " + c.id));
    art.appendChild(el("h2", null, c.title));
    art.appendChild(el("p", "hb-tagline", c.tagline));
    var vb = videoBlock(c.id);
    if (vb) art.appendChild(vb);
    c.blocks.forEach(function (b) { art.appendChild(renderBlock(b)); });
    mount.appendChild(art);

    var done = isRead(c.id);
    var markBtn = el("button", (done ? "btn ghost wide" : "btn primary wide") + " hb-mark", done ? "✓ Read. Mark as not read" : "Mark this chapter as read");
    markBtn.type = "button";
    var msg = el("p", "hb-msg");
    msg.setAttribute("role", "status");
    markBtn.addEventListener("click", function () { mark(c.id, !isRead(c.id), markBtn, msg); });
    mount.appendChild(markBtn);
    mount.appendChild(msg);

    var nav = el("div", "hb-pager");
    if (idx > 0) {
      var prev = el("a", "btn ghost", "← Previous");
      prev.href = "#/handbook/" + data.chapters[idx - 1].id;
      nav.appendChild(prev);
    } else nav.appendChild(el("span"));
    if (idx < data.chapters.length - 1) {
      var next = el("a", "btn ghost", "Next →");
      next.href = "#/handbook/" + data.chapters[idx + 1].id;
      nav.appendChild(next);
    }
    mount.appendChild(nav);
    mount.appendChild(pdfButton("Open the full handbook PDF"));
    if (!keepScroll) window.scrollTo(0, 0);
  }

  function render() {
    if (!data) return;
    if (openId) renderChapter(openId); else renderList();
  }

  // Save one chapter. The bar moves right away and goes back if the save fails.
  function mark(id, read, btn, msg) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    msg.textContent = "Saving...";
    api.authFetch("/api/handbook/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter: id, read: read }),
    }).then(readJson).then(function (p) {
      data.progress = p;
      renderJourney(p);
      busy = false;
      renderChapter(id, true);
      var again = document.querySelector("#hbMount .hb-mark");
      if (again) again.focus({ preventScroll: true });
      var m = document.querySelector("#hbMount .hb-msg");
      if (m) {
        m.textContent = read
          ? (p.count === p.total ? "Saved. You have read every chapter: 100% complete." : "Saved. Your progress is now " + p.percent + "%.")
          : "Saved. Your progress is now " + p.percent + "%.";
      }
    }).catch(function (e) {
      busy = false;
      if (e.message === "signed out") return;
      btn.disabled = false;
      msg.textContent = e.message || "We could not save that. Please try again.";
    });
  }

  function load() {
    mount.replaceChildren(el("p", "live", "Opening the handbook..."));
    return api.authFetch("/api/handbook").then(readJson).then(function (d) {
      data = d;
      renderJourney(d.progress);
      render();
    }).catch(function (e) {
      if (e.message === "signed out") return;
      var box = el("div");
      box.appendChild(el("p", "quiz-empty", e.message || "We could not open the handbook just now."));
      var retry = el("button", "btn ghost", "Try again");
      retry.type = "button";
      retry.addEventListener("click", load);
      box.appendChild(retry);
      mount.replaceChildren(box);
    });
  }

  window.abecHandbook = {
    setup: function (a) { api = a; mount = document.getElementById("hbMount"); },
    // Called by the portal each time the Handbook view is shown. id is a chapter id or "".
    show: function (id) {
      openId = id || null;
      if (data) render(); else load();
    },
    summary: function () { return loadSummary(); },
    reset: function () { data = null; openId = null; busy = false; if (mount) mount.replaceChildren(); },
  };
})();
