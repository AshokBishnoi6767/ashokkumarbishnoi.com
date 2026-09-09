/* Visual-polish behavior layer: scroll reveal (section-level, not every
   paragraph — restraint is intentional), the homepage hero trajectory
   graphic, and a very light cursor-proximity touch on desktop. Nothing
   here is required to read or use the site — every effect degrades to
   "content simply visible" when JS doesn't run, IntersectionObserver
   isn't available, or prefers-reduced-motion is set. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fineHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function initSectionReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    var sections = document.querySelectorAll(".section:not(.hero)");
    if (!sections.length) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    sections.forEach(function (el) {
      el.setAttribute("data-reveal", "");
      io.observe(el);
    });
  }

  // Same observer pattern for the two structural progressions that get
  // their own micro-treatment (frontiers connector, loop pulse) — kept
  // separate from the generic section reveal since they carry extra
  // classed state (.is-visible drives a connector line, not just fade).
  function initTrackReveal(selector) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      document.querySelectorAll(selector).forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var items = document.querySelectorAll(selector);
    if (!items.length) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    items.forEach(function (el, i) {
      el.style.transitionDelay = reduceMotion ? "0ms" : Math.min(i * 90, 360) + "ms";
      io.observe(el);
    });
  }

  // Decorative, aria-hidden trajectory graphic for the homepage hero only.
  // Pure SVG line + a handful of node points — not particles, not a
  // generic neural-network graphic. Injected via JS (rather than inline
  // in every hero) so the markup lives in one place and every other page's
  // .hero is untouched.
  function initHeroTrajectory() {
    // Opt-in via a marker attribute on the homepage's .hero only — every
    // other page's hero (Services, About, Contact, ...) is untouched.
    var hero = document.querySelector(".hero[data-hero-trajectory]");
    if (!hero) return;

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "hero-trajectory");
    svg.setAttribute("viewBox", "0 0 800 320");
    svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("class", "line");
    path.setAttribute("d", "M10,280 C180,280 230,150 400,140 C560,130 610,60 790,40");
    svg.appendChild(path);

    var points = [
      { x: 10, y: 280 },
      { x: 260, y: 200 },
      { x: 480, y: 110 },
      { x: 700, y: 55, amber: true },
    ];
    points.forEach(function (p) {
      var c = document.createElementNS(svg.namespaceURI, "circle");
      c.setAttribute("class", "node" + (p.amber ? " amber" : ""));
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "3.4");
      svg.appendChild(c);
    });

    hero.insertBefore(svg, hero.firstChild);
  }

  // A very light cursor-proximity touch: hero nodes ease slightly toward
  // the pointer. Desktop with a real pointer only; never on touch; never
  // under reduced motion; never fights normal browser behavior (no cursor
  // replacement, no hijacked events).
  function initCursorProximity() {
    if (reduceMotion || !fineHover) return;
    var svg = document.querySelector(".hero-trajectory");
    if (!svg) return;
    var nodes = svg.querySelectorAll("circle.node");
    if (!nodes.length) return;

    var rect = null;
    var raf = null;

    function updateRect() {
      rect = svg.getBoundingClientRect();
    }
    window.addEventListener("resize", updateRect, { passive: true });
    updateRect();

    svg.closest(".hero").addEventListener(
      "pointermove",
      function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          if (!rect) updateRect();
          var px = ((e.clientX - rect.left) / rect.width) * 800;
          var py = ((e.clientY - rect.top) / rect.height) * 320;
          nodes.forEach(function (node) {
            var cx = parseFloat(node.getAttribute("cx"));
            var cy = parseFloat(node.getAttribute("cy"));
            var dx = px - cx;
            var dy = py - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var influence = Math.max(0, 1 - dist / 220);
            var shiftX = (dx / (dist || 1)) * influence * 6;
            var shiftY = (dy / (dist || 1)) * influence * 6;
            node.style.transform = "translate(" + shiftX.toFixed(1) + "px," + shiftY.toFixed(1) + "px)";
          });
        });
      },
      { passive: true }
    );
  }

  function init() {
    initHeroTrajectory();
    initSectionReveal();
    initTrackReveal(".frontier");
    initTrackReveal(".loop-step");
    initCursorProximity();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
