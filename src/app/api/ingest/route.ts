import { handleIngest } from "@/lib/ingest/handle";
import { SupabaseStore } from "@/lib/ingest/supabase-store";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";

// Device ingest endpoint. Called by the Apps Script bridge (firmware v1) and firmware v2.
// Auth: `x-device-key` header, either the bridge key or the device's own key.
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.DEVICE_BRIDGE_KEY) {
    return Response.json({ error: "Ingest not configured" }, { status: 503 });
  }

  try {
    const res = await handleIngest(
      { method: "POST", deviceKey: request.headers.get("x-device-key"), bodyText: await request.text() },
      new SupabaseStore(supabaseAdmin()),
      {
        bridgeKey: process.env.DEVICE_BRIDGE_KEY,
        defaultPricePerKg: Number(process.env.DEFAULT_PRICE_PER_KG ?? 80),
      },
    );
    return Response.json(res.body, { status: res.status });
  } catch (err) {
    console.error("ingest failed", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
