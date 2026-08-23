"use client";

import { useEffect } from "react";

/**
 * Register the service worker, and never let a failure be the learner's problem.
 *
 * If registration fails — an unsupported browser, a locked-down school profile,
 * a blocked scope — the app keeps working online and the offline queue still
 * buffers attempts in IndexedDB. The worker makes the app *open* offline; it is
 * not what makes the work safe.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* Offline shell unavailable. The queue is unaffected. */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
