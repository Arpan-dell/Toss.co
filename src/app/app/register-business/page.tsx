import type { Metadata } from "next";
import { headers } from "next/headers";
import { RegisterBusinessForm } from "./form";
import { Card, PageTitle } from "@/components/ui";
import { getCustomer, getPlatformSettings } from "@/lib/data";
import { subscriptionFormat } from "@/lib/region-format";
import { detectCountry } from "@/lib/regions";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Register your business" };

export default async function RegisterBusiness() {
  const session = await requireRole("CUSTOMER");
  const [customer, platform, h] = await Promise.all([getCustomer(session.userId), getPlatformSettings(), headers()]);
  // Vercel tells us the visitor's country; the form starts there (they can pick another)
  const country = detectCountry(h.get("x-vercel-ip-country"), h.get("accept-language"));
  const india = country.code === "IN";
  const sub = subscriptionFormat({ currency: india ? "INR" : "USD" });

  return (
    <div className="stagger mx-auto w-full max-w-xl space-y-6">
      <PageTitle kicker="For laundry businesses">Register your business</PageTitle>
      <Card>
        {customer?.tenantId ? (
          <p className="text-sm text-secondary">
            This account is a customer of a laundry. Sign up with a different email to register your own business.
          </p>
        ) : (
          <div className="space-y-5">
            <ul className="space-y-1.5 text-sm text-secondary">
              <li>
                ✓ Free for {platform.trialDays} days, then {sub.money(india ? platform.monthlyPrice : platform.usdMonthlyPrice)}/month
                {india ? "" : " (billed in US dollars)"}
              </li>
              <li>
                ✓ Customers pay you directly{india ? " by UPI" : " (PayPal, bank transfer, Venmo, Pix and more, depending on your country)"}, with no
                fees taken by Toss
              </li>
              <li>✓ You get a Business ID to share; customers enter it to connect</li>
            </ul>
            <RegisterBusinessForm detected={country.code} />
            <p className="text-xs text-muted">
              This account becomes your manager login. You can change every detail later in Business settings.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
