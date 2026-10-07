// What each Toss plan includes, in one place for the billing page and the website. Add a row when a feature
// ships. Customers are served the same on both plans (pickups, payments, ready notices, delivery back): this is
// only what the laundry's dashboard and drivers can do. Free runs the basics; Pro saves time, money and customers.

export type PlanFeature = { name: string; free: boolean | string; pro: boolean | string };

export const PLAN_FEATURES: PlanFeature[] = [
  // the basics: on both plans
  { name: "Pickups from baskets, Telegram updates for customers", free: true, pro: true },
  { name: "Nearest-driver dispatch and delivery back to the customer", free: true, pro: true },
  { name: "UPI payments and numbered invoices", free: true, pro: true },
  { name: "Drivers on the driver bot", free: "up to 2", pro: "unlimited" },
  { name: "Order history", free: "last 60 days", pro: "everything" },
  { name: "Needs attention: problems and fixes on the live board", free: "basics", pro: "every alert" },
  { name: "Listed on Find a laundry", free: true, pro: true },
  { name: "Toss basket credit: Toss pays back its share", free: "on renewal", pro: "off each payment" },
  // Pro: save time
  { name: "Late-order alerts, overdue bills, low stock and offline baskets", free: false, pro: true },
  { name: "Toss AI briefing and autopilot", free: false, pro: true },
  { name: "Download orders to Excel", free: false, pro: true },
  { name: "Whites and coloured clothes bagged and weighed apart", free: false, pro: true },
  // Pro: protect yourself
  { name: "Photo proof at pickup", free: false, pro: true },
  { name: "Handover codes at delivery, cash collected at the door", free: false, pro: true },
  // Pro: make more money
  { name: "Win-back offers that bring quiet customers back", free: false, pro: true },
  { name: "Customer ratings and Google review requests", free: false, pro: true },
  { name: "Profit per order and per customer", free: false, pro: true },
  { name: "Supplies stock with low-stock alerts and WhatsApp reorder", free: false, pro: true },
  { name: "Driver pay: per trip or salary, earnings in the driver bot", free: false, pro: true },
  { name: "Analytics and forecasts", free: false, pro: true },
  { name: "Business accounts for PGs and hostels, billed monthly", free: false, pro: true },
  { name: "More branches on one dashboard", free: false, pro: "add-on per branch" },
];
