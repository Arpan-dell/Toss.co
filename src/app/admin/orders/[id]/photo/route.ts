import { NextResponse } from "next/server";
import { tg } from "@/lib/telegram-api";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// The bag photo a driver sent at pickup (proof of pickup). Telegram keeps the image; we keep its file id and
// stream it through here so the bot token never reaches the browser. The read goes through the manager's own
// session, so RLS only finds orders of their business.
export async function GET(_request: Request, ctx: RouteContext<"/admin/orders/[id]/photo">) {
  await requireRole("MANAGER");
  const { id: raw } = await ctx.params;
  const id = raw.includes("%") ? decodeURIComponent(raw) : raw;
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("pickup_photo_file_id").eq("id", id).maybeSingle();
  const fileId = data?.pickup_photo_file_id as string | undefined;
  const token = process.env.TELEGRAM_DRIVER_BOT_TOKEN;
  if (!fileId || !token) return new NextResponse("No photo", { status: 404 });

  try {
    const file = await tg<{ file_path?: string }>(token, "getFile", { file_id: fileId });
    if (!file.file_path) return new NextResponse("No photo", { status: 404 });
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok || !res.body) return new NextResponse("Photo unavailable", { status: 502 });
    return new NextResponse(res.body, {
      headers: {
        "content-type": res.headers.get("content-type")?.startsWith("image/") ? res.headers.get("content-type")! : "image/jpeg",
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Photo unavailable", { status: 502 });
  }
}
