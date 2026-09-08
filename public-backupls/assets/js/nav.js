/* Mobile navigation toggle.
   Progressive enhancement: without JS the toggle button stays hidden and the
   nav list renders as a normal stacked list of links (see main.css .no-js). */
(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var list = document.getElementById("primary-nav");
  if (!toggle || !list) return;

  toggle.hidden = false;

  function setOpen(open) {
    list.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close" : "Menu";
  }

  toggle.addEventListener("click", function () {
    setOpen(!list.classList.contains("is-open"));
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && list.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Close the menu when a link inside it is followed on the same page.
  list.addEventListener("click", function (e) {
    if (e.target.tagName === "A") setOpen(false);
  });

  // Reset state if the viewport grows past the mobile breakpoint.
  var mq = window.matchMedia("(min-width: 721px)");
  var onChange = function (e) { if (e.matches) setOpen(false); };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange);
})();
