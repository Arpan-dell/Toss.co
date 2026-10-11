import { NextResponse } from "next/server";
import { optOut, readUnsubscribeLink } from "@/lib/unsubscribe";

// One-click unsubscribe (RFC 8058): mail apps POST here when someone taps their own "Unsubscribe" button on an
// optional email. A plain visit (GET) goes to the page, which asks first.
export async function POST(request: Request) {
  const u = new URL(request.url);
  const link = readUnsubscribeLink(u.searchParams.get("e") ?? undefined, u.searchParams.get("c") ?? undefined, u.searchParams.get("t") ?? undefined);
  if (!link) return NextResponse.json({ error: "invalid link" }, { status: 400 });
  const ok = await optOut(link.email, [link.category]);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  return NextResponse.redirect(new URL(`/unsubscribe${u.search}`, u.origin));
}
