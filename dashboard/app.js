(function () {
  "use strict";

  var SESSION_KEY = "ashok_agent_session_id";

  var gate = document.getElementById("gate");
  var app = document.getElementById("app");

  // Set once window.__ashokAuthReady resolves, at the bottom of this file.
  // Everything below that needs the current Firebase user/ID token goes
  // through this — never through localStorage, which never holds identity
  // or a password in this app.
  var authApi = null;

  function getSessionId() {
    var id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function redirectToSignIn() {
    location.href = "/sign-in";
  }

  function showApp() {
    gate.style.display = "none";
    app.classList.add("active");
    initApp();
  }

  // Section-scoped refresh callbacks, keyed by nav data-section value.
  // Registered by each section's setup function; invoked every time that
  // nav item is opened so data reflects whatever changed since the app
  // loaded (a new approval, a new audit entry, etc.) — not just a
  // load-once snapshot.
  var sectionRefreshers = {};

  function goToSection(id) {
    var btn = document.querySelector('#nav button[data-section="' + id + '"]');
    if (btn) btn.click();
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function apiFetch(path, options) {
    options = options || {};
    return authApi
      .getIdToken()
      .then(function (token) {
        options.headers = Object.assign({ "Content-Type": "application/json", Authorization: "Bearer " + (token || "") }, options.headers || {});
        return fetch(path, options);
      })
      .then(function (res) {
        if (res.status === 401) {
          redirectToSignIn();
          throw new Error("unauthorized");
        }
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      });
  }

  var appInitialized = false;
  function initApp() {
    if (appInitialized) return;
    appInitialized = true;
    // Register every section's refresh callback BEFORE setupNav() fires its
    // initial click on Home — otherwise the first paint has nothing to call.
    setupAgent();
    setupIntegrations();
    setupSettings();
    setupHome();
    setupApprovals();
    setupActivity();
    setupMemory();
    setupNav();
    refreshApprovalsBadge();
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
        if (sectionRefreshers[btn.dataset.section]) sectionRefreshers[btn.dataset.section]();
      });
    });
    buttons[0].click();
  }

  function refreshApprovalsBadge() {
    apiFetch("/api/approvals")
      .then(function (res) {
        var badge = document.getElementById("approvals-badge");
        var n = res.ok ? res.data.pending.length : 0;
        if (n > 0) {
          badge.textContent = String(n);
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      })
      .catch(function () {});
  }

  function setupHome() {
    function render() {
      var el = document.getElementById("home-status");
      el.innerHTML = "<div class=\"empty-state\">Loading…</div>";
      apiFetch("/api/approvals").then(function (res) {
        if (!res.ok) return;
        var n = res.data.pending.length;
        var html = "";
        if (n > 0) {
          html +=
            '<div class="home-status"><div class="section-eyebrow">Waiting on you</div><div class="count">' +
            n +
            " action" +
            (n === 1 ? "" : "s") +
            ' pending approval</div><a href="#" id="home-goto-approvals">Review approvals →</a></div>';
        }
        html +=
          '<div class="empty-state"><strong>' +
          (n > 0 ? "Nothing else to report." : "Nothing to report yet.") +
          "</strong>Home will summarize what needs your attention as more tools are connected. For now, start with AI Agent." +
          '<div class="note">See Integrations for what is actually connected right now.</div></div>';
        el.innerHTML = html;
        var link = document.getElementById("home-goto-approvals");
        if (link)
          link.addEventListener("click", function (e) {
            e.preventDefault();
            goToSection("approvals");
          });
      });
    }
    sectionRefreshers.home = render;
  }

  function setupSettings() {
    var user = authApi.getCurrentUser();
    document.getElementById("settings-owner-email").textContent = (user && user.email) || "(unknown)";
    document.getElementById("sign-out-btn").addEventListener("click", function () {
      authApi.signOutUser().then(redirectToSignIn);
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
      return apiFetch("/api/ai", {
        method: "POST",
        body: JSON.stringify({ message: message, sessionId: getSessionId(), timezone: timezone(), confirmed: !!confirmed }),
      })
        .then(function (res) {
          status.textContent = "";
          sendBtn.disabled = false;
          handleResponse(message, res.data);
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
      if (data.status === "MEMORY_STORED") {
        addMessage("agent", data.reply, "memory");
        return;
      }
      if (data.status === "CLARIFICATION_NEEDED") {
        addMessage("agent", data.reply, "clarification");
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

  function resultTag(result) {
    var cls = result === "SUCCESS" ? "ok" : result === "UNKNOWN" || result === "RECOVERING" ? "pending" : result === "BLOCKED" || result === "FAILED" ? "bad" : "";
    return '<span class="tag ' + cls + '">' + escapeHtml(result) + "</span>";
  }

  function setupApprovals() {
    var pendingEl = document.getElementById("approvals-pending");
    var historyEl = document.getElementById("approvals-history");

    function decide(approvalId, decision, btn) {
      var card = btn.closest(".approval-card");
      card.querySelectorAll("button").forEach(function (b) {
        b.disabled = true;
      });
      apiFetch("/api/approvals/" + encodeURIComponent(approvalId) + "/decision", {
        method: "POST",
        body: JSON.stringify({ decision: decision }),
      })
        .then(function () {
          render();
          refreshApprovalsBadge();
        })
        .catch(function () {
          card.querySelectorAll("button").forEach(function (b) {
            b.disabled = false;
          });
        });
    }

    function render() {
      pendingEl.innerHTML = "<div class=\"empty-state\">Loading…</div>";
      historyEl.innerHTML = "<div class=\"empty-state\">Loading…</div>";
      apiFetch("/api/approvals").then(function (res) {
        if (!res.ok) {
          pendingEl.innerHTML = '<div class="empty-state">Could not load approvals.</div>';
          historyEl.innerHTML = "";
          return;
        }
        var pending = res.data.pending;
        var history = res.data.history;

        if (pending.length === 0) {
          pendingEl.innerHTML = '<div class="empty-state"><strong>Nothing waiting on you.</strong>Actions that need your explicit approval before they execute will appear here — propose one by asking the Agent to do something with MEDIUM risk or higher.</div>';
        } else {
          pendingEl.innerHTML = pending
            .map(function (a) {
              return (
                '<div class="approval-card" data-approval-id="' +
                escapeHtml(a.approval_id) +
                '"><div class="capability">' +
                escapeHtml(a.capability_id) +
                "</div>" +
                (a.why ? '<div class="why">' + escapeHtml(a.why) + "</div>" : "") +
                '<div class="params">' +
                escapeHtml(JSON.stringify(a.params, null, 2)) +
                "</div>" +
                '<div class="approval-actions"><button class="approve" type="button">Approve &amp; run</button><button class="reject" type="button">Reject</button></div></div>'
              );
            })
            .join("");
          pendingEl.querySelectorAll(".approval-card").forEach(function (card) {
            var id = card.dataset.approvalId;
            card.querySelector(".approve").addEventListener("click", function (e) {
              decide(id, "approve", e.target);
            });
            card.querySelector(".reject").addEventListener("click", function (e) {
              decide(id, "reject", e.target);
            });
          });
        }

        if (history.length === 0) {
          historyEl.innerHTML = '<div class="empty-state">No decisions recorded yet.</div>';
        } else {
          historyEl.innerHTML = history
            .map(function (a) {
              var tagClass = a.status === "APPROVED" ? "ok" : "bad";
              return (
                '<div class="approval-history-row"><span>' +
                escapeHtml(a.capability_id) +
                '</span><span class="tag ' +
                tagClass +
                '">' +
                escapeHtml(a.status) +
                '</span><span class="activity-when">' +
                escapeHtml(a.resolved_at) +
                "</span></div>"
              );
            })
            .join("");
        }
      });
    }

    sectionRefreshers.approvals = render;
  }

  function setupActivity() {
    var el = document.getElementById("activity-list");

    function render() {
      el.innerHTML = "<div class=\"empty-state\">Loading…</div>";
      apiFetch("/api/audit").then(function (res) {
        if (!res.ok) {
          el.innerHTML = '<div class="empty-state">Could not load activity.</div>';
          return;
        }
        var entries = res.data.audit;
        if (entries.length === 0) {
          el.innerHTML = '<div class="empty-state"><strong>Nothing has happened yet.</strong>Every action the Agent attempts — proposed, blocked, executed, verified — will show up here with who requested it, what it used, and the outcome.</div>';
          return;
        }
        el.innerHTML =
          '<div class="activity-list">' +
          entries
            .map(function (e) {
              return (
                '<div class="activity-row"><div class="activity-when">' +
                escapeHtml(e.when) +
                '</div><div class="activity-what">' +
                escapeHtml(e.why || e.capability) +
                '<span class="capability">' +
                escapeHtml(e.capability) +
                (e.tool ? " · " + escapeHtml(e.tool) : "") +
                "</span>" +
                (e.note ? '<div class="activity-note">' + escapeHtml(e.note) + "</div>" : "") +
                '</div><div>' +
                resultTag(e.action_status) +
                '</div><div>' +
                resultTag(e.result) +
                (e.verified ? ' <span class="tag ok">VERIFIED</span>' : "") +
                "</div></div>"
              );
            })
            .join("") +
          "</div>";
      });
    }

    sectionRefreshers.activity = render;
  }

  function setupMemory() {
    var el = document.getElementById("memory-list");

    function render() {
      el.innerHTML = "<div class=\"empty-state\">Loading…</div>";
      apiFetch("/api/memory").then(function (res) {
        if (!res.ok) {
          el.innerHTML = '<div class="empty-state">Could not load memory.</div>';
          return;
        }
        var records = res.data.memory.slice().sort(function (a, b) {
          return a.created_at < b.created_at ? 1 : -1;
        });
        if (records.length === 0) {
          el.innerHTML =
            '<div class="empty-state"><strong>No memory records yet.</strong>Conversations and the audit trail persist to disk and survive a restart. Tell the Agent a preference ("I prefer...") or a decision ("we decided...") and it will appear here — nothing on this page is fabricated.</div>';
          return;
        }
        el.innerHTML = records
          .map(function (r) {
            var supersededTag = r.status === "superseded" ? '<span class="tag">SUPERSEDED</span> ' : "";
            return (
              '<div class="memory-row' +
              (r.status === "superseded" ? " superseded" : "") +
              '" data-memory-class="' +
              escapeHtml(r.memory_class) +
              '" data-memory-id="' +
              escapeHtml(r.memory_id) +
              '"><div class="content">' +
              supersededTag +
              escapeHtml(r.content) +
              '</div><div class="meta">' +
              escapeHtml(r.memory_class) +
              " · " +
              escapeHtml(r.type) +
              " · " +
              escapeHtml(r.truth_state) +
              (r.confidence != null ? " · confidence " + escapeHtml(r.confidence) : "") +
              " · source: " +
              escapeHtml(r.source) +
              (r.source_reference ? " (" + escapeHtml(r.source_reference) + ")" : "") +
              " · " +
              escapeHtml(r.created_at) +
              '</div><button class="forget-btn" type="button">Forget</button></div>'
            );
          })
          .join("");

        el.querySelectorAll(".forget-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var row = btn.closest(".memory-row");
            btn.disabled = true;
            apiFetch("/api/memory/" + encodeURIComponent(row.dataset.memoryClass) + "/" + encodeURIComponent(row.dataset.memoryId), { method: "DELETE" })
              .then(render)
              .catch(function () {
                btn.disabled = false;
              });
          });
        });
      });
    }

    sectionRefreshers.knowledge = render;
  }

  // Boot sequence: never render the private dashboard before Firebase has
  // actually reported an auth state. The gate's "Checking sign-in
  // status…" markup stays on screen for the (typically brief) time this
  // takes — there is no path that shows app content first.
  window.__ashokAuthReady.then(function (api) {
    authApi = api;
    return api.waitForInitialState().then(function (user) {
      if (!user) {
        redirectToSignIn();
        return;
      }
      showApp();
      // If the session ends elsewhere (revoked, signed out in another
      // tab), leave immediately rather than let stale UI sit there.
      api.onChange(function (nextUser) {
        if (!nextUser) redirectToSignIn();
      });
    });
  });
})();
