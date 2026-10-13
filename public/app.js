(function () {
  var form = document.getElementById("regForm");
  var btn = document.getElementById("submitBtn");
  var formErr = document.getElementById("formErr");
  var countrySel = document.getElementById("country");

  document.getElementById("year").textContent = new Date().getFullYear();

  fetch("/api/countries")
    .then(function (r) { return r.json(); })
    .then(function (list) {
      list.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        countrySel.appendChild(o);
      });
    })
    .catch(function () {
      formErr.textContent = "Could not load the country list. Refresh the page to try again.";
    });

  function clearErrors() {
    formErr.textContent = "";
    form.querySelectorAll(".err").forEach(function (e) { e.textContent = ""; });
    form.querySelectorAll(".field").forEach(function (f) { f.classList.remove("invalid"); });
  }

  function showErrors(errors) {
    Object.keys(errors).forEach(function (key) {
      var span = form.querySelector('.err[data-for="' + key + '"]');
      if (span) {
        span.textContent = errors[key];
        span.closest(".field").classList.add("invalid");
      }
    });
    var first = form.querySelector(".field.invalid input, .field.invalid select");
    if (first) first.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });

    btn.disabled = true;
    btn.textContent = "Registering...";

    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (res.ok) {
          var first = (res.body.fullName || "").split(" ")[0];
          document.getElementById("welcome").textContent = first
            ? "You're registered, " + first
            : "You're registered";
          document.getElementById("passName").textContent = res.body.fullName || "";
          document.getElementById("regNumber").textContent = res.body.regNumber;
          document.getElementById("statusLink").href =
            "/status?reg=" + encodeURIComponent(res.body.regNumber);
          document.getElementById("formCard").hidden = true;
          document.getElementById("successCard").hidden = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (res.body.errors) {
          showErrors(res.body.errors);
        } else {
          formErr.textContent = res.body.error || "Something went wrong. Please try again.";
        }
      })
      .catch(function () {
        formErr.textContent = "Network problem. Check your connection and try again.";
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Register";
      });
  });

  document.getElementById("copyBtn").addEventListener("click", function () {
    var text = document.getElementById("regNumber").textContent;
    var b = this;
    function done() {
      b.textContent = "Copied";
      setTimeout(function () { b.textContent = "Copy number"; }, 1800);
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
    else done();
  });
})();
