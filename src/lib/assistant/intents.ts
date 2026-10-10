// The assistant's quick router: plain rules that recognise the common requests instantly, with no AI call. Shared
// by the browser (theme and password are handled on the device, so a typed password never leaves it) and the
// server (everything else). Anything these rules don't recognise goes to the AI router on the server.

export type AssistantRole = "CUSTOMER" | "MANAGER" | "OWNER";

export type Intent =
  | { tool: "theme"; mode: "dark" | "light" | "toggle" }
  | { tool: "password"; newPassword?: string }
  | { tool: "go"; href: string; label: string }
  | { tool: "overview" }
  | { tool: "orders"; filter: "active" | "unpaid" | "recent" | "waiting" | "delivery" }
  | { tool: "order"; number: number }
  | { tool: "driver"; name: string }
  | { tool: "drivers" }
  | { tool: "attention" }
  | { tool: "basket" }
  | { tool: "credit" }
  | { tool: "help"; question: string };

/** The pages each role may be sent to, with the words people use for them. */
export const PAGES: Record<AssistantRole, { href: string; label: string; words: string[] }[]> = {
  CUSTOMER: [
    { href: "/app", label: "Overview", words: ["home", "overview", "dashboard"] },
    { href: "/app/orders", label: "Order history", words: ["order history", "orders", "history", "past orders", "invoices", "bills"] },
    { href: "/laundries", label: "Find a laundry", words: ["find a laundry", "laundries", "change laundry", "switch laundry"] },
    { href: "/app/settings", label: "Settings", words: ["settings", "profile", "account"] },
  ],
  MANAGER: [
    { href: "/admin", label: "Live board", words: ["live board", "dashboard", "home", "board"] },
    { href: "/admin/orders", label: "Orders", words: ["orders", "order list", "pickups"] },
    { href: "/admin/payments", label: "Payments", words: ["payments", "unpaid", "dues", "collections"] },
    { href: "/admin/customers", label: "Customers", words: ["customers", "clients"] },
    { href: "/admin/fleet", label: "Fleet", words: ["fleet", "drivers", "baskets", "devices"] },
    { href: "/admin/driver-pay", label: "Driver pay", words: ["driver pay", "salary", "salaries", "wages"] },
    { href: "/admin/stock", label: "Supplies", words: ["supplies", "stock", "inventory", "detergent"] },
    { href: "/admin/profit", label: "Profit", words: ["profit", "earnings", "revenue", "income"] },
    { href: "/admin/ai", label: "Toss AI", words: ["toss ai", "ai", "briefing", "insights"] },
    { href: "/admin/analytics", label: "Analytics", words: ["analytics", "charts", "trends"] },
    { href: "/admin/ratings", label: "Ratings", words: ["ratings", "reviews", "feedback"] },
    { href: "/admin/accounts", label: "Business accounts", words: ["business accounts", "accounts", "pg", "hostel"] },
    { href: "/admin/branches", label: "Branches", words: ["branches", "branch"] },
    { href: "/admin/business", label: "Business details", words: ["business details", "business", "store", "prices", "price"] },
    { href: "/admin/billing", label: "Billing", words: ["billing", "subscription", "plan", "pro"] },
    { href: "/admin/settings", label: "Settings", words: ["settings"] },
  ],
  OWNER: [
    { href: "/owner", label: "Businesses", words: ["businesses", "laundries", "dashboard", "home"] },
    { href: "/owner/payments", label: "Subscription payments", words: ["subscription payments", "payments", "subscriptions"] },
    { href: "/owner/credits", label: "Basket credits", words: ["basket credits", "credits", "credit"] },
    { href: "/owner/settings", label: "Plan & UPI", words: ["plan", "upi", "settings", "pricing"] },
  ],
};

const has = (t: string, ...re: RegExp[]) => re.some((r) => r.test(t));

