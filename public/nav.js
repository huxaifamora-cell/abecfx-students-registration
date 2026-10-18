// Main menu: once someone is registered / signed in on this device, "Register" is not needed there any more.
// (They signed in or registered if the portal's sign-in token is saved. Signing out brings the link back.)
(function () {
  function signedIn() {
    try { return !!localStorage.getItem("abecfx_token"); } catch (e) { return false; }
  }
  function refresh() {
    var hide = signedIn();
    var links = document.querySelectorAll('.nav a[href="/register"]');
    for (var i = 0; i < links.length; i++) {
      // never hide the page you are on, so the menu does not look empty of a current page
      links[i].hidden = hide && links[i].getAttribute("aria-current") !== "page";
    }
  }
  window.abecNav = { refresh: refresh };
  refresh();
})();
