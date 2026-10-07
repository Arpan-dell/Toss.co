// What each Toss plan includes, in one place for the billing page and the website. Add a row when a feature
// ships. Customers are served the same on both plans: this is only what the laundry's dashboard can do.

export type PlanFeature = { name: string; free: boolean | string; pro: boolean | string };

export const PLAN_FEATURES: PlanFeature[] = [
  { name: "Pickups from baskets, Telegram updates for customers", free: true, pro: true },
  { name: "Nearest-driver dispatch", free: true, pro: true },
  { name: "UPI payments and numbered invoices", free: true, pro: true },
  { name: "Live board, orders, customers, fleet", free: true, pro: true },
  { name: "Listed on Find a laundry", free: true, pro: true },
  { name: "Toss basket credit: Toss pays back its share", free: "on renewal", pro: "off each payment" },
  { name: "Toss AI briefing and autopilot", free: false, pro: true },
  { name: "Analytics and forecasts", free: false, pro: true },
  { name: "Download orders to Excel", free: false, pro: true },
];
