import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allow, clientIp } from "@/lib/rate-limit";

// Starts "Continue with Google" on the server, so the PKCE verifier lands in an HttpOnly cookie (set by the
// Supabase server client) instead of being written by page JavaScript. Google then returns to /auth/callback.
export async function GET(request: NextRequest) {
  const callback = new URL("/auth/callback", request.nextUrl.origin);
  const next = request.nextUrl.searchParams.get("next");
  if (next && /^\/laundries(\?[\w=&%.-]*)?$/.test(next)) callback.searchParams.set("next", next);

  if (!(await allow("oauthStartIp", await clientIp()))) {
    const back = new URL("/login", request.nextUrl.origin);
    back.searchParams.set("notice", "slow-down");
    return NextResponse.redirect(back);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) {
    const back = new URL("/login", request.nextUrl.origin);
    back.searchParams.set("notice", "google-failed");
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(data.url);
}
