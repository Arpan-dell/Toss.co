import type { CookieOptions } from "@supabase/ssr";
import { sessionCookieDomain } from "../site";

// Supabase session cookies hold the access and refresh tokens (and the user's email inside the JWT). They are
// HttpOnly so page JavaScript (and any injected script) can't read them, Secure in production, and SameSite=Lax
// so they still ride along on the top-level redirect back from Google. The browser never needs them: sign-in
// starts on the server (/auth/google) and the live board gets a short-lived access token from the server.
// On tosslaundry.online they're scoped to the parent domain, so a sign-in on app.tosslaundry.online also counts on
// the website (Find a laundry shows the portal); on any other host they stay host-only.
export function sessionCookie(options: CookieOptions = {}, host: string | null = null): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: options.path ?? "/",
    domain: sessionCookieDomain(host),
  };
}
