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

  var FONT = "IBM Plex Mono, ui-monospace, monospace";

  function labelText(x, y, text, opts) {
    opts = opts || {};
    var weight = opts.weight ? ' font-weight="' + opts.weight + '"' : "";
    return (
      '<text x="' + x + '" y="' + y + '" text-anchor="' + (opts.anchor || "middle") + '" font-family="' + FONT + '" font-size="' +
      (opts.size || 10.5) + '" fill="' + (opts.fill || CHARCOAL) + '"' + weight + ">" + text + "</text>"
    );
  }

  // ---------- Labeled diagram variants ----------
  // Each reuses an EXISTING generic concept's exact geometry/coordinates
  // below (proven, already part of the site's visual language) and adds
  // real, article-specific text at those same anchor points — turning a
  // decorative reused icon into an information-bearing one without
  // inventing an unrelated new visual grammar per article. The shape
  // family stays coherent across the site (per the design system); the
  // labeled content is what makes each instance genuinely specific.

  function labeledGapBridge(leftLabel, gapLabel, rightLabel) {
    return svg(
      '<line x1="20" y1="100" x2="150" y2="100" stroke="' + BORDER + '" stroke-width="2"/>' +
        '<path d="M150,100 L165,80 L180,120 L195,80 L210,120 L225,100" fill="none" stroke="' + AMBER + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<line x1="225" y1="100" x2="380" y2="100" stroke="' + GREEN + '" stroke-width="2"/>' +
        '<circle cx="380" cy="100" r="4" fill="' + GREEN + '"/>' +
        labelText(85, 128, leftLabel) +
        labelText(187, 62, gapLabel, { fill: AMBER, weight: 700 }) +
        labelText(300, 128, rightLabel)
    );
  }

  function labeledNetwork(labels) {
    var nodes = [[60, 50], [180, 30], [300, 60], [90, 130], [220, 140], [340, 110]];
    var edges = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5]];
    var lines = edges.map(function (e) { return '<line x1="' + nodes[e[0]][0] + '" y1="' + nodes[e[0]][1] + '" x2="' + nodes[e[1]][0] + '" y2="' + nodes[e[1]][1] + '" stroke="' + BORDER + '" stroke-width="1"/>'; }).join("");
    var dots = nodes.map(function (n, i) { return '<circle class="av-node" cx="' + n[0] + '" cy="' + n[1] + '" r="4.5" fill="' + (i % 2 ? GREEN : AMBER) + '" style="animation-delay:' + i * 0.25 + 's"/>'; }).join("");
    var texts = nodes
      .map(function (n, i) {
        if (!labels[i]) return "";
        var anchor = n[0] < 150 ? "end" : n[0] > 250 ? "start" : "middle";
        var dx = anchor === "end" ? -9 : anchor === "start" ? 9 : 0;
        var dy = n[1] < 60 ? -9 : n[1] > 100 ? 15 : -9;
        return labelText(n[0] + dx, n[1] + dy, labels[i], { anchor: anchor });
      })
      .join("");
    return svg(lines + dots + texts);
  }

  function labeledEngine(labels) {
    var cx = 120, cy = 88, r = 55;
    var anchors = [[cx, cy - r - 10, "middle"], [cx + r + 10, cy, "start"], [cx, cy + r + 16, "middle"], [cx - r - 10, cy, "end"]];
    var dots = anchors.map(function (a, i) { return '<circle class="av-pulse" cx="' + (a[0] - (a[2] === "start" ? 10 : a[2] === "end" ? -10 : 0)) + '" cy="' + (a[1] - (i === 2 ? 16 : i === 0 ? -10 : 0)) + '" r="4" fill="' + (i % 2 ? GREEN : AMBER) + '" style="animation-delay:' + i * 0.25 + 's"/>'; }).join("");
    var texts = anchors.map(function (a, i) { return labels[i] ? labelText(a[0], a[1], labels[i], { anchor: a[2] }) : ""; }).join("");
    return svg(
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + BORDER + '" stroke-width="2"/>' +
        '<circle class="av-spin" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-dasharray="40 305" stroke-linecap="round"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' + CHARCOAL + '"/>' +
        dots + texts
    );
  }

  function labeledBranch(startLabel, takenLabel, notTakenLabel) {
    return svg(
      '<circle cx="40" cy="88" r="5" fill="' + CHARCOAL + '"/>' +
        '<line x1="45" y1="88" x2="140" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
        '<line x1="140" y1="88" x2="230" y2="40" stroke="' + GREEN + '" stroke-width="2.5"/>' +
        '<line x1="140" y1="88" x2="230" y2="136" stroke="' + BORDER + '" stroke-width="2" stroke-dasharray="4 5"/>' +
        '<circle cx="140" cy="88" r="5" fill="' + CHARCOAL + '"/>' +
        '<circle cx="230" cy="40" r="6" fill="' + GREEN + '"/>' +
        '<circle cx="230" cy="136" r="5" fill="' + BORDER + '"/>' +
        '<line x1="230" y1="40" x2="360" y2="24" stroke="' + GREEN + '" stroke-width="2.5"/>' +
        '<circle cx="360" cy="24" r="5" fill="' + AMBER + '"/>' +
        labelText(40, 108, startLabel, { anchor: "middle", size: 10 }) +
        labelText(295, 14, takenLabel, { anchor: "middle", fill: GREEN, weight: 700 }) +
        labelText(230, 156, notTakenLabel, { anchor: "middle", size: 10 })
    );
  }

  function labeledBars(labels, highlightIndex) {
    var heights = [30, 70, 45, 90, 60];
    var content = "";
    heights.forEach(function (h, i) {
      var x = 40 + i * 65;
      content += '<rect x="' + x + '" y="' + (150 - h) + '" width="34" height="' + h + '" fill="' + (i === highlightIndex ? GREEN : BORDER) + '" rx="2"/>';
      if (labels[i]) content += labelText(x + 17, 168, labels[i], { size: 9.5, fill: i === highlightIndex ? GREEN : "#5e6b62", weight: i === highlightIndex ? 700 : null });
    });
    content += '<line x1="20" y1="150" x2="380" y2="150" stroke="' + CHARCOAL + '" stroke-width="1.5"/>';
    return svg(content, "0 0 400 185");
  }

  function labeledJourney(labels) {
    var pts = [[30, 120], [100, 60], [180, 100], [260, 50], [340, 90]];
    var path = pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p[0] + "," + p[1]; }).join(" ");
    var dots = pts.map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + (i === pts.length - 1 ? GREEN : BORDER) + '"/>'; }).join("");
    var texts = pts.map(function (p, i) { return labels[i] ? labelText(p[0], p[1] < 90 ? p[1] - 12 : p[1] + 20, labels[i], { size: 9.5 }) : ""; }).join("");
    return svg('<path d="' + path + '" fill="none" stroke="' + AMBER + '" stroke-width="2" stroke-dasharray="1 8" stroke-linecap="round"/>' + dots + texts, "0 0 400 190");
  }

  function labeledLoop(labels) {
    var cx = 120, cy = 88, r = 60;
    var anchors = [[cx, cy - r - 10, "middle"], [cx + r + 12, cy, "start"], [cx, cy + r + 16, "middle"], [cx - r - 12, cy, "end"]];
    var texts = anchors.map(function (a, i) { return labels[i] ? labelText(a[0], a[1], labels[i], { anchor: a[2] }) : ""; }).join("");
    return svg(
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + BORDER + '" stroke-width="2"/>' +
        '<path class="av-spin" d="M120,28 A60,60 0 1 1 65,60" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M65,60 L52,52 L60,72" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        texts
    );
  }

  function labeledBreakthrough(beforeLabel, afterLabel) {
    return svg(
      '<line x1="20" y1="140" x2="180" y2="140" stroke="' + BORDER + '" stroke-width="2"/>' +
        '<path d="M180,140 C230,140 250,60 320,40" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="320" cy="40" r="6" fill="' + AMBER + '"/>' +
        '<path d="M320,40 L340,32 M320,40 L336,52" stroke="' + AMBER + '" stroke-width="2" stroke-linecap="round"/>' +
        labelText(100, 160, beforeLabel) +
        labelText(320, 20, afterLabel, { fill: GREEN, weight: 700 })
    );
  }

  function labeledSignals(labels) {
    var nodes = [[60, 60], [140, 40], [220, 90], [300, 50], [340, 110], [110, 130], [260, 140]];
    var lines = "";
    for (var i = 0; i < nodes.length - 1; i++) {
      lines += '<line x1="' + nodes[i][0] + '" y1="' + nodes[i][1] + '" x2="' + nodes[i + 1][0] + '" y2="' + nodes[i + 1][1] + '" stroke="' + BORDER + '" stroke-width="1"/>';
    }
    var dots = nodes
      .map(function (n, i) {
        return '<circle class="av-node" cx="' + n[0] + '" cy="' + n[1] + '" r="4" fill="' + (i % 3 === 0 ? AMBER : GREEN) + '" style="animation-delay:' + i * 0.3 + 's"/>';
      })
      .join("");
    var texts = nodes
      .map(function (n, i) {
        if (!labels[i]) return "";
        var anchor = n[0] < 130 ? "end" : n[0] > 280 ? "start" : "middle";
        var dx = anchor === "end" ? -8 : anchor === "start" ? 8 : 0;
        return labelText(n[0] + dx, n[1] < 90 ? n[1] - 10 : n[1] + 16, labels[i], { anchor: anchor, size: 9.5 });
      })
      .join("");
    return svg(lines + dots + texts, "0 0 400 185");
  }

  function labeledFlow(labels) {
    var rows = [40, 88, 136];
    var content = "";
    rows.forEach(function (y, i) {
      content +=
        '<line x1="20" y1="' + y + '" x2="380" y2="' + y + '" stroke="' + BORDER + '" stroke-width="1.5" stroke-dasharray="1 7" stroke-linecap="round"/>' +
        '<circle class="av-flow" cx="20" cy="' + y + '" r="4" fill="' + (i === 1 ? GREEN : AMBER) + '" style="animation-delay:' + i * 0.6 + 's"/>';
      if (labels[i]) content += labelText(32, y - 8, labels[i], { anchor: "start", size: 10.5 });
    });
    return svg(content);
  }

  function labeledContrarian(leftLabel, rightLabel) {
    return svg(
      '<path d="M60,50 Q35,50 35,80 Q35,105 60,105 Q60,130 35,140" fill="none" stroke="' + GREEN + '" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M150,50 Q125,50 125,80 Q125,105 150,105 Q150,130 125,140" fill="none" stroke="' + AMBER + '" stroke-width="4" stroke-linecap="round"/>' +
        '<line x1="220" y1="90" x2="380" y2="90" stroke="' + BORDER + '" stroke-width="2"/>' +
        labelText(97, 160, leftLabel, { size: 10 }) +
        labelText(300, 76, rightLabel, { fill: GREEN, weight: 700 })
    );
  }

  function labeledTrustPoint(centerLabel) {
    return svg(
      '<line x1="20" y1="88" x2="150" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
        '<circle cx="200" cy="88" r="42" fill="none" stroke="' + BORDER + '" stroke-width="1.5"/>' +
        '<circle cx="200" cy="88" r="24" fill="none" stroke="' + BORDER + '" stroke-width="1.5"/>' +
        '<circle class="av-pulse" cx="200" cy="88" r="8" fill="' + GREEN + '"/>' +
        '<line x1="250" y1="88" x2="380" y2="88" stroke="' + BORDER + '" stroke-width="2"/>' +
        labelText(200, 148, centerLabel, { weight: 700 })
    );
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
    // Bespoke, information-bearing diagram for "The Trust Engine" article —
    // NOT a reused theme icon. Visualizes the article's actual argument:
    // three specific, hidden inputs (consistency, mistake handling,
    // transparency) drive Trust, which in turn drives the three visible
    // metrics (conversion, retention, referral) a dashboard normally
    // tracks instead of the cause. Text is real content, not decoration —
    // this is what "communicates information related to the content"
    // means as distinct from the generic reused concepts above.
    "trust-engine-framework": function () {
      var FONT = "IBM Plex Mono, ui-monospace, monospace";
      var cx = 240, cy = 95, r = 30;
      var inputs = [
        { y: 40, label: "Consistency" },
        { y: 95, label: "Mistake handling" },
        { y: 150, label: "Transparency" },
      ];
      var outputs = [
        { y: 40, label: "Conversion" },
        { y: 95, label: "Retention" },
        { y: 150, label: "Referral" },
      ];
      var leftCircleX = 176;
      var rightCircleX = 304;
      var parts = "";
      inputs.forEach(function (n) {
        parts +=
          '<line x1="' + (leftCircleX + 4) + '" y1="' + n.y + '" x2="' + (cx - r - 4) + '" y2="' + cy + '" stroke="' + AMBER + '" stroke-width="1.5" stroke-dasharray="1 6" stroke-linecap="round"/>' +
          '<circle cx="' + leftCircleX + '" cy="' + n.y + '" r="4" fill="' + AMBER + '"/>' +
          '<text x="8" y="' + (n.y + 4) + '" font-family="' + FONT + '" font-size="12" fill="' + CHARCOAL + '">' + n.label + "</text>";
      });
      outputs.forEach(function (n) {
        parts +=
          '<line x1="' + (cx + r + 4) + '" y1="' + cy + '" x2="' + (rightCircleX - 4) + '" y2="' + n.y + '" stroke="' + GREEN + '" stroke-width="1.5"/>' +
          '<circle cx="' + rightCircleX + '" cy="' + n.y + '" r="4" fill="' + GREEN + '"/>' +
          '<text x="' + (rightCircleX + 8) + '" y="' + (n.y + 4) + '" font-family="' + FONT + '" font-size="12" fill="' + CHARCOAL + '">' + n.label + "</text>";
      });
      parts +=
        '<circle class="av-pulse" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + CHARCOAL + '"/>' +
        '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-family="' + FONT + '" font-size="11" font-weight="700" fill="#f7f8f4">TRUST</text>';
      return svg(parts, "0 0 480 190");
    },

    // ---------- Per-article bespoke diagrams (content/visual completion
    // phase) — every label below is drawn from that article's own real
    // text (its named framework items, dek, or closing question), never
    // invented. See the session report for the source mapping. ----------
    "knowing-what-to-change-framework": function () { return labeledGapBridge("Knowing", "the step after", "Doing"); },
    "the-most-dangerous-word-framework": function () { return labeledGapBridge("Looks stable", "hidden friction", "Actually resilient"); },
    "the-ai-adoption-gap-framework": function () { return labeledGapBridge("Rollout speed", "absorption gap", "Absorption speed"); },
    "the-b2b-content-gap-framework": function () { return labeledGapBridge("Content volume", "missing conviction", "Genuine conviction"); },

    "built-for-a-world-framework": function () { return labeledNetwork(["How customers find you", "How they trust you", "What \"fast\" means", "What tech now allows"]); },
    "from-ai-tools-to-organizations-framework": function () { return labeledNetwork(["Trust, earned", "Old workflows retired", "New incentives"]); },
    "the-human-ai-ratio-framework": function () { return labeledNetwork(["High-volume, defined", "Judgment, high-stakes", "Everything between"]); },
    "the-new-b2b-buying-committee-framework": function () { return labeledNetwork(["Budget holder", "Technical evaluator", "End user", "Security reviewer"]); },
    "the-distribution-problem-framework": function () { return labeledNetwork(["Specific relevant list", "Direct outreach", "Proven content plan"]); },
    "human-and-automation-framework": function () { return labeledNetwork(["List real tasks", "Automate low-judgment", "Redirect time"]); },

    "growth-isnt-a-department-framework": function () { return labeledEngine(["Shared success metric", "Cross-team data", "Product feedback", "Coordination, not silo"]); },
    "beyond-copilots-framework": function () { return labeledEngine(["Draft → select", "Sequential → parallel", "Periodic → continuous", "Redesigned workflow"]); },
    "why-b2b-buyers-dont-need-more-content-framework": function () { return labeledEngine(["Ask stalled deals", "Listen to reps", "Check funnel leak", "Remove the doubt"]); },
    "the-content-engine-framework": function () { return labeledEngine(["Research → topics", "Distribution → format", "Performance → next", "Real feedback loop"]); },
    "from-content-factory-framework": function () { return labeledEngine(["Listen first", "Depth over volume", "Compounding base", "Understanding → output"]); },
    "the-modern-inbound-system-framework": function () { return labeledEngine(["Generic keywords", "Gated content", "Generic nurture", "Saturated playbook"]); },

    "industry-4-0-readiness-framework": function () { return labeledBars(["Data→decision", "Automation scope", "Pilots graduate?", "Response speed", "Readiness"], 4); },
    "the-ai-ready-organization-framework": function () { return labeledBars(["Clean data", "Specific process", "Authority", "Tolerance", "Readiness"], 4); },
    "the-data-to-decision-gap-framework": function () { return labeledBars(["Named owner", "Set threshold", "Decision forum", "Real moment"], 3); },
    "the-measurement-problem-framework": function () { return labeledBars(["Vague goal", "Specific behavior", "Number+timeframe", "Defined failure"], 2); },
    "the-research-advantage-framework": function () { return labeledBars(["Commentary", "Firsthand data", "Credible method", "Original finding"], 3); },
    "your-ai-roi-definition-framework": function () { return labeledBars(["Pilot type set", "Metric named", "Threshold set", "Real ROI"], 3); },

    "digital-transformation-framework": function () { return labeledLoop(["Expiration date", "Milestones hit", "Shown as a project", "Ownership sunsets"]); },
    "the-feedback-loop-framework": function () { return labeledLoop(["Insight recorded", "Not assigned", "No mechanism", "Loop stays open"]); },
    "the-experimentation-advantage-framework": function () { return labeledLoop(["Falsifiable hypothesis", "Threshold set", "Short cycle", "Learn fast"]); },
    "think-build-measure-improve-framework": function () { return labeledLoop(["Think", "Build", "Measure", "Improve"]); },

    "the-ai-buyer-framework": function () { return labeledJourney(["Public info", "AI synthesis", "First impression", "Sales deck", "Contact"]); },
    "the-seven-source-buyer-framework": function () { return labeledJourney(["Review sites", "Peer talk", "AI synthesis", "Analyst take", "Vendor site"]); },
    "the-new-customer-journey-framework": function () { return labeledJourney(["Visible start", "Private research", "AI + peers", "Untracked", "Resurfaces"]); },
    "the-invisible-buying-journey-framework": function () { return labeledJourney(["Comparison shop", "Informal validation", "Self-serve eval", "Private decision", "CRM sees this"]); },

    "stop-automating-the-friction-framework": function () { return labeledBreakthrough("Automated friction", "Friction removed"); },
    "the-end-of-generic-seo-framework": function () { return labeledBreakthrough("Generic SEO", "Specific expertise"); },
    "your-company-doesnt-need-more-technology-framework": function () { return labeledBreakthrough("New tools", "New operating rhythm"); },

    "ai-isnt-your-strategy-framework": function () { return labeledSignals(["Pilots don't compound", "Hype-led investment", "Undefined success"]); },
    "what-to-stop-before-more-ai-framework": function () { return labeledSignals(["No clear owner", "Untrusted data", "Tribal knowledge", "Vague metrics"]); },
    "when-your-buyer-has-an-ai-assistant-framework": function () { return labeledSignals(["Existing belief", "Correct directly", "Go deeper"]); },

    "the-ai-data-flywheel-framework": function () { return labeledFlow(["Shared ownership", "Usage feeds back", "Ongoing data quality"]); },
    "the-automation-advantage-framework": function () { return labeledFlow(["Resolved before reported", "Feels attentive", "Removes waiting"]); },

    "ai-and-human-creativity-framework": function () { return labeledContrarian("Many generated ideas", "One worth keeping"); },
    "thought-leadership-framework": function () { return labeledContrarian("An opinion", "A new frame"); },

    "ai-without-the-hype-framework": function () { return labeledTrustPoint("A specific question"); },
    "from-attention-to-confidence-framework": function () { return labeledTrustPoint("Confidence"); },
    "trust-in-the-age-of-ai-framework": function () { return labeledTrustPoint("Verifiable trust"); },
    "when-intelligence-is-cheap-framework": function () { return labeledTrustPoint("Judgment"); },

    "ai-needs-better-boundaries-framework": function () { return labeledBranch("Bounded scope", "Earned authority", "Unlimited freedom"); },
    "from-dashboard-to-decision-framework": function () { return labeledBranch("Dashboard input", "Human judgment call", "Dashboard as verdict"); },
    "the-company-that-decides-first-framework": function () { return labeledBranch("Decision point", "Committed, first", "Still waiting"); },
    "the-decision-ready-business-framework": function () { return labeledBranch("Data collected", "Reaches the decision", "Sits unused"); },
    "the-self-educating-buyer-framework": function () { return labeledBranch("Self-educated", "Helped to decide", "Educated again"); },
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
