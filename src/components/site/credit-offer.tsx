import Link from "next/link";
import { Gift } from "@phosphor-icons/react/dist/ssr";
import type { PublicPlan } from "@/lib/data";

// The basket's laundry credit, as a badge with its small print, shown in the order section. Numbers come from the
// owner's settings (platform_settings), so the badge and the terms always agree. Renders nothing without a credit.
export function CreditOffer({ plan, className = "" }: { plan: PublicPlan | null; className?: string }) {
  if (!plan || plan.basketCredit <= 0) return null;
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  return (
    <div className={className}>
      <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">
        <Gift size={16} weight="fill" aria-hidden />
        {inr(plan.basketCredit)} laundry credit with every basket
      </p>
      <CreditSmallPrint plan={plan} className="mt-2" />
    </div>
  );
}

function CreditSmallPrint({ plan, className = "" }: { plan: PublicPlan | null; className?: string }) {
  if (!plan || plan.basketCredit <= 0) return null;
  const rules = [
    plan.creditPerKg > 0 && `comes off your pickups at ₹${plan.creditPerKg.toLocaleString("en-IN")}/kg`,
    plan.creditMaxPct > 0 && `up to ${plan.creditMaxPct}% of a bill`,
    plan.creditValidDays > 0 && `valid ${plan.creditValidDays} days`,
  ].filter(Boolean);
  return (
    <p className={`text-xs text-muted ${className}`}>
      {rules.length > 0 && <>{rules.join(", ").replace(/^./, (c) => c.toUpperCase())}. </>}
      <Link href="/terms#basket-credit" className="underline underline-offset-2 hover:text-fg">
        T&amp;C apply
      </Link>
    </p>
  );
}