/** "change my password to Abc@1234" → "Abc@1234" (kept on the device; prefills the secure form). */
export function newPasswordFrom(text: string): string | undefined {
  const m = text.match(/\bpass(?:word|code)?\b.*?\b(?:to|as|into|=)\s*["'“]?(\S+?)["'”]?\s*$/i);
  return m?.[1];
}

export const isPasswordRequest = (text: string) => /\b(pass ?word|passcode)\b/i.test(text) && /\b(change|set|reset|update|new|replace|forgot|modify)\b/i.test(text);

export function matchIntent(raw: string, role: AssistantRole): Intent | null {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  // theme
  if (has(t, /\b(dark|night)\s*(mode|theme)?\b/) && has(t, /\b(switch|turn|change|make|set|enable|go|use|dark mode|night mode)\b/)) return { tool: "theme", mode: "dark" };
  if (has(t, /\b(light|day|white)\s*(mode|theme)\b/, /\b(switch|turn|change|set|go) (to )?light\b/)) return { tool: "theme", mode: "light" };
  if (has(t, /\b(switch|change|toggle) (the )?(theme|mode|colou?rs)\b/)) return { tool: "theme", mode: "toggle" };

  // password (the browser normally catches this first, so the password itself never travels)
  if (isPasswordRequest(raw)) return { tool: "password", newPassword: newPasswordFrom(raw) };

  // one order by number: "order 104", "#104"
  const num = t.match(/(?:order|pickup|#)\s*#?\s*(\d{2,7})\b/);
  if (num) return { tool: "order", number: Number(num[1]) };

  if (role === "MANAGER") {
    // where is a driver: "where is ravi", "ravi's location", "locate vikram"
    const where = t.match(/\bwhere(?:'s| is| are)\s+(?:the\s+)?(?:driver\s+)?([a-z][a-z .'-]{1,40}?)(?:\s+(?:now|right now|currently|at the moment|today))?\s*\??$/);
    const locate = t.match(/\b(?:locate|track|find|location of|position of)\s+(?:the\s+)?(?:driver\s+)?([a-z][a-z .'-]{1,40}?)\s*\??$/);
    const poss = t.match(/^([a-z][a-z .'-]{1,40}?)'?s?\s+(?:location|position)\b/);
    const name = (where?.[1] ?? locate?.[1] ?? poss?.[1])?.trim();
    // "my drivers", "all drivers", "everyone" are the whole list, not a driver called that
    if (name && !/\b(drivers?|everyone|everybody|them)\b/.test(name) && !/^(my|the|all|our|every|it)\b/.test(name)) return { tool: "driver", name };
    if (has(t, /\b(all |my |list )?drivers\b/, /\bwho is (on duty|available|online)\b/)) return { tool: "drivers" };
    if (has(t, /\b(attention|problems?|issues?|wrong|urgent|alerts?)\b/)) return { tool: "attention" };
    if (has(t, /\b(waiting|unassigned|no driver)\b/)) return { tool: "orders", filter: "waiting" };
    if (has(t, /\b(deliver(y|ies)|out for delivery|going back)\b/)) return { tool: "orders", filter: "delivery" };
  }

  if (has(t, /\b(unpaid|owe|dues?|pending payments?|not paid|outstanding|to pay)\b/)) return { tool: "orders", filter: "unpaid" };
  if (role === "CUSTOMER" && has(t, /\b(basket|how full|weight|fill)\b/)) return { tool: "basket" };
  if (role === "CUSTOMER" && has(t, /\b(credit|balance|wallet)\b/)) return { tool: "credit" };
  if (has(t, /\b(active|current|ongoing|in progress|open) (orders?|pickups?)\b/, /\bmy (pickup|order)\b/)) return { tool: "orders", filter: "active" };
  if (has(t, /\b(recent|last|latest|past) (orders?|pickups?)\b/)) return { tool: "orders", filter: "recent" };
  if (has(t, /\b(summary|overview|status|how('s| is) (my |the )?(business|day|it going)|today|tell me (everything|about)|details|report)\b/)) return { tool: "overview" };

  // go to a page: "open payments", "take me to fleet", "go to settings"
  const nav = t.match(/\b(?:open|go to|take me to|show me the|show|navigate to)\s+(?:the\s+|my\s+)?(.+?)(?:\s+page)?\s*$/);
  if (nav) {
    const want = nav[1];
    const hit = PAGES[role].find((p) => p.words.some((w) => want === w || want.startsWith(w)));
    if (hit) return { tool: "go", href: hit.href, label: hit.label };
  }
  return null;
}
