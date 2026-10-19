import { createHash, timingSafeEqual } from "node:crypto";
import { nudgeStaleDrivers } from "@/lib/dispatch/service";
import { logError } from "@/lib/log";

// Reminds online drivers whose location stopped updating. Basket pings already run this; point a free
// scheduler (e.g. cron-job.org, every 10 minutes, header "Authorization: Bearer <CRON_SECRET>") here to make
// sure it also runs when no basket is online.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const h = (v: string) => createHash("sha256").update(v).digest();
  if (!secret || !header || !timingSafeEqual(h(header), h(`Bearer ${secret}`))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, reminded: await nudgeStaleDrivers({ force: true }) });
  } catch (err) {
    const ref = logError("location reminders failed", err);
    return Response.json({ error: "Internal error", ref }, { status: 500 });
  }
}
