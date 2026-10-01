import Link from "next/link";
import { getTenantById } from "@/lib/data";
import { isUsable, planState } from "@/lib/plan";
import { getSession } from "@/lib/session";
import { Card } from "./ui";

// Operational manager pages call this first: when the subscription has lapsed or the business is
// suspended it returns a lock screen instead (Business and Billing stay reachable). Baskets keep
// sending orders in the meantime; nothing is lost.
export async function planGate(): Promise<React.ReactNode | null> {
  const session = await getSession();
  const tenant = await getTenantById(session?.tenantId);
  if (!tenant) {
    return (
      <Card>
        <p className="text-sm text-secondary">This manager account isn&apos;t linked to a business.</p>
      </Card>
    );
  }
  const { state } = planState(tenant);
  if (isUsable(state)) return null;
  return (
    <Card title={state === "SUSPENDED" ? "Business suspended" : "Subscription expired"}>
      <div className="space-y-4 text-sm text-secondary">
        <p>
          {state === "SUSPENDED"
            ? "Toss has suspended this business. Orders from your customers are still being recorded."
            : "Renew your Toss subscription to see pickups, payments and analytics again. Orders from your customers are still being recorded."}
        </p>
        {state !== "SUSPENDED" && (
          <Link href="/admin/billing" className="btn-primary inline-flex rounded-full px-5 py-2.5 text-sm font-medium">
            Renew subscription →
          </Link>
        )}
      </div>
    </Card>
  );
}
