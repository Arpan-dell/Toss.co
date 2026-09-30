import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic route guard. The authoritative check is requireRole() in each portal layout.
const SESSION_COOKIE = "sl_demo_session";

export function proxy(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  let role: string | undefined;
  try {
    role = raw ? JSON.parse(raw).role : undefined;
  } catch {
    role = undefined;
  }

  const { pathname } = request.nextUrl;
  if (!role) return NextResponse.redirect(new URL("/login", request.url));
  if (pathname.startsWith("/admin") && role !== "MANAGER") return NextResponse.redirect(new URL("/app", request.url));
  if (pathname.startsWith("/app") && role !== "CUSTOMER") return NextResponse.redirect(new URL("/admin", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
