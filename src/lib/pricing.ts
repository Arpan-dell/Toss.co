// Subscription pricing for laundry businesses. Mirrors public.subscription_discount() and
// submit_subscription_payment() in migration 0010, so the UPI amount shown equals the amount recorded.

export interface SubscriptionDiscounts {
  discount3m: number; // % off when paying 3–5 months at once
  discount6m: number; // 6–11 months
  discount12m: number; // 12 months
}

export function subscriptionDiscount(d: SubscriptionDiscounts, months: number): number {
  if (months >= 12) return d.discount12m;
  if (months >= 6) return d.discount6m;
  if (months >= 3) return d.discount3m;
  return 0;
}

export function subscriptionQuote(monthlyPrice: number, d: SubscriptionDiscounts, months: number) {
  const pct = subscriptionDiscount(d, months);
  const full = monthlyPrice * months;
  const amount = Math.round((full * (100 - pct)) / 100);
  return { pct, full, amount, saved: full - amount };
}
