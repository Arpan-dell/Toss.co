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
  { name: "Supplies stock with low-stock alerts and WhatsApp reorder", free: false, pro: true },
  { name: "Profit per order and per customer", free: false, pro: true },
  { name: "Promised turnaround, \"ready\" notices to customers", free: true, pro: true },
  { name: "Late-order alerts on the live board", free: false, pro: true },
  { name: "Customer ratings and Google review requests", free: "collected", pro: "with insights" },
  { name: "Photo proof at pickup from the driver bot", free: true, pro: true },
  { name: "Whites and coloured clothes bagged and weighed apart, wash queue", free: true, pro: true },
  { name: "Driver pay per pickup and per km, earnings in the driver bot", free: false, pro: true },
  { name: "Business accounts for PGs and hostels, billed monthly", free: false, pro: true },
  { name: "More branches on one dashboard", free: false, pro: "add-on per branch" },
];
