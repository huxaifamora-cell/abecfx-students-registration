// Dashboard > Multi-FX: make and cancel the one-time unlock codes, set each workbook's video and extra link, run the
// Multi-FX live classes, and read the Multi-FX quiz results.
// admin.js calls setup() once with its api helper, open() when the tab opens and clear() on sign-out.
(function () {
  var api = null;    // admin.js: api(path, method, body) -> Promise
  var onAuth = null; // admin.js: showLogin(message)
  var root = null;
  var data = { codes: [], media: null, sections: [], classes: null, report: null };
  var A = "/api/admin/multifx";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function card(title, note) {
    var c = el("article", "adm-card wide");
    c.appendChild(el("h3", null, title));
    if (note) c.appendChild(el("p", "adm-note", note));
    return c;
  }
  function field(label, input, id) {
    var w = el("div", "field");
    var l = el("label", null, label); l.setAttribute("for", id);
    input.id = id;
    var e = el("p", "lk-err"); e.id = id + "-err"; e.setAttribute("role", "alert");
    w.appendChild(l); w.appendChild(input); w.appendChild(e);
    return w;
  }
  function input(type, ph) { var i = el("input"); i.type = type; i.autocomplete = "off"; i.spellcheck = false; if (ph) i.placeholder = ph; return i; }
  function table(heads, rows) {
    var wrap = el("div", "tablewrap"), t = el("table", "adm-table");
    var hr = el("tr"); heads.forEach(function (h) { hr.appendChild(el("th", null, h)); });
    var th = el("thead"); th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      r.forEach(function (c) { var td = el("td"); if (c && c.nodeType) td.appendChild(c); else td.textContent = c == null ? "" : String(c); tr.appendChild(td); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }
  function fail(err, msgEl) {
    if (err && err.auth) { onAuth(err.message); return; }
    msgEl.textContent = (err && err.message) || "Something went wrong.";
  }
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = t; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  }

  // ---------- Codes ----------
  function codesCards() {
    var make = card("Make Multi-FX codes", "Students cannot open Multi-FX until they enter a one-time code. Make codes here and give them out. A code unlocks Multi-FX for one student, on any device, for good. Cancelling a code that was already used takes Multi-FX away from that student.");
    var form = el("form", "lk-form"); form.noValidate = true;
    var count = input("number"); count.min = "1"; count.max = "50"; count.value = "1";
    var forReg = input("text", "ABECFX/26/0001. Leave empty for a code any student can use"); forReg.setAttribute("autocapitalize", "characters");
    form.appendChild(field("How many codes", count, "mfxCount"));
    form.appendChild(field("For one student only (optional)", forReg, "mfxFor"));
    var bar = el("div", "lk-bar"); var go = el("button", "primary", "Make codes"); go.type = "submit"; var msg = el("span", "lk-msg"); msg.setAttribute("role", "status");
    bar.appendChild(go); bar.appendChild(msg); form.appendChild(bar);
    var fresh = el("div", "qc-new"); fresh.hidden = true;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      ["mfxCount", "mfxFor"].forEach(function (k) { document.getElementById(k + "-err").textContent = ""; });
      msg.textContent = "Making..."; go.disabled = true;
      api(A + "/codes", "POST", { count: Number(count.value), forReg: forReg.value }).then(function (r) {
        msg.textContent = "Made " + r.codes.length + (r.codes.length === 1 ? " code." : " codes.");
        fresh.hidden = false; fresh.replaceChildren();
        var head = el("div", "adm-card-head"); head.appendChild(el("h3", null, "New codes"));
        var all = el("button", "btn ghost", "Copy all"); all.type = "button";
        all.addEventListener("click", function () { copy(r.codes.map(function (c) { return c.code; }).join("\n"), all); });
        head.appendChild(all); fresh.appendChild(head);
        var ul = el("ul", "qc-list");
        r.codes.forEach(function (c) { var li = el("li"); li.appendChild(el("code", null, c.code)); ul.appendChild(li); });
        fresh.appendChild(ul);
        return loadCodes();
      }).catch(function (e) {
        if (e.fields) { if (e.fields.count) document.getElementById("mfxCount-err").textContent = e.fields.count; if (e.fields.forReg) document.getElementById("mfxFor-err").textContent = e.fields.forReg; }
        fail(e, msg);
      }).then(function () { go.disabled = false; });
    });
    make.appendChild(form); make.appendChild(fresh);

    var all = card("All Multi-FX codes");
    var tools = el("div", "filters");
    var search = input("search", "Search code, student name or reg number"); search.setAttribute("aria-label", "Search Multi-FX codes");
    var sel = el("select"); sel.setAttribute("aria-label", "Filter by status");
    [["", "Every status"], ["Unused", "Unused"], ["Redeemed", "In use (unlocked)"], ["Revoked", "Cancelled"]].forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; sel.appendChild(op); });
    tools.appendChild(search); tools.appendChild(sel);
    var holder = el("div"); var note = el("p", "adm-note"); note.setAttribute("role", "status");
    all.appendChild(tools); all.appendChild(holder); all.appendChild(note);
    function draw() {
      var q = search.value.trim().toLowerCase();
      var list = data.codes.filter(function (c) {
        return (!sel.value || c.status === sel.value) && (!q || (c.code + " " + c.usedBy + " " + (c.usedByName || "") + " " + c.forReg).toLowerCase().indexOf(q) >= 0);
      });
      holder.replaceChildren(table(["Code", "Status", "Used by", "For", "Made", "Action"], list.map(function (c) {
        var act = "";
        if (c.status !== "Revoked") {
          act = el("button", "btn ghost", "Cancel"); act.type = "button";
          act.addEventListener("click", function () {
            var warn = c.status === "Redeemed" ? "This code was already used by " + (c.usedByName || c.usedBy) + ". Cancelling it takes Multi-FX away from them. Continue?" : "Cancel code " + c.code + "?";
            if (!window.confirm(warn)) return;
            act.disabled = true;
            api(A + "/codes/revoke", "POST", { code: c.code }).then(loadCodes).catch(function (e) { fail(e, note); });
          });
        }
        return [c.code, c.status === "Redeemed" ? "Unlocked" : c.status === "Revoked" ? "Cancelled" : "Unused", c.usedBy ? c.usedBy + (c.usedByName ? " (" + c.usedByName + ")" : "") : "", c.forReg, c.createdAt, act];
      })));
      note.textContent = list.length + " of " + data.codes.length + " codes";
    }
    search.addEventListener("input", draw); sel.addEventListener("change", draw);
    codesCards.draw = draw;
    return [make, all];
  }
  function loadCodes() {
    return api(A + "/codes").then(function (r) { data.codes = r.codes; if (codesCards.draw) codesCards.draw(); });
  }

  // ---------- Workbook media ----------
  function mediaCard() {
    var c = card("Workbook videos and extra links", "Each workbook can show a YouTube video and one extra link (a worksheet, a Google Drive file, an article). Leave a box empty to show \"coming soon\" or hide the link. Links must start with https://");
    var form = el("div", "mfx-media");
    var msg = el("span", "lk-msg"); msg.setAttribute("role", "status");
    var save = el("button", "primary", "Save"); save.type = "button";
    var bar = el("div", "lk-bar"); bar.appendChild(save); bar.appendChild(msg);
    c.appendChild(form); c.appendChild(bar);
    mediaCard.fill = function () {
      form.replaceChildren();
      data.sections.forEach(function (s) {
        var v = data.media[s.id] || {};
        var box = el("fieldset", "mfx-mrow"); box.appendChild(el("legend", null, s.id + ". " + s.title));
        var vid = input("url", "https://youtu.be/..."); vid.value = v.video || "";
        var lt = input("text", "Name of the extra link, e.g. Worksheet"); lt.value = v.linkTitle || ""; lt.maxLength = 80;
        var lk = input("url", "https://..."); lk.value = v.link || "";
        box.appendChild(field("YouTube video", vid, "mfxv-" + s.id));
        box.appendChild(field("Extra link title", lt, "mfxt-" + s.id));
        box.appendChild(field("Extra link", lk, "mfxl-" + s.id));
        form.appendChild(box);
      });
    };
    save.addEventListener("click", function () {
      var body = {};
      data.sections.forEach(function (s) {
        body[s.id] = { video: document.getElementById("mfxv-" + s.id).value, linkTitle: document.getElementById("mfxt-" + s.id).value, link: document.getElementById("mfxl-" + s.id).value };
        ["v", "t", "l"].forEach(function (k) { document.getElementById("mfx" + k + "-" + s.id + "-err").textContent = ""; });
      });
      msg.textContent = "Saving..."; save.disabled = true;
      api(A + "/media", "PUT", body).then(function (r) {
        data.media = r.values; msg.textContent = "Saved. Students see the changes within about 30 seconds.";
      }).catch(function (e) {
        if (e.fields) {
          Object.keys(e.fields).forEach(function (id) {
            if (e.fields[id].video) document.getElementById("mfxv-" + id + "-err").textContent = e.fields[id].video;
            if (e.fields[id].link) document.getElementById("mfxl-" + id + "-err").textContent = e.fields[id].link;
          });
        }
        fail(e, msg);
      }).then(function () { save.disabled = false; });
    });
    return c;
  }
  function loadMedia() {
    return api(A + "/media").then(function (r) { data.sections = r.sections; data.media = r.values; if (mediaCard.fill) mediaCard.fill(); });
  }

  // ---------- Live class ----------
  function classCards() {
    var c = card("Multi-FX live class", "Start the class when your Google Meet begins and end it when it finishes. Only students who have unlocked Multi-FX see it. A student is marked present when they were there for at least half of the class. This is separate from the main course's classes.");
    var liveBox = el("div"); var form = el("form", "lk-form"); form.noValidate = true;
    var title = input("text", "Multi-FX week 1: Market structure"); title.maxLength = 100;
    var link = input("url", "https://meet.google.com/abc-defg-hij");
    form.appendChild(field("Class name", title, "mfxClsTitle")); form.appendChild(field("Google Meet link", link, "mfxClsLink"));
    var bar = el("div", "lk-bar"); var go = el("button", "primary", "Start class"); go.type = "submit"; var msg = el("span", "lk-msg"); msg.setAttribute("role", "status");
    bar.appendChild(go); bar.appendChild(msg); form.appendChild(bar);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      ["mfxClsTitle", "mfxClsLink"].forEach(function (k) { document.getElementById(k + "-err").textContent = ""; });
      msg.textContent = "Starting..."; go.disabled = true;
      api(A + "/attendance/start", "POST", { title: title.value, link: link.value }).then(function () { title.value = ""; link.value = ""; msg.textContent = ""; return loadClasses(); })
        .catch(function (e) {
          if (e.fields) { if (e.fields.title) document.getElementById("mfxClsTitle-err").textContent = e.fields.title; if (e.fields.link) document.getElementById("mfxClsLink-err").textContent = e.fields.link; }
          fail(e, msg);
        }).then(function () { go.disabled = false; });
    });
    c.appendChild(liveBox); c.appendChild(form);

    var list = card("Multi-FX classes"); var holder = el("div"); var note = el("p", "adm-note"); note.setAttribute("role", "status");
    list.appendChild(holder); list.appendChild(note);
    var rep = card("Attendance"); rep.hidden = true; var repHolder = el("div"); var repNote = el("p", "adm-note"); rep.appendChild(repHolder); rep.appendChild(repNote);

    classCards.draw = function () {
      var d = data.classes; if (!d) return;
      var live = d.classes.filter(function (x) { return x.live; })[0];
      liveBox.replaceChildren();
      if (live) {
        liveBox.appendChild(el("p", "adm-note", live.title + " is live. Started " + live.startedAt + "."));
        var end = el("button", "primary", "End class"); end.type = "button";
        end.addEventListener("click", function () { end.disabled = true; api(A + "/attendance/end", "POST", {}).then(loadClasses).catch(function (e) { fail(e, note); }); });
        liveBox.appendChild(end);
      }
      go.disabled = !!live;
      holder.replaceChildren(table(["Class", "Started", "Status", "Joined", "Present", ""], d.classes.map(function (x) {
        var b = el("button", "btn ghost", "Attendance"); b.type = "button";
        b.addEventListener("click", function () {
          api(A + "/attendance/report?id=" + encodeURIComponent(x.id)).then(function (r) {
            rep.hidden = false;
            repHolder.replaceChildren(table(["Reg number", "Name", "Minutes", "Percent", "Result"], r.people.map(function (p) { return [p.reg, p.name, p.minutes, p.percent + "%", p.present ? "Present" : "Absent"]; })));
            repNote.textContent = x.title + ": " + r.people.filter(function (p) { return p.present; }).length + " present, needing " + r.threshold + "% of the class.";
          }).catch(function (e) { fail(e, note); });
        });
        return [x.title, x.startedAt, x.live ? "Live now" : "Ended", x.joined, x.present, b];
      })));
      note.textContent = d.classes.length ? "" : "No Multi-FX classes yet.";
    };
    return [c, list, rep];
  }
  function loadClasses() { return api(A + "/attendance").then(function (r) { data.classes = r; if (classCards.draw) classCards.draw(); }); }

  // ---------- Quiz results ----------
  function quizCard() {
    var c = card("Multi-FX quiz results", "Every attempt, newest first (the latest 1000).");
    var holder = el("div"); var note = el("p", "adm-note"); c.appendChild(holder); c.appendChild(note);
    quizCard.draw = function (r) {
      holder.replaceChildren(table(["Reg number", "Name", "Score", "Percent", "Grade", "Attempt", "Date"], r.results.map(function (x) { return [x.reg, x.name, x.score + " / " + x.total, x.pct + "%", x.grade, x.attempt, x.at]; })));
      note.textContent = r.total + (r.total === 1 ? " attempt" : " attempts") + " in total.";
    };
    return c;
  }
  function loadQuiz() { return api(A + "/quiz-results").then(function (r) { quizCard.draw(r); }); }

  function build() {
    root.replaceChildren();
    codesCards().forEach(function (x) { root.appendChild(x); });
    root.appendChild(mediaCard());
    classCards().forEach(function (x) { root.appendChild(x); });
    root.appendChild(quizCard());
  }

  window.abecAdminMultifx = {
    setup: function (a) { api = a.api; onAuth = a.onAuth; root = document.getElementById("view-multifx"); },
    open: function () {
      build();
      Promise.all([loadCodes(), loadMedia(), loadClasses(), loadQuiz()]).catch(function (e) {
        if (e && e.auth) onAuth(e.message);
        else { var p = el("p", "adm-note", (e && e.message) || "Could not load Multi-FX."); root.insertBefore(p, root.firstChild); }
      });
    },
    clear: function () { data = { codes: [], media: null, sections: [], classes: null, report: null }; if (root) root.replaceChildren(); },
  };
})();
