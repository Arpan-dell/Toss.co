import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { attachTelegram } from "@/lib/telegram-link";
import { OIDC_COOKIE, type TelegramIdentity, exchangeCode, getTelegramOidcConfig, verifyIdToken } from "@/lib/telegram-oidc";

// Telegram redirects here with ?code&state after the user approves. We check state against the
// cookie, exchange the code (PKCE + client secret), verify the signed ID token, then link the
// Telegram ID to the signed-in Toss account, attach every order and basket it already owns, and
// store the phone number Telegram verified (when the user chose to share it).
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/app/settings";
    url.search = `?telegram=${result}`;
    const res = NextResponse.redirect(url);
    res.cookies.set(OIDC_COOKIE, "", { path: "/api/telegram", maxAge: 0 });
    return res;
  };

  const session = await getSession();
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const cfg = getTelegramOidcConfig();
  if (!cfg || !isSupabaseConfigured()) return back("not-configured");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("cancelled");

  let saved: { state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(OIDC_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  const code = params.get("code");
  if (!code || !saved.state || !saved.verifier || params.get("state") !== saved.state) return back("invalid");

  let identity: TelegramIdentity;
  try {
    const idToken = await exchangeCode(cfg, {
      code,
      verifier: saved.verifier,
      redirectUri: `${request.nextUrl.origin}/api/telegram/callback`,
    });
    identity = await verifyIdToken(idToken, cfg.clientId);
  } catch (err) {
    console.error("telegram login failed", err);
    return back("invalid");
  }

  return back(await attachTelegram(session.userId, identity.telegramId, identity.phone));
}
