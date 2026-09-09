(function () {
  "use strict";

  var TOKEN_KEY = "ashok_admin_token";
  var SESSION_KEY = "ashok_agent_session_id";
  var LAST_MESSAGE_KEY = "ashok_agent_last_message";

  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var gateToken = document.getElementById("gate-token");
  var gateSubmit = document.getElementById("gate-submit");
  var gateError = document.getElementById("gate-error");

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function getSessionId() {
    var id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function showGate(errorMessage) {
    app.classList.remove("active");
    gate.style.display = "flex";
    if (errorMessage) {
      gateError.textContent = errorMessage;
      gateError.style.display = "block";
    }
  }

  function showApp() {
    gate.style.display = "none";
    app.classList.add("active");
    initApp();
  }

  gateSubmit.addEventListener("click", function () {
    var value = gateToken.value.trim();
    if (!value) return;
    localStorage.setItem(TOKEN_KEY, value);
    gateError.style.display = "none";
    showApp();
  });

  gateToken.addEventListener("keydown", function (e) {
    if (e.key === "Enter") gateSubmit.click();
  });

  var appInitialized = false;
  function initApp() {
    if (appInitialized) return;
    appInitialized = true;
    setupNav();
    setupAgent();
    setupIntegrations();
    setupSettings();
  }

  function setupNav() {
    var buttons = document.querySelectorAll("#nav button");
    var sections = document.querySelectorAll(".section");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.remove("active");
        });
        sections.forEach(function (s) {
          s.classList.remove("active");
        });
        btn.classList.add("active");
        document.getElementById("section-" + btn.dataset.section).classList.add("active");
      });
    });
    buttons[0].click();
  }

  function setupSettings() {
    document.getElementById("forget-token").addEventListener("click", function () {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    });
  }

  function setupIntegrations() {
    fetch("/api/health")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var el = document.getElementById("integrations-list");
        var lines = data.integrations
          .map(function (i) {
            return i.tool_id + " — " + i.connection_state + (i.connector_implemented ? "" : " (no connector)");
          })
          .join("\n");
        var modelLines = data.models
          .map(function (m) {
            return m.provider_id + " — " + m.status;
          })
          .join("\n");
        el.innerHTML =
          "<strong>Tools</strong><pre style='font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;margin:0 0 20px'>" +
          lines +
          "</pre><strong>Model providers</strong><pre style='font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;margin:0'>" +
          modelLines +
          "</pre>";
      })
      .catch(function () {
        document.getElementById("integrations-list").textContent = "Could not reach the server.";
      });
  }

  function setupAgent() {
    var log = document.getElementById("agent-log");
    var empty = document.getElementById("agent-empty");
    var status = document.getElementById("agent-status");
    var form = document.getElementById("agent-form");
    var input = document.getElementById("agent-input");
    var sendBtn = document.getElementById("agent-send");

    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    function addMessage(role, text, extraClass) {
      empty.style.display = "none";
      var wrap = document.createElement("div");
      wrap.className = "msg " + role + (extraClass ? " " + extraClass : "");
      var label = document.createElement("div");
      label.className = "msg-label";
      label.textContent = role === "user" ? "You" : "Ashok's AI";
      var body = document.createElement("div");
      body.className = "msg-body";
      body.textContent = text;
      wrap.appendChild(label);
      wrap.appendChild(body);
      log.appendChild(wrap);
      log.scrollTop = log.scrollHeight;
      return wrap;
    }

    function timezone() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      } catch (e) {
        return null;
      }
    }

    function send(message, confirmed) {
      status.textContent = "Thinking…";
      sendBtn.disabled = true;
      return fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
        body: JSON.stringify({ message: message, sessionId: getSessionId(), timezone: timezone(), confirmed: !!confirmed }),
      })
        .then(function (res) {
          if (res.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            showGate("That token was rejected.");
            throw new Error("unauthorized");
          }
          return res.json();
        })
        .then(function (data) {
          status.textContent = "";
          sendBtn.disabled = false;
          handleResponse(message, data);
        })
        .catch(function (err) {
          status.textContent = "";
          sendBtn.disabled = false;
          if (err.message !== "unauthorized") {
            addMessage("agent", "Could not reach the server: " + err.message, "error");
          }
        });
    }

    function handleResponse(originalMessage, data) {
      if (data.status === "SUCCESS" && data.reply) {
        addMessage("agent", data.reply);
        return;
      }
      if (data.status === "ACTION") {
        var action = data.result.action;
        var summary;
        if (data.result.stage === "PLAN" || data.result.stage === "UNDERSTAND") {
          summary = data.result.reason || data.result.status;
          addMessage("agent", summary, "error");
          return;
        }
        summary = "Capability: " + action.capability + "\nTool: " + action.tool + "\nStatus: " + action.action_status + "\nResult: " + action.result + (action.note ? "\nNote: " + action.note : "");
        var el = addMessage("agent", summary, "action");
        if (action.action_status === "PENDING_CONFIRMATION") {
          var confirmRow = document.createElement("div");
          confirmRow.className = "action-confirm";
          var confirmBtn = document.createElement("button");
          confirmBtn.className = "primary";
          confirmBtn.textContent = "Approve & run";
          confirmBtn.addEventListener("click", function () {
            confirmRow.remove();
            addMessage("user", originalMessage + " (approved)");
            send(originalMessage, true);
          });
          var cancelBtn = document.createElement("button");
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", function () {
            confirmRow.remove();
          });
          confirmRow.appendChild(confirmBtn);
          confirmRow.appendChild(cancelBtn);
          el.appendChild(confirmRow);
        }
        return;
      }
      addMessage("agent", (data.status || "ERROR") + (data.reason ? ": " + data.reason : ""), "error");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var message = input.value.trim();
      if (!message) return;
      addMessage("user", message);
      input.value = "";
      input.style.height = "auto";
      send(message, false);
    });
  }

  if (getToken()) {
    showApp();
  } else {
    showGate(null);
  }
})();
