// Tells the server when a screen failed in someone's browser, so it shows up on the owner's Errors page. Sends only
// the error's name, its message and Next.js's digest (the same reference shown on the error screen) and the page's
// path without any query string; the server removes anything personal. Never throws.
export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const body = JSON.stringify({
      name: error.name,
      message: String(error.message ?? "").slice(0, 300),
      digest: error.digest,
      path: window.location.pathname.slice(0, 120),
    });
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never cause another error */
  }
}
