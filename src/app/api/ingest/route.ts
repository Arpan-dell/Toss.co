import { dispatchEnabled, dispatchOrder } from "@/lib/dispatch/service";
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
    // A brand-new pickup goes straight to the nearest available driver. Dispatch problems never fail
    // the ingest itself: the order is saved, and managers can still assign it from the dashboard.
    const body = res.body as { changed?: boolean; status?: string; id?: string };
    if (res.status === 200 && body.changed && body.status === "PENDING" && body.id && dispatchEnabled()) {
      const dispatch = await dispatchOrder(body.id).catch((err) => {
        console.error("dispatch failed", err);
        return { assigned: false, reason: "dispatch error" };
      });
      return Response.json({ ...res.body, dispatch }, { status: res.status });
    }
    return Response.json(res.body, { status: res.status });
  } catch (err) {
    console.error("ingest failed", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
