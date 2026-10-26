// "Find a student" dropdown: choose ID card or certificate; the matching page opens.
(function () {
  var sel = document.getElementById("lookupKind");
  if (!sel) return;
  sel.addEventListener("change", function () {
    if (sel.value && sel.value !== location.pathname) location.href = sel.value;
  });
})();
