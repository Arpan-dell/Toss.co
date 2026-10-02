import type { CookieOptions } from "@supabase/ssr";

// Supabase session cookies hold the access and refresh tokens (and the user's email inside the JWT). They are
// HttpOnly so page JavaScript (and any injected script) can't read them, Secure in production, and SameSite=Lax
// so they still ride along on the top-level redirect back from Google. The browser never needs them: sign-in
// starts on the server (/auth/google) and the live board gets a short-lived access token from the server.
export function sessionCookie(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: options.path ?? "/" };
}
