import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { finishCardSetup } from "@/lib/gateway-payments";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Automatic payments", robots: { index: false, follow: false } };

// Back from Stripe's card page (?session=cs_…) or Razorpay's mandate page (?razorpay_invoice_id=inv_…). Toss asks
// the gateway what was saved (the URL alone proves nothing).
export default async function AutopayReturn({ searchParams }: { searchParams: Promise<{ session?: string; razorpay_invoice_id?: string }> }) {
  const session = await requireRole("CUSTOMER");
  const q = await searchParams;
  const id = typeof q.session === "string" && /^cs_[A-Za-z0-9_]+$/.test(q.session) ? q.session : typeof q.razorpay_invoice_id === "string" && /^inv_[A-Za-z0-9]+$/.test(q.razorpay_invoice_id) ? q.razorpay_invoice_id : null;
  const ok = id ? await finishCardSetup(id, session.userId).catch(() => false) : false;
  return (
    <div className="stagger mx-auto w-full max-w-lg space-y-6">
      <PageTitle kicker="Payments">{ok ? "Automatic payments are on" : "Card not saved"}</PageTitle>
      <Card>
        <p className="text-sm text-secondary">
          {ok
            ? "Your card is saved with your laundry's payment account. Each bill is now paid automatically when your laundry is ready, and you get a receipt."
            : "The payment page didn't confirm a saved card yet. If you just finished, refresh in a moment; otherwise try again from your dashboard."}
        </p>
        <Link href="/app" className="btn-primary mt-5 inline-flex rounded-full px-5 py-2 text-sm font-medium">
          Back to your dashboard
        </Link>
      </Card>
    </div>
  );
}
