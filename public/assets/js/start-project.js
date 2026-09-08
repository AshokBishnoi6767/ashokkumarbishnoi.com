/* Start a Project form.

   There is no backend. GitHub Pages is static, and rather than pretend
   otherwise this form composes an email in the visitor's own mail client.

   Progressive enhancement: without JS the form still renders and the page
   still shows the email address and the six questions, so a visitor can
   write the message themselves. This script only adds the convenience of
   pre-filling it.

   Nothing is transmitted or stored by this site. */
(function () {
  "use strict";

  var EMAIL = "ashokbishnoi1705@gmail.com";

  var form = document.getElementById("start-project-form");
  var button = document.getElementById("start-project-submit");
  var note = document.getElementById("start-project-note");
  if (!form || !button) return;

  var FIELDS = [
    ["company", "What does your company do?"],
    ["improve", "What are you trying to improve?"],
    ["type", "What type of content do you need?"],
    ["scope", "Approximate scope"],
    ["timeline", "Preferred timeline"],
    ["contact", "How to contact you"]
  ];

  function value(id) {
    var node = document.getElementById(id);
    return node && node.value ? node.value.trim() : "";
  }

  button.addEventListener("click", function () {
    var answered = 0;
    var lines = [];

    FIELDS.forEach(function (field) {
      var v = value(field[0]);
      if (v) answered += 1;
      lines.push(field[1]);
      lines.push(v || "(not answered)");
      lines.push("");
    });

    if (answered === 0) {
      note.textContent = "Fill in at least one answer first, or use the direct email link.";
      note.style.color = "var(--ink)";
      var first = document.getElementById("company");
      if (first) first.focus();
      return;
    }

    var subject = "Project enquiry";
    var company = value("company");
    if (company) subject += " — " + company.split(/[.\n]/)[0].slice(0, 60);

    var body = lines.join("\n");

    note.textContent = "Opening your mail client. If nothing happens, email " + EMAIL + " directly.";
    note.style.color = "";

    window.location.href =
      "mailto:" + EMAIL +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  });

  // Stop an accidental Enter keypress from doing nothing visible.
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    button.click();
  });
})();
