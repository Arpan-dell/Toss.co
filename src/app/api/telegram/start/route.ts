import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { OIDC_COOKIE, buildAuthorizeUrl, createPkce, getTelegramOidcConfig } from "@/lib/telegram-oidc";
import { allow, clientIp } from "@/lib/rate-limit";

// Starts "Log in with Telegram": stores state + PKCE verifier in a short-lived httpOnly cookie,
// then sends the browser to Telegram's authorization page.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.search = "";

  if (!(await getSession())) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!(await allow("oauthStartIp", await clientIp()))) {
    url.pathname = "/app/settings";
    return NextResponse.redirect(url);
  }
  const cfg = getTelegramOidcConfig();
  if (!cfg) {
    url.pathname = "/app/settings";
    url.search = "?telegram=not-configured";
    return NextResponse.redirect(url);
  }

  const pkce = createPkce();
  const redirectUri = `${request.nextUrl.origin}/api/telegram/callback`;
  const res = NextResponse.redirect(buildAuthorizeUrl({ clientId: cfg.clientId, redirectUri, ...pkce }));
  res.cookies.set(OIDC_COOKIE, JSON.stringify({ state: pkce.state, verifier: pkce.verifier }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax", // must survive the top-level redirect back from oauth.telegram.org
    path: "/api/telegram",
    maxAge: 600,
  });
  return res;
}
