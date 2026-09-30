import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";

// Daily Vercel Cron (see vercel.json). Free Supabase projects pause after a week without
// activity; a firmware v1 basket only calls in when an order happens, so we ping daily.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabaseAdmin().from("tenants").select("id").limit(1);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
