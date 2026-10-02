import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where Google (via Supabase) sends people back after "Continue with Google". The code is exchanged for a
// session, then everyone lands on their own home: owners, managers, or customers (who may have come from the
// laundry directory). A first-time Google account becomes a customer, like any new sign-up.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";
  const target = request.nextUrl.clone();
  target.search = "";

  const supabase = await createClient();
  const { data, error } = code ? await supabase.auth.exchangeCodeForSession(code) : { data: null, error: true };
  if (error || !data?.user) {
    target.pathname = "/login";
    target.searchParams.set("notice", "google-failed");
    return NextResponse.redirect(target);
  }

  const role = data.user.app_metadata?.role;
  if (role === "owner") target.pathname = "/owner";
  else if (role === "manager") target.pathname = "/admin";
  else if (/^\/laundries(\?[\w=&%.-]*)?$/.test(next)) return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  else target.pathname = "/app";
  return NextResponse.redirect(target);
}
