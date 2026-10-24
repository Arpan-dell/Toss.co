"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

// Last-resort error screen (the root layout itself failed), so it can't rely on the app's styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f1eee8", color: "#0b1430", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Toss is having trouble right now</h1>
          <p style={{ color: "#3a4566" }}>Please try again in a moment.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#5b6686" }}>Reference {error.digest}</p>}
          <button onClick={() => retry()} style={{ marginTop: 12, padding: "10px 20px", borderRadius: 999, border: 0, background: "#1f5eff", color: "#fff", fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
