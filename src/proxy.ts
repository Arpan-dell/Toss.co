import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Pages that need a session (and /laundries, which shows the customer portal when signed in). APIs authenticate themselves (device keys, cron secret, Telegram hash).
  matcher: ["/app/:path*", "/admin/:path*", "/owner/:path*", "/login", "/auth/:path*", "/laundries"],
};
