import type { AssistantRole } from "@/lib/assistant/intents";

// Tossy's guided tours: what each portal page is for, one short step per thing worth knowing. The tour walks page
// by page (it opens each page itself) and points at real things on it.
//
// target:
//   "heading:Text"  the card or section whose heading starts with Text (case-insensitive)
//   "nav:/path"     that page's icon in the bottom bar (computers and tablets; phones use the menu)
//   anything else   a CSS selector, e.g. [data-guide="stats"]
// No target, or one that isn't on screen: the step shows in the middle of the screen instead.
// optional: skip the step when its target isn't there (cards that only show up when there's something in them).
export type TourStep = { path: string; target?: string; optional?: boolean; title: string; text: string };

const MANAGER: TourStep[] = [
  {
    path: "/admin",
    title: "Hi, I'm Tossy!",
    text: "I'm the little basket that runs this place. Let me walk you through your laundry's dashboard. It takes about two minutes, and you can stop any time.",
  },
  { path: "/admin", target: "main h1", title: "Today", text: "This is your home page. Everything happening in your laundry right now shows here, and it updates by itself." },
  { path: "/admin", target: '[aria-labelledby="onboarding-title"]', optional: true, title: "Your setup checklist", text: "These steps get you to your first pickup. Each one has a button that takes you straight there, and the list disappears once everything's done." },
  { path: "/admin", target: "heading:Needs attention", optional: true, title: "Needs attention", text: "Pickups nobody has taken, late orders and other things that need you. If this is empty, all is well." },
  { path: "/admin", target: '[data-guide="stats"]', title: "Today at a glance", text: "Pickups waiting for a driver, drivers on the way, how many baskets are online, and how much customers still owe you." },
  { path: "/admin", target: "heading:Active pickups", title: "Active pickups", text: "Every pickup in progress, with its driver and how long it's been waiting. A full basket books its own pickup and lands here." },
  {
    path: "/admin/orders",
    target: "heading:New pickup",
    title: "Orders and new pickups",
    text: "Every order, with filters by stage. A customer called or walked in? Book a pickup for them here; no basket needed.",
  },
  { path: "/admin/payments", target: "heading:Unpaid pickups", title: "Payments", text: "Who still owes you, and what came in recently. Online payments are confirmed by the payment gateway automatically." },
  { path: "/admin/customers", target: "main h1", title: "Customers", text: "Everyone who uses your laundry: their orders, what they've spent and how to reach them." },
  {
    path: "/admin/fleet",
    target: "heading:Drivers",
    title: "Your drivers",
    text: "See each driver: are they free or busy, where they are, and how many km they drove today, yesterday and this month. Drivers use the Toss Handy bot on Telegram.",
  },
  { path: "/admin/fleet", target: "heading:Baskets", optional: true, title: "Baskets", text: "Your customers' Toss baskets: how full each one is and whether it's online." },
  {
    path: "/admin/accounts",
    target: "main h1",
    title: "Hostels, PGs & offices",
    text: "Collection rounds every few days for hostels, PGs and offices, with one monthly bill. Rounds due together become one trip for the same driver.",
  },
  { path: "/admin/driver-pay", target: "main h1", title: "Driver pay", text: "What each driver has earned, worked out from their trips, so paying them is one look away." },
  { path: "/admin/stock", target: "main h1", title: "Stock", text: "Detergent, softener, bags. Keep count here and see what's running low before it runs out." },
  { path: "/admin/profit", target: "main h1", title: "Profit", text: "What you actually made in the last 30 days, after your running costs, and which customers earn you the most per kg." },
  { path: "/admin/ai", target: "main h1", title: "Toss AI", text: "Your business adviser: busy days coming up, customers drifting away, unpaid bills, and what to do about them next." },
  {
    path: "/admin/settings",
    target: "main h1",
    title: "Settings",
    text: "Set up once, check now and then: your price, how customers pay you, your pickup area, weighing at the door or at the store, and more.",
  },
  { path: "/admin/billing", target: "heading:Your plan", title: "My plan", text: "Your free trial or plan, and paying for it. Paying early adds more days on top, so you never lose what you paid for." },
  {
    path: "/admin",
    target: '[data-guide="assistant"]',
    title: "I'm always here",
    text: "Tap me any time. Ask anything (\"where is Ravi?\", \"aaj kitne orders aaye?\"), or say \"show me around\" to see this tour again.",
  },
];

