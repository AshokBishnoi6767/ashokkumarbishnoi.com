/* Visual concept system, shared by long-form Resources content and the
   homepage's Four Frontiers. Each named concept is a small, purposeful SVG
   composition in the site's existing palette — not decoration, not stock
   imagery, not a random thumbnail. Concepts are reused by theme (several
   articles sharing "friction" or "decision-map" is intentional, the same
   way a publication reuses a limited set of section icons; the Frontiers
   reuse the same four for the same reason — one visual system, four
   inflections of it). This is the placeholder layer for the 50 approved
   research infographics — when those are provided, each [data-visual]
   target here is exactly where a real image would drop in.
   Zero dependencies, respects prefers-reduced-motion. */
(function () {
  "use strict";

  var GREEN = "#2f6b4f";
  var AMBER = "#c78b35";
  var CHARCOAL = "#171717";
  var BORDER = "#ccd7cd";

  function svg(inner, viewBox) {
    return '<svg viewBox="' + (viewBox || "0 0 400 175") + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + inner + "</svg>";
  }

  var CONCEPTS = {
    friction: function () {
      return svg(
        '<line x1="20" y1="100" x2="150" y2="100" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<path d="M150,100 L165,80 L180,120 L195,80 L210,120 L225,100" fill="none" stroke="' + AMBER + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<line x1="225" y1="100" x2="380" y2="100" stroke="' + GREEN + '" stroke-width="2"/>' +
          '<circle cx="380" cy="100" r="4" fill="' + GREEN + '"/>'
      );
    },
    "ai-signals": function () {
      var nodes = [
        [60, 60], [140, 40], [220, 90], [300, 50], [340, 110], [110, 130], [260, 140],
      ];
      var lines = "";
      for (var i = 0; i < nodes.length - 1; i++) {
        lines += '<line x1="' + nodes[i][0] + '" y1="' + nodes[i][1] + '" x2="' + nodes[i + 1][0] + '" y2="' + nodes[i + 1][1] + '" stroke="' + BORDER + '" stroke-width="1"/>';
      }
      var dots = nodes
        .map(function (n, i) {
          return '<circle class="av-node" cx="' + n[0] + '" cy="' + n[1] + '" r="4" fill="' + (i % 3 === 0 ? AMBER : GREEN) + '" style="animation-delay:' + i * 0.3 + 's"/>';
        })
        .join("");
      return svg(lines + dots);
    },
    "decision-map": function () {
      return svg(
        '<circle cx="40" cy="88" r="5" fill="' + CHARCOAL + '"/>' +
          '<line x1="45" y1="88" x2="140" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<line x1="140" y1="88" x2="230" y2="40" stroke="' + GREEN + '" stroke-width="2.5"/>' +
          '<line x1="140" y1="88" x2="230" y2="136" stroke="' + BORDER + '" stroke-width="2" stroke-dasharray="4 5"/>' +
          '<circle cx="140" cy="88" r="5" fill="' + CHARCOAL + '"/>' +
          '<circle cx="230" cy="40" r="6" fill="' + GREEN + '"/>' +
          '<circle cx="230" cy="136" r="5" fill="' + BORDER + '"/>' +
          '<line x1="230" y1="40" x2="360" y2="24" stroke="' + GREEN + '" stroke-width="2.5"/>' +
          '<circle cx="360" cy="24" r="5" fill="' + AMBER + '"/>'
      );
    },
    "data-flow": function () {
      var rows = [40, 88, 136];
      var content = "";
      rows.forEach(function (y, i) {
        content +=
          '<line x1="20" y1="' + y + '" x2="380" y2="' + y + '" stroke="' + BORDER + '" stroke-width="1.5" stroke-dasharray="1 7" stroke-linecap="round"/>' +
          '<circle class="av-flow" cx="20" cy="' + y + '" r="4" fill="' + (i === 1 ? GREEN : AMBER) + '" style="animation-delay:' + i * 0.6 + 's"/>';
      });
      return svg(content);
    },
    "research-report": function () {
      var bars = [30, 70, 45, 90, 60];
      var content = "";
      bars.forEach(function (h, i) {
        content += '<rect x="' + (40 + i * 65) + '" y="' + (150 - h) + '" width="34" height="' + h + '" fill="' + (i === 3 ? GREEN : BORDER) + '" rx="2"/>';
      });
      content += '<line x1="20" y1="150" x2="380" y2="150" stroke="' + CHARCOAL + '" stroke-width="1.5"/>';
      return svg(content);
    },
    "contrarian-thought": function () {
      return svg(
        '<path d="M60,50 Q35,50 35,80 Q35,105 60,105 Q60,130 35,140" fill="none" stroke="' + GREEN + '" stroke-width="4" stroke-linecap="round"/>' +
          '<path d="M150,50 Q125,50 125,80 Q125,105 150,105 Q150,130 125,140" fill="none" stroke="' + AMBER + '" stroke-width="4" stroke-linecap="round"/>' +
          '<line x1="220" y1="90" x2="380" y2="90" stroke="' + BORDER + '" stroke-width="2"/>'
      );
    },
    "content-engine": function () {
      return svg(
        '<circle cx="120" cy="88" r="55" fill="none" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<circle class="av-spin" cx="120" cy="88" r="55" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-dasharray="40 305" stroke-linecap="round"/>' +
          '<circle cx="120" cy="88" r="10" fill="' + CHARCOAL + '"/>' +
          '<line x1="185" y1="88" x2="380" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<circle cx="380" cy="88" r="5" fill="' + AMBER + '"/>'
      );
    },
    "customer-journey": function () {
      var pts = [[30, 120], [100, 60], [180, 100], [260, 50], [340, 90]];
      var path = pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p[0] + "," + p[1]; }).join(" ");
      var dots = pts.map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + (i === pts.length - 1 ? GREEN : BORDER) + '"/>'; }).join("");
      return svg('<path d="' + path + '" fill="none" stroke="' + AMBER + '" stroke-width="2" stroke-dasharray="1 8" stroke-linecap="round"/>' + dots);
    },
    "feedback-loop": function () {
      return svg(
        '<circle cx="120" cy="88" r="60" fill="none" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<path class="av-spin" d="M120,28 A60,60 0 1 1 65,60" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-linecap="round"/>' +
          '<path d="M65,60 L52,52 L60,72" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<line x1="200" y1="88" x2="380" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<circle cx="380" cy="88" r="5" fill="' + AMBER + '"/>'
      );
    },
    breakthrough: function () {
      return svg(
        '<line x1="20" y1="140" x2="180" y2="140" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<path d="M180,140 C230,140 250,60 320,40" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="320" cy="40" r="6" fill="' + AMBER + '"/>' +
          '<path d="M320,40 L340,32 M320,40 L336,52" stroke="' + AMBER + '" stroke-width="2" stroke-linecap="round"/>'
      );
    },
    network: function () {
      var nodes = [[60, 50], [180, 30], [300, 60], [90, 130], [220, 140], [340, 110]];
      var edges = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5]];
      var lines = edges.map(function (e) { return '<line x1="' + nodes[e[0]][0] + '" y1="' + nodes[e[0]][1] + '" x2="' + nodes[e[1]][0] + '" y2="' + nodes[e[1]][1] + '" stroke="' + BORDER + '" stroke-width="1"/>'; }).join("");
      var dots = nodes.map(function (n, i) { return '<circle class="av-node" cx="' + n[0] + '" cy="' + n[1] + '" r="4.5" fill="' + (i % 2 ? GREEN : AMBER) + '" style="animation-delay:' + i * 0.25 + 's"/>'; }).join("");
      return svg(lines + dots);
    },
    "trust-point": function () {
      return svg(
        '<line x1="20" y1="88" x2="150" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
          '<circle cx="200" cy="88" r="42" fill="none" stroke="' + BORDER + '" stroke-width="1.5"/>' +
          '<circle cx="200" cy="88" r="24" fill="none" stroke="' + BORDER + '" stroke-width="1.5"/>' +
          '<circle class="av-pulse" cx="200" cy="88" r="8" fill="' + GREEN + '"/>' +
          '<line x1="250" y1="88" x2="380" y2="88" stroke="' + BORDER + '" stroke-width="2"/>'
      );
    },
  };

  function render() {
    var targets = document.querySelectorAll("[data-visual]");
    targets.forEach(function (el) {
      var key = el.getAttribute("data-visual");
      var fn = CONCEPTS[key];
      if (!fn) return;
      el.innerHTML = fn();
      var label = el.getAttribute("data-visual-label");
      if (label) {
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", label);
      } else {
        // No label means the visual is pure reinforcement of text that's
        // already on the page (e.g. the Four Frontiers icons) — decorative,
        // so it's hidden from assistive tech rather than read out twice.
        el.setAttribute("aria-hidden", "true");
      }
    });
  }

  // Scroll reveal for the infographic-presentation component
  // (.article-visual-wrap / .article-visual-caption in article.css). Same
  // IntersectionObserver pattern as motion.js's initSectionReveal — one
  // observer, unobserve once revealed, no-op entirely under reduced motion
  // or without IntersectionObserver (content is simply visible by default,
  // see the CSS: the opacity:0 start state only applies inside the
  // prefers-reduced-motion:no-preference media query).
  function initVisualReveal() {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var wraps = document.querySelectorAll(".article-visual-wrap");
    if (!wraps.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      wraps.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    wraps.forEach(function (el) {
      io.observe(el);
    });
  }

  // "Ask the Navigator" CTA on article pages opens the existing public
  // Navigator widget (agent-widget.js) rather than linking to a separate
  // page — the Navigator IS the widget already on every page.
  function initNavigatorCtas() {
    var buttons = document.querySelectorAll("[data-open-navigator]");
    if (!buttons.length) return;
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var launcher = document.getElementById("navigator-launcher");
        if (launcher) launcher.click();
      });
    });
  }

  function init() {
    render();
    initVisualReveal();
    initNavigatorCtas();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
