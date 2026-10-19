import { locationByToken } from "@/lib/dispatch/service";
import { allow } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

// The driver's route page (/r/<token>) sends the phone's location here about once a minute while it's open,
// so the dashboard and the nearest-driver choice stay current even without Telegram live location.
export async function POST(request: Request) {
  let body: { token?: unknown; lat?: unknown; lng?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { token, lat, lng } = body;
  if (typeof token !== "string" || !/^[a-f0-9]{36}$/.test(token)) return Response.json({ error: "Bad request" }, { status: 400 });
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    return Response.json({ error: "Bad location" }, { status: 400 });
  }
  if (!(await allow("driverLocation", token))) return Response.json({ error: "Too many updates" }, { status: 429 });
  try {
    if (!(await locationByToken(token, lat, lng))) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    const ref = logError("driver location failed", err);
    return Response.json({ error: "Internal error", ref }, { status: 500 });
  }
}
