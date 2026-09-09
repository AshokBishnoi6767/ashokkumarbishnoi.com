/*
  Public Navigator widget — an AI assistant for the site, and a live example
  of the customer service bots this business builds for clients. Talks only
  to POST /api/public-ai — never the private endpoint, never sends any
  credential. Builds its own DOM rather than requiring markup changes on
  every page.
*/
(function () {
  "use strict";

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function sessionId() {
    var key = "navigator_session_id";
    var id = window.sessionStorage.getItem(key);
    if (!id) {
      id = "nav-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      window.sessionStorage.setItem(key, id);
    }
    return id;
  }

  var launcher = el("button", null, "Chat With Us");
  launcher.id = "navigator-launcher";
  launcher.type = "button";

  var panel = el("div");
  panel.id = "navigator-panel";

  var head = el("div", "nav-widget-head");
  var headText = el("div");
  headText.appendChild(el("div", "nav-widget-eyebrow", "AI Assistant"));
  headText.appendChild(el("div", "nav-widget-title", "Ask about our services"));
  var closeBtn = el("button", "nav-widget-close", "✕");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  head.appendChild(headText);
  head.appendChild(closeBtn);

  var log = el("div", "nav-widget-log");
  var intro = el("div", "nav-widget-intro", "Tell me what your business needs, or pick where to start:");
  var stages = el("div", "nav-widget-stages");
  [
    ["Customer service bots", "Tell me about customer service bots for my business."],
    ["IT services", "Tell me about your IT services."],
    ["Marketing services", "Tell me about your marketing services."],
  ].forEach(function (choice) {
    var b = el("button", null, choice[0]);
    b.type = "button";
    b.addEventListener("click", function () {
      sendMessage(choice[1]);
    });
    stages.appendChild(b);
  });
  log.appendChild(intro);
  log.appendChild(stages);

  var status = el("div", "nav-widget-status");

  var form = el("form", "nav-widget-form");
  var textarea = el("textarea");
  textarea.placeholder = "Ask about customer service bots, IT services, or marketing…";
  textarea.setAttribute("aria-label", "Message");
  var sendBtn = el("button", null, "Ask");
  sendBtn.type = "submit";
  form.appendChild(textarea);
  form.appendChild(sendBtn);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(status);
  panel.appendChild(form);

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  launcher.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) textarea.focus();
  });
  closeBtn.addEventListener("click", function () {
    panel.classList.remove("open");
  });

  function addMessage(role, text) {
    var msg = el("div", "nav-widget-msg " + role, text);
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  }

  function sendMessage(message) {
    addMessage("user", message);
    status.textContent = "Thinking…";
    sendBtn.disabled = true;
    fetch("/api/public-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, sessionId: sessionId() }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        status.textContent = "";
        sendBtn.disabled = false;
        if (data.status === "SUCCESS" && data.reply) {
          addMessage("agent", data.reply);
        } else if (data.status === "NOT_CONFIGURED") {
          addMessage("error", "The Navigator isn't fully connected yet — no AI provider is configured on this server. Please use the contact form for now.");
        } else {
          addMessage("error", "Something went wrong. Please try again, or use the contact form.");
        }
      })
      .catch(function () {
        status.textContent = "";
        sendBtn.disabled = false;
        addMessage("error", "Could not reach the server. Please try again, or use the contact form.");
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var value = textarea.value.trim();
    if (!value) return;
    textarea.value = "";
    sendMessage(value);
  });
})();
