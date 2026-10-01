import { routeByToken } from "@/lib/dispatch/service";

// "My route" link sent to drivers: /r/<secret token>. Recomputed on every tap, so it always shows the
// driver's current stops (including pickups added since the message was sent), ending at the store.
export async function GET(_request: Request, { params }: RouteContext<"/r/[token]">) {
  const { token } = await params;
  if (!/^[a-f0-9]{36}$/.test(token)) return new Response("Not found", { status: 404 });

  const r = await routeByToken(token);
  if (!r) return new Response("Not found", { status: 404 });
  if (r.url) return Response.redirect(r.url, 302);

  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>No pickups</title>
<body style="font-family:system-ui;background:#050507;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0">
<p style="text-align:center">🧺 No open pickups right now.<br><small style="color:#7c7c88">New ones arrive in your Telegram bot.</small></p></body>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
