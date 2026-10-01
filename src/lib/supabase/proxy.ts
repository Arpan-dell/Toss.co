import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request and applies optimistic route guards.
// The authoritative checks are requireRole() in the portal layouts and RLS in Postgres.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Must run immediately after createServerClient: refreshes and verifies the token.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const meta = claims?.app_metadata;
  const role = !claims ? null : meta?.role === "owner" ? "OWNER" : meta?.role === "manager" ? "MANAGER" : "CUSTOMER";
  const home = { OWNER: "/owner", MANAGER: "/admin", CUSTOMER: "/app" } as const;

  const { pathname } = request.nextUrl;
  const redirect = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const r = NextResponse.redirect(url);
    // Keep any refreshed auth cookies on the redirect.
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  const area = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");
  const zone = area("/owner") ? "OWNER" : area("/admin") ? "MANAGER" : area("/app") ? "CUSTOMER" : null;
  if (zone && !role) return redirect("/login");
  if (zone && role && zone !== role) return redirect(home[role]);
  if (pathname === "/login" && role) return redirect(home[role]);

  return response;
}
