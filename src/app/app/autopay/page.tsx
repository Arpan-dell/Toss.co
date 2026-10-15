import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { finishCardSetup } from "@/lib/gateway-payments";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Automatic payments", robots: { index: false, follow: false } };

// Back from Stripe's card page. Toss asks Stripe what was saved (the URL alone proves nothing).
export default async function AutopayReturn({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const session = await requireRole("CUSTOMER");
  const { session: id } = await searchParams;
  const ok = typeof id === "string" && /^cs_[A-Za-z0-9_]+$/.test(id) ? await finishCardSetup(id, session.userId).catch(() => false) : false;
  return (
    <div className="stagger mx-auto w-full max-w-lg space-y-6">
      <PageTitle kicker="Payments">{ok ? "Automatic payments are on" : "Card not saved"}</PageTitle>
      <Card>
        <p className="text-sm text-secondary">
          {ok
            ? "Your card is saved with your laundry's Stripe account. Each bill is now paid automatically when your laundry is ready, and you get a receipt."
            : "Stripe didn't confirm a saved card. Nothing was charged. You can try again from your dashboard."}
        </p>
        <Link href="/app" className="btn-primary mt-5 inline-flex rounded-full px-5 py-2 text-sm font-medium">
          Back to your dashboard
        </Link>
      </Card>
    </div>
  );
}
