import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTelegramLogin } from "@/lib/telegram";

// Telegram Login Widget redirects here (data-auth-url) with signed user fields in the query string.
// We verify the signature, then link that Telegram ID to the signed-in Toss account and attach
// every order and basket it already owns.
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/app/settings";
    url.search = `?telegram=${result}`;
    return NextResponse.redirect(url);
  };

  const session = await getSession();
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !isSupabaseConfigured()) return back("not-configured");

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const verified = verifyTelegramLogin(params, botToken);
  if (!verified.ok) return back(verified.error === "expired" ? "expired" : "invalid");

  const { error } = await supabaseAdmin().rpc("link_telegram", {
    p_customer: session.userId,
    p_telegram_id: verified.telegramId,
  });
  if (error) {
    if (error.message.includes("telegram_already_linked")) return back("taken");
    console.error("link_telegram failed", error);
    return back("error");
  }
  return back("linked");
}
