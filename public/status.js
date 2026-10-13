(function () {
  var form = document.getElementById("lookupForm");
  var input = document.getElementById("reg");
  var err = document.getElementById("lookupErr");
  var btn = document.getElementById("lookupBtn");
  var result = document.getElementById("result");

  document.getElementById("year").textContent = new Date().getFullYear();

  var CLASSES = {
    "Uncertified": "s-uncertified",
    "Certified": "s-certified",
    "Mentor": "s-mentor",
    "Staff Member": "s-staff",
    "CEO": "s-ceo"
  };

  function show(d) {
    document.getElementById("rName").textContent = d.fullName;
    document.getElementById("rReg").textContent = d.regNumber;
    document.getElementById("rGender").textContent = d.gender || "Not recorded";
    document.getElementById("rStatus").textContent = d.status;
    document.getElementById("rBadge").className = "status " + (CLASSES[d.status] || "s-uncertified");

    var uncertified = d.status === "Uncertified";
    document.getElementById("rDateLabel").textContent = uncertified ? "Status" : "Status since";
    document.getElementById("rDate").textContent = uncertified
      ? "Awaiting certification"
      : d.statusDate || "Date not recorded";

    // replay the entrance animation on every new result
    var pass = result.querySelector(".pass");
    pass.style.animation = "none";
    void pass.offsetWidth;
    pass.style.animation = "";
    result.hidden = false;
  }

  function search() {
    err.textContent = "";
    result.hidden = true;
    var reg = input.value.trim();
    if (!reg) {
      err.textContent = "Enter a registration number to search.";
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = "Checking...";
    fetch("/api/lookup?reg=" + encodeURIComponent(reg))
      .then(function (r) {
        return r.json().then(function (b) { return { ok: r.ok, body: b }; });
      })
      .then(function (res) {
        if (!res.ok) {
          err.textContent = res.body.error || "Something went wrong. Please try again.";
          return;
        }
        show(res.body);
      })
      .catch(function () {
        err.textContent = "Network problem. Check your connection and try again.";
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Check status";
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    search();
  });

  var pre = new URLSearchParams(location.search).get("reg");
  if (pre) {
    input.value = pre;
    search();
  }
})();
