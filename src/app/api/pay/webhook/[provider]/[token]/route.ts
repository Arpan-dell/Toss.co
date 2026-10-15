import { handleWebhook } from "@/lib/gateway-payments";
import { logError } from "@/lib/log";

// Razorpay and Stripe call this when a payment succeeds, fails or expires. The token says whose gateway it is
// (or "platform" for Toss's own); the signature, checked against that gateway's webhook secret, says it's genuine.
// The raw body is read as text: the signature covers the exact bytes the gateway sent.
export async function POST(request: Request, { params }: { params: Promise<{ provider: string; token: string }> }) {
  const { provider, token } = await params;
  if ((provider !== "razorpay" && provider !== "stripe") || !/^[a-z0-9]{6,64}$/.test(token)) return new Response(null, { status: 404 });
  try {
    const raw = await request.text();
    if (raw.length > 512_000) return new Response(null, { status: 413 });
    const status = await handleWebhook(provider, token, raw, request.headers);
    return new Response(null, { status });
  } catch (err) {
    logError("payment webhook failed", err instanceof Error ? err.message : err);
    return new Response(null, { status: 500 }); // the gateway will retry
  }
}
