import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { refreshIntent } from "@/lib/gateway-payments";
import { requireRole } from "@/lib/session";
import { StatusPoller } from "./status-poller";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

// Where the gateway sends the customer back. The address proves nothing: the status shown is what the gateway
// confirmed to Toss (by webhook, or when Toss asks it directly), never anything in the URL.
export default async function PaymentReturn({ params }: { params: Promise<{ intent: string }> }) {
  const session = await requireRole("CUSTOMER");
  const { intent } = await params;
  const r = await refreshIntent(intent, { customerId: session.userId });
  if (!r) notFound();

  return (
    <div className="stagger mx-auto w-full max-w-lg space-y-6">
      <PageTitle kicker="Payment">
        {r.status === "paid" ? "Payment received" : r.status === "created" ? "Checking your payment…" : "Payment not completed"}
      </PageTitle>
      <Card>
        {r.status === "paid" ? (
          <p className="text-sm text-secondary">
            Your laundry has your payment. Your invoice is on its way by email and in Telegram.
          </p>
        ) : r.status === "created" ? (
          <>
            <p className="text-sm text-secondary">
              We&apos;re waiting for the payment gateway to confirm it. This usually takes a few seconds; you can leave this page, it&apos;ll still
              be marked paid.
            </p>
            <StatusPoller intent={intent} />
          </>
        ) : r.status === "mismatch" ? (
          <p className="text-sm text-secondary">The amount paid didn&apos;t match the bill. Your laundry will check it and contact you.</p>
        ) : (
          <p className="text-sm text-secondary">The payment didn&apos;t go through, and you haven&apos;t been charged. You can try again from your dashboard.</p>
        )}
        <Link href="/app" className="btn-primary mt-5 inline-flex rounded-full px-5 py-2 text-sm font-medium">
          Back to your dashboard
        </Link>
      </Card>
    </div>
  );
}