const CUSTOMER: TourStep[] = [
  {
    path: "/app",
    title: "Hi, I'm Tossy!",
    text: "I'm the little basket that looks after your laundry. Let me show you around. It takes a minute, and you can stop any time.",
  },
  { path: "/app", target: '[aria-labelledby="onboarding-title"]', optional: true, title: "Getting started", text: "A few quick steps to your first pickup. Each one has a button that takes you straight there." },
  { path: "/app", target: "heading:Active pickup", optional: true, title: "Your pickup", text: "Where your laundry is right now: waiting for a driver, on the way, washing, or coming back to you. No basket? Book a pickup right here." },
  { path: "/app", target: "heading:My basket", optional: true, title: "Your basket", text: "How full your Toss basket is. When it reaches your target weight, it books a pickup all by itself." },
  { path: "/app", target: "heading:Invoices due", optional: true, title: "Bills", text: "Anything you owe, with a button to pay online. Payments are confirmed straight away." },
  { path: "/app", target: "heading:Pay automatically", optional: true, title: "Pay automatically", text: "Save a card once and your bills get paid by themselves after each wash. You can switch it off any time." },
  { path: "/app/orders", target: "main h1", title: "My orders", text: "Every wash you've had: weight, price and bills." },
  { path: "/app", target: 'nav:/laundries', optional: true, title: "Find a laundry", text: "Looking for a laundry near you, or moving? Find one on Toss from here." },
  { path: "/app/settings", target: "heading:Telegram", optional: true, title: "Telegram", text: "Link Telegram to get pickup updates and control your basket from your phone with the Toss Control bot." },
  { path: "/app/settings", target: "heading:Laundry preferences", optional: true, title: "Your preferences", text: "Your address, how you like your clothes washed, and your basket's target weight." },
  {
    path: "/app",
    target: '[data-guide="assistant"]',
    title: "I'm always here",
    text: "Tap me any time. Ask \"how full is my basket?\" or \"kitna dena hai?\", or say \"show me around\" to see this tour again.",
  },
];

export const TOURS: Partial<Record<AssistantRole, TourStep[]>> = { MANAGER, CUSTOMER };

/** The tour steps for one role: the whole tour, or just the ones for the page you're on. */
export function tourSteps(role: AssistantRole, scope: "all" | "page", pathname: string): TourStep[] {
  const all = TOURS[role] ?? [];
  if (scope === "all") return all;
  // the page's own steps, without the hello and goodbye (they belong to the full tour)
  const here = all.filter((s, i) => s.path === pathname && i > 0 && i < all.length - 1);
  return here;
}

/**
 * "Show me around", "how do I use this", "yeh page kya hai": a request for the tour. "page" when it's about the
 * page on screen, "all" for the whole thing; null when it's not a tour request at all.
 */
export function tourRequest(raw: string): "all" | "page" | null {
  const t = raw.toLowerCase().replace(/\s+/g, " ").replace(/[?!.]+$/, "").trim();
  if (!t) return null;
  const page =
    /\b(this|current|is|yeh|ye|iss?)\b ?(page|screen)\b/.test(t) && /\b(explain|what|kya|samjha|batao|bata|about|show|guide|help)\b/.test(t);
  // Devanagari isn't a "word" character to \b, so the Hindi patterns go without it
  if (page || /^(explain|what is) (this|the) (page|screen)$/.test(t) || /(यह|ये|इस) (पेज|पन्ना|पन्ने|स्क्रीन)/.test(t)) return "page";
  if (
    /\b(show me around|give me a tour|take me on a tour|start the tour|tour|walk ?through|walk me through|guide me|onboard me)\b/.test(t) ||
    /\bhow (do i|to|can i) use (this|toss|the (site|website|app|dashboard))\b/.test(t) ||
    /\b(kaise use|kaise chalate|kaise chalaye|kaise chalau|samjhao|sikhao|ghumao)\b/.test(t) ||
    /घुमाओ|सिखाओ|समझाओ|कैसे (इस्तेमाल|यूज़|यूज|चलाएं|चलाऊं|चलाते)|टूर/.test(t)
  )
    return "all";
  return null;
}
