// "Check ID" dropdown: Student ID card, Alumni ID card, Staff ID card or Certificate.
// Choosing Certificate opens the certificate page; choosing an ID card on the certificate page opens the ID page.
// Moving between the three ID cards stays on the same page (status.js listens to the same dropdown).
(function () {
  var sel = document.getElementById("lookupKind");
  if (!sel) return;
  var onCert = location.pathname.indexOf("/certificate") === 0;
  var qs = new URLSearchParams(location.search);

  // A link such as /status?kind=staff&reg=ABECFX/26/0001 opens with that card already chosen.
  var wanted = qs.get("kind");
  if (wanted === "team") wanted = "staff"; // old links
  if (!onCert && wanted && Array.prototype.some.call(sel.options, function (o) { return o.value === wanted && o.value !== "certificate"; })) {
    sel.value = wanted;
  }

  function typedReg() {
    var box = document.getElementById("reg");
    return ((box && box.value) || qs.get("reg") || "").trim();
  }

  sel.addEventListener("change", function () {
    var reg = typedReg();
    var tail = reg ? "reg=" + encodeURIComponent(reg) : "";
    if (sel.value === "certificate" && !onCert) {
      location.href = "/certificate" + (tail ? "?" + tail : "");
    } else if (sel.value !== "certificate" && onCert) {
      location.href = "/status?kind=" + sel.value + (tail ? "&" + tail : "");
    }
  });
})();
