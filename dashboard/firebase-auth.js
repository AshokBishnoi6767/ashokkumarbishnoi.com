// Shared Firebase Auth bootstrap for both /sign-in and /dashboard — one
// module, loaded by both pages via an absolute path, so there is exactly
// one place that initializes the client SDK and one place that decides
// whether to point it at the local emulator.
//
// The owner's password is entered here and handled entirely by the
// Firebase client SDK (signInWithEmailAndPassword / the Admin SDK's
// createUser during setup) — it is never sent to, logged by, or stored on
// this app's own server, and never touches localStorage.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

window.__ashokAuthReady = (async function bootstrap() {
  const config = await fetch("/api/auth/config").then((r) => r.json());
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
  });
  const auth = getAuth(app);

  // Local dev only — real domains never match this, so production behavior
  // is unaffected.
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    connectAuthEmulator(auth, "http://" + location.hostname + ":9099", { disableWarnings: true });
  }

  return {
    ownerConfigured: config.ownerConfigured,
    // Resolves once with the initial auth state — callers use this to
    // avoid ever rendering a private page before Firebase has actually
    // reported whether someone is signed in.
    waitForInitialState() {
      return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
          unsub();
          resolve(user);
        });
      });
    },
    onChange(cb) {
      return onAuthStateChanged(auth, cb);
    },
    getCurrentUser() {
      return auth.currentUser;
    },
    getIdToken() {
      return auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
    },
    signIn(email, password) {
      return signInWithEmailAndPassword(auth, email, password);
    },
    signOutUser() {
      return signOut(auth);
    },
    resetPassword(email) {
      return sendPasswordResetEmail(auth, email);
    },
  };
})();
