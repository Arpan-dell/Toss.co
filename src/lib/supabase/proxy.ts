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
  const role = claims?.app_metadata?.role === "manager" ? "MANAGER" : claims ? "CUSTOMER" : null;

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

  const inCustomer = pathname === "/app" || pathname.startsWith("/app/");
  const inManager = pathname === "/admin" || pathname.startsWith("/admin/");
  if ((inCustomer || inManager) && !role) return redirect("/login");
  if (inManager && role !== "MANAGER") return redirect("/app");
  if (inCustomer && role === "MANAGER") return redirect("/admin");
  if (pathname === "/login" && role) return redirect(role === "MANAGER" ? "/admin" : "/app");

  return response;
}
