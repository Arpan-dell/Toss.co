"use client";

import { useState } from "react";
import { GoogleLogo } from "@phosphor-icons/react";

// "Continue with Google": /auth/google sends the browser to Google, which returns to /auth/callback. Signing in and
// signing up are the same tap; a new Google account becomes a customer and adds its mobile number after.
const DEFAULT_CLASS =
  "flex w-full items-center justify-center gap-2.5 rounded-full border border-border-strong bg-surface-solid px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-ink/[0.04] disabled:opacity-70";

export function GoogleButton({ next, className = DEFAULT_CLASS }: { next?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const go = async () => {
    setBusy(true);
    setError(undefined);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    // Until the Google provider is switched on in Supabase, say so instead of landing on an error page.
    const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json() as Promise<{ external?: { google?: boolean } }>)
      .catch(() => undefined);
    if (settings && !settings.external?.google) {
      setBusy(false);
      return setError("Google sign-in isn't switched on yet. Use your email for now.");
    }
    // The sign-in starts on the server so its PKCE cookie is HttpOnly. /auth/google is a route handler that
    // redirects to Google, so this has to be a full page navigation, not a client-side route change.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  };

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={className}
      >
        <GoogleLogo size={18} weight="bold" aria-hidden />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
