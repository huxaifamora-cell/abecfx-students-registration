// Workbook page inside the student portal: one Word workbook per handbook chapter.
// Each download asks the website for a short-lived signed link, like the handbook PDF.
(function () {
  var api = null; // { authFetch(url, opts), signedOut(msg) } from portal.js
  var mount = null;
  var items = null;

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

  function download(id, btn) {
    btn.disabled = true;
    api.authFetch("/api/workbooks/link?id=" + encodeURIComponent(id)).then(readJson).then(function (b) {
      window.location.href = b.url;
    }).catch(function (e) {
      if (e.message !== "signed out") window.alert(e.message);
    }).then(function () { setTimeout(function () { btn.disabled = false; }, 1500); });
  }

  function render() {
    mount.replaceChildren();
    mount.appendChild(el("h2", null, "Workbook"));
    mount.appendChild(el("p", "lead", "A practice workbook for every handbook chapter: study notes, key terms, a concept check, practical tasks, scenario tests and an answer key. Download it, print it or fill it in on your computer."));
    var list = el("ol", "wb-list");
    items.forEach(function (c) {
      var li = el("li", "wb-row");
      li.appendChild(el("span", "hb-num", c.id));
      var txt = el("span", "hb-chapter-txt");
      txt.appendChild(el("strong", null, c.title));
      txt.appendChild(el("span", null, c.id === "00" ? "Introduction workbook (Word file)" : "Chapter " + c.id + " workbook (Word file)"));
      li.appendChild(txt);
      if (c.available) {
        var b = el("button", "btn ghost", "Download");
        b.type = "button";
        b.setAttribute("aria-label", "Download the workbook for " + c.title);
        b.addEventListener("click", function () { download(c.id, b); });
        li.appendChild(b);
      } else {
        li.appendChild(el("span", "wb-soon", "Coming soon"));
      }
      list.appendChild(li);
    });
    mount.appendChild(list);
    mount.appendChild(el("p", "wb-note", "Do the practical tasks on a live chart, and check the answer key at the back only when you have finished."));
  }

  function load() {
    mount.replaceChildren(el("p", "live", "Opening the workbooks..."));
    return api.authFetch("/api/workbooks").then(readJson).then(function (d) {
      items = d.workbooks;
      render();
    }).catch(function (e) {
      if (e.message === "signed out") return;
      var box = el("div");
      box.appendChild(el("p", "quiz-empty", e.message || "We could not open the workbooks just now."));
      var retry = el("button", "btn ghost", "Try again");
      retry.type = "button";
      retry.addEventListener("click", load);
      box.appendChild(retry);
      mount.replaceChildren(box);
    });
  }

  window.abecWorkbook = {
    setup: function (a) { api = a; mount = document.getElementById("wbMount"); },
    show: function () { if (items) render(); else load(); },
    reset: function () { items = null; if (mount) mount.replaceChildren(); },
  };
})();
