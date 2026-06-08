"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for offline support and PWA install.
 * This is a client component so it runs in the browser only.
 * Renders nothing — purely side-effectful.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // SW registration is best-effort — never block the app
        });
    }
  }, []);

  return null;
}
