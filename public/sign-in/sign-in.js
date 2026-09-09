(async function () {
  "use strict";

  const loadingEl = document.getElementById("auth-loading");
  const setupForm = document.getElementById("setup-form");
  const signinForm = document.getElementById("signin-form");
  const resetForm = document.getElementById("reset-form");

  function show(form) {
    [setupForm, signinForm, resetForm].forEach((f) => (f.hidden = f !== form));
    loadingEl.hidden = true;
  }

  function setStatus(id, message, kind) {
    const el = document.getElementById(id);
    el.textContent = message || "";
    el.className = "auth-status" + (kind ? " " + kind : "");
  }

  const authApi = await window.__ashokAuthReady;

  // Never briefly show a form before we actually know the state.
  const initialUser = await authApi.waitForInitialState();
  if (initialUser) {
    location.href = "/dashboard";
    return;
  }

  show(authApi.ownerConfigured ? signinForm : setupForm);

  setupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("setup-email").value.trim();
    const password = document.getElementById("setup-password").value;
    const confirmPassword = document.getElementById("setup-password-confirm").value;
    setStatus("setup-status", "", null);

    if (password !== confirmPassword) {
      setStatus("setup-status", "Passwords do not match.", "error");
      return;
    }
    if (password.length < 6) {
      setStatus("setup-status", "Password must be at least 6 characters.", "error");
      return;
    }

    setStatus("setup-status", "Creating your owner account…", null);
    try {
      const res = await fetch("/api/auth/setup-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("setup-status", body.reason || "Could not create the owner account.", "error");
        return;
      }
      // The account now exists server-side (Admin SDK), but the browser
      // still needs its own client-side session — sign in for real.
      await authApi.signIn(email, password);
      setStatus("setup-status", "Account created. Redirecting…", "ok");
      location.href = "/dashboard";
    } catch (err) {
      setStatus("setup-status", "Something went wrong: " + err.message, "error");
    }
  });

  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;
    setStatus("signin-status", "Signing in…", null);
    try {
      await authApi.signIn(email, password);
      setStatus("signin-status", "Signed in. Redirecting…", "ok");
      location.href = "/dashboard";
    } catch (err) {
      setStatus("signin-status", "Sign-in failed. Check your email and password.", "error");
    }
  });

  document.getElementById("forgot-password-btn").addEventListener("click", () => {
    const prefill = document.getElementById("signin-email").value.trim();
    document.getElementById("reset-email").value = prefill;
    setStatus("reset-status", "", null);
    show(resetForm);
  });

  document.getElementById("back-to-signin-btn").addEventListener("click", () => {
    setStatus("signin-status", "", null);
    show(signinForm);
  });

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reset-email").value.trim();
    setStatus("reset-status", "Sending…", null);
    try {
      await authApi.resetPassword(email);
      // Deliberately the same message regardless of whether the address
      // exists — Firebase's own reset flow, not a custom one, and this
      // avoids confirming which emails have an account.
      setStatus("reset-status", "If that email has an account, a reset link is on its way.", "ok");
    } catch (err) {
      setStatus("reset-status", "If that email has an account, a reset link is on its way.", "ok");
    }
  });
})();
