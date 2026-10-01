import type { Metadata } from "next";
import { RegisterBusinessForm } from "./form";
import { Card, PageTitle } from "@/components/ui";
import { getCustomer, getPlatformSettings } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Register your business" };

export default async function RegisterBusiness() {
  const session = await requireRole("CUSTOMER");
  const [customer, platform] = await Promise.all([getCustomer(session.userId), getPlatformSettings()]);

  return (
    <div className="stagger max-w-xl space-y-6">
      <PageTitle kicker="For laundry businesses">Register your business</PageTitle>
      <Card>
        {customer?.tenantId ? (
          <p className="text-sm text-secondary">
            This account is a customer of a laundry. Sign up with a different email to register your own business.
          </p>
        ) : (
          <div className="space-y-5">
            <ul className="space-y-1.5 text-sm text-secondary">
              <li>✓ Free for {platform.trialDays} days, then ₹{platform.monthlyPrice}/month</li>
              <li>✓ Customers pay you directly by UPI, with no fees taken by Toss</li>
              <li>✓ You get a Business ID to share; customers enter it to connect</li>
            </ul>
            <RegisterBusinessForm />
            <p className="text-xs text-muted">
              This account becomes your manager login. You can change every detail later in Business settings.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
