import Link from "next/link";
import { getTenantById } from "@/lib/data";
import { planState, tierOf, type Tier } from "@/lib/plan";
import { getSession } from "@/lib/session";
import { Card } from "./ui";

// Manager pages call these first. planGate(): only a suspended business (or an account with no business) gets a
// lock screen; Free keeps the everyday pages. proGate(): Pro tools show an upgrade card on Free instead. Baskets
// keep sending orders and customers keep being served either way; nothing is lost.

export async function currentTier(): Promise<{ tier: Tier } | null> {
  const session = await getSession();
  const tenant = await getTenantById(session?.tenantId);
  return tenant ? { tier: tierOf(planState(tenant).state) } : null;
}

function NoBusiness() {
  return (
    <Card>
      <p className="text-sm text-secondary">This manager account isn&apos;t linked to a business.</p>
    </Card>
  );
}

function Suspended() {
  return (
    <Card title="Business suspended">
      <p className="text-sm text-secondary">Toss has suspended this business. Orders from your customers are still being recorded. Contact Toss.</p>
    </Card>
  );
}

export async function planGate(): Promise<React.ReactNode | null> {
  const t = await currentTier();
  if (!t) return <NoBusiness />;
  return t.tier === "LOCKED" ? <Suspended /> : null;
}

/** For Pro features: on Free, an upgrade card that says what the feature does. */
export async function proGate(feature: string, pitch: string): Promise<React.ReactNode | null> {
  const t = await currentTier();
  if (!t) return <NoBusiness />;
  if (t.tier === "LOCKED") return <Suspended />;
  if (t.tier === "PRO") return null;
  return (
    <Card title={`${feature} is a Pro feature`}>
      <div className="space-y-4 text-sm text-secondary">
        <p>{pitch}</p>
        <p>
          You&apos;re on <span className="font-medium text-fg">Toss Free</span>: pickups, dispatch, payments, orders, customers and fleet keep
          working. Pro turns on the tools that grow the business.
        </p>
        <Link href="/admin/billing" className="btn-primary inline-flex rounded-full px-5 py-2.5 text-sm font-medium">
          Upgrade to Pro →
        </Link>
      </div>
    </Card>
  );
}
