import { NextResponse, type NextRequest } from "next/server";
import { hostRedirect } from "@/lib/site";
import { updateSession } from "@/lib/supabase/proxy";

// Pages that need a session (and /laundries, which shows the customer portal when signed in).
const SESSION = /^\/(app|admin|owner|login|auth|laundries)(\/|$)/;

export async function proxy(request: NextRequest) {
  // the website and the app live on different hosts; send a path that's on the wrong one across
  const { pathname, search } = request.nextUrl;
  const to = hostRedirect(request.headers.get("host"), pathname, search);
  if (to) return NextResponse.redirect(to, 308);

  return SESSION.test(pathname) ? updateSession(request) : NextResponse.next();
}

export const config = {
  // Session pages, plus the pages that may need moving to the other host. APIs authenticate themselves
  // (device keys, cron secret, Telegram hash) and answer on any host.
  matcher: [
    "/",
    "/app/:path*",
    "/admin/:path*",
    "/owner/:path*",
    "/login/:path*",
    "/auth/:path*",
    "/laundries",
    "/reset-password",
    "/invoice/:path*",
    "/r/:path*",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
  ],
};
