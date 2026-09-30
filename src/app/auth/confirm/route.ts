import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for Supabase email links (signup confirmation). Supports both link styles:
// - PKCE:       ?code=…                     (default template, same browser that signed up)
// - token hash: ?token_hash=…&type=email    (custom template, works from any device)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;

  const target = request.nextUrl.clone();
  target.search = "";
  if (ok) {
    target.pathname = "/app";
  } else {
    target.pathname = "/login";
    target.searchParams.set("notice", "link-invalid");
  }
  return NextResponse.redirect(target);
}
