// Builds the student ID card. Text is always set with textContent (never innerHTML).
(function () {
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function slug(s) {
    return String(s).toLowerCase().replace(/\s+/g, "-");
  }
  function item(label, content) {
    var wrap = el("div", "idcard-item");
    var dt = el("dt", null, label);
    var dd = el("dd");
    if (typeof content === "string") dd.textContent = content;
    else dd.appendChild(content);
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    return wrap;
  }

  window.renderIdCard = function (d) {
    var status = d.status || "Uncertified";
    var card = el("article", "idcard deal");
    card.setAttribute("data-status", slug(status));
    card.setAttribute("tabindex", "-1");
    var kind = status === "Team Member" ? "Team" : status === "Alumni Member" ? "Alumni" : "Student";
    card.setAttribute("aria-label", kind + " card for " + d.fullName);

    var mark = el("img", "idcard-mark");
    mark.src = "/logo-white.png";
    mark.alt = "";
    mark.setAttribute("aria-hidden", "true");

    var top = el("div", "idcard-top");
    var logo = el("img", "idcard-logo");
    logo.src = "/logo-white.png";
    logo.alt = "";
    logo.width = 29;
    logo.height = 22;
    top.appendChild(logo);
    top.appendChild(el("span", "idcard-brand", "ABEC-FX " + kind));

    var middle = el("div");
    middle.appendChild(el("h3", "idcard-name", d.fullName));
    middle.appendChild(el("p", "idcard-reg", d.regNumber));

    var meta = el("dl", "idcard-meta");
    meta.appendChild(item("Gender", d.gender || "Not given"));
    meta.appendChild(item("Status", el("span", "badge badge-" + slug(status), status === "Certified" ? "Certified Graduate" : status)));
    if (status !== "Uncertified") {
      meta.appendChild(item("Status since", d.statusDate || "Not recorded"));
    }

    card.appendChild(mark);
    card.appendChild(top);
    card.appendChild(middle);
    card.appendChild(meta);
    return card;
  };
})();
