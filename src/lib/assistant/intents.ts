// The assistant's quick router: plain rules that recognise the common requests instantly, with no AI call. Shared
// by the browser (theme and password are handled on the device, so a typed password never leaves it) and the
// server (everything else). Anything these rules don't recognise goes to the AI router on the server.

export type AssistantRole = "CUSTOMER" | "MANAGER" | "OWNER";

export type Intent =
  | { tool: "theme"; mode: "dark" | "light" | "toggle" | "status" }
  | { tool: "now" }
  | { tool: "password"; newPassword?: string }
  | { tool: "go"; href: string; label: string }
  | { tool: "overview" }
  | { tool: "orders"; filter: "active" | "unpaid" | "recent" | "waiting" | "delivery" }
  | { tool: "order"; number: number }
  | { tool: "driver"; name: string }
  | { tool: "drivers" }
  | { tool: "distance"; who: string; period: Period }
  | { tool: "area"; op: "show" | "set" | "change"; km?: number }
  | { tool: "attention" }
  | { tool: "basket" }
  | { tool: "credit" }
  | { tool: "help"; question: string }
  | { tool: "analyze"; question: string }
  | { tool: "money"; period: Period }
  | { tool: "trial"; op: "extend" | "end"; business: string; days?: number; confirmed?: boolean };

/** A span of time in plain words: "today", "this week" (since Monday), "last month", "last 10 days". */
export type Period = { key: "today" | "yesterday" | "week" | "lastweek" | "month" | "lastmonth" | "days"; days?: number };

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
  if (m) return m[1];
  // misspelt ("pasword to …", "passwrd as …"): the last word after "to"/"as"/"=", if the request is about a password
  if (!isPasswordRequest(understand(text))) return undefined;
  return text.match(/(?:\bto|\bas|=)\s*["'“]?(\S+?)["'”]?\s*$/i)?.[1];
}

export const isPasswordRequest = (text: string) => /\b(pass ?word|passcode)\b/i.test(text) && /\b(change|set|reset|update|new|replace|forgot|modify)\b/i.test(text);

// General questions ("how do I…", "why…", "what does … mean") go to the AI even when they mention a data word:
// "how do I add drivers" is not a request for the driver list.
/** The period a message talks about; 30 days when it doesn't say. */
export function periodFrom(t: string): Period {
  const m = t.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/);
  if (m) return { key: "days", days: Math.min(365, Number(m[1])) };
  if (/\byesterday\b|\bkal\b/.test(t)) return { key: "yesterday" };
  if (/\btoday\b|\baaj\b/.test(t)) return { key: "today" };
  if (/\b(last|previous|pichhle|pichle) (week|hafte|hafta)\b/.test(t)) return { key: "lastweek" };
  if (/\b(this|current|is) (week|hafte|hafta)\b|\bweekly\b|\bweek\b/.test(t)) return { key: "week" };
  if (/\b(last|previous|pichhle|pichle) (month|mahine|mahina)\b/.test(t)) return { key: "lastmonth" };
  if (/\b(this|current|is) (month|mahine|mahina)\b|\bmonthly\b|\bmonth\b/.test(t)) return { key: "month" };
  if (/\b(last|past) year\b|\byearly\b/.test(t)) return { key: "days", days: 365 };
  return { key: "days", days: 30 };
}

const MONEY = /\b(profit|profits|revenue|earnings|earned|earn|income|sales|turnover|kamai|munafa|money made|made money|costs?|expenses?|spent|spend|spending)\b/;

// Asking for a judgement ("should I add a driver", "are they overworked", "is it worth it"): the analysis answers.
const ADVICE = /\b(should|worth|overwork\w*|over ?loaded|idle|enough|too (many|few|much|little)|hire|recommend\w*|advice|advise|better|compare|growing|grow|improve|increase|reduce|why)\b/;
const GENERAL = /^(how (do|does|can|to|should|would)|why|explain|what (does|is a|is an|happens|do i do|should i)|can i|could i|should i|is it possible|what if)\b/;

/** "Today is Saturday, 11 October 2026. It's 2:35 pm in India." */
export function nowText(at = new Date()): string {
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(at);
  return `Today is ${day}. It's ${time} in India.`;
}

export function matchIntent(raw: string, role: AssistantRole): Intent | null {
  const t = raw.toLowerCase().replace(/\s+/g, " ").replace(/[?!.]+$/, "").trim();
  if (!t) return null;

  // theme: which one am I in; set it (needs a verb, or just "dark mode" on its own)
  if (has(t, /\b(which|what)( is)?( the)? (mode|theme)\b/, /\bam i (in|on|using) (dark|light|night|day)\b/, /\bis (it|this) (dark|light) (mode|theme)\b/, /\b(current|my) (mode|theme)\b/)) return { tool: "theme", mode: "status" };
  if (has(t, /\b(switch|turn|change|make|set|enable|go|use|put|want)\b.*\b(dark|night)\b/, /^(dark|night) (mode|theme)( please| on)?$/)) return { tool: "theme", mode: "dark" };
  if (has(t, /\b(switch|turn|change|make|set|enable|go|use|put|want)\b.*\b(light|day|white) (mode|theme)\b/, /\b(switch|turn|change|set|go) (to |back to )?light\b/, /^(light|day) (mode|theme)( please| on)?$/)) return { tool: "theme", mode: "light" };
  if (has(t, /\b(switch|change|toggle) (the )?(theme|mode|colou?rs)\b/)) return { tool: "theme", mode: "toggle" };

  // password (the browser normally catches this first, so the password itself never travels)
  if (isPasswordRequest(raw)) return { tool: "password", newPassword: newPasswordFrom(raw) };

  // owner: "extend Fresh's trial by 10 days", "end the trial for B-E2ZRFP"
  if (role === "OWNER") {
    const trial = trialIntent(t);
    if (trial) return trial;
  }

  // date and time
  if (has(t, /\b(what|which|tell me)\b.*\b(date|day|time)\b/, /^(date|time|today'?s date)( today| now)?$/, /\bwhat day is (it|today)\b/) && !has(t, /\b(pickup|order|delivery|ready)\b/)) return { tool: "now" };

  // one order by number: "order 104", "#104"
  const num = t.match(/(?:order|pickup|#)\s*#?\s*(\d{2,7})\b/);
  if (num) return { tool: "order", number: Number(num[1]) };

  if (role === "MANAGER") {
    // pickup area: "decrease my area of work by 1 km", "set my radius to 5 km", "what is my service area"
    const area = areaIntent(t);
    if (area) return area;
    // kilometres driven on jobs: "distance travelled by arpan this month", "how many km did ravi drive today"
    if (/\b(distance|kms?|kilomet\w*|travell?ed|travel|drove|driven|covered|mileage)\b/.test(t) && !/\bhow far (is|are)\b/.test(t)) {
      return { tool: "distance", who: t, period: periodFrom(t) };
    }
  }

  if (role === "MANAGER") {
    // where is a driver: "where is ravi", "ravi's location", "locate vikram"
    const where = t.match(/\bwhere(?:'s| is| are)\s+(?:the\s+)?(?:driver\s+)?([a-z][a-z .'-]{1,40}?)(?:\s+(?:now|right now|currently|at the moment|today))?$/);
    const locate = t.match(/\b(?:locate|track|location of|position of)\s+(?:the\s+)?(?:driver\s+)?([a-z][a-z .'-]{1,40}?)$/);
    const poss = t.match(/^([a-z][a-z .'-]{1,40}?)'?s?\s+(?:location|position)\b/);
    const name = (where?.[1] ?? locate?.[1] ?? poss?.[1])?.trim();
    // "my drivers", "all drivers", "everyone" are the whole list, not a driver called that
    if (name && !/\b(drivers?|everyone|everybody|them|my pickup|my order)\b/.test(name) && !/^(my|the|all|our|every|it|you|i)\b/.test(name)) return { tool: "driver", name };
  }

  // everything below answers from data; a general question, or one asking for judgement, goes to the AI instead
  if (GENERAL.test(t) || ADVICE.test(t)) return null;

  // money for a period: "profit this week", "revenue today", "how much did I spend this month"
  if ((role === "MANAGER" || role === "CUSTOMER") && MONEY.test(t) && !/^(open|go to|take me to|navigate to)\b/.test(t)) return { tool: "money", period: periodFrom(t) };

  if (role === "MANAGER" && has(t, /^(show |list |see )?(me )?(all |my |the )?drivers( list| status)?$/, /\b(list|show)( me)?( all| my| the)? drivers\b/, /\bwhere are (my|the|all) drivers\b/, /\bwho is (on duty|available|online|working)\b/)) return { tool: "drivers" };

  if (role === "MANAGER") {
    if (has(t, /\b(what|anything|something)\b.*\bneeds? (my )?attention\b/, /^needs? attention$/, /\bany (problems?|issues?|alerts?)\b/, /\bwhat('s| is) (wrong|going wrong)\b/)) return { tool: "attention" };
    if (has(t, /\b(orders?|pickups?) waiting\b/, /\bwaiting for (a )?driver\b/, /\bunassigned\b/)) return { tool: "orders", filter: "waiting" };
    if (has(t, /\bout for delivery\b/, /\b(orders?|pickups?) (out|on the way back)\b/, /^(show |my |all )?deliveries( now| today)?$/)) return { tool: "orders", filter: "delivery" };
  }
  if (has(t, /\b(unpaid|not paid|outstanding)\b/, /\bwhat do i owe\b/, /\bhow much (do i owe|is (pending|due|unpaid|left to pay))\b/, /\bpending payments?\b/, /^(my )?(dues|bills to pay)$/)) return { tool: "orders", filter: "unpaid" };
  if (role === "CUSTOMER" && has(t, /\bhow full\b/, /\bbasket('?s)? (weight|status|level)\b/, /\bhow much (is )?in my basket\b/, /\bmy basket\b$/)) return { tool: "basket" };
  if (role === "CUSTOMER" && has(t, /\b(my|how much) (basket )?credit\b/, /\bcredit (left|balance)\b/, /\bwallet balance\b/)) return { tool: "credit" };
  if (has(t, /\b(active|current|ongoing|open) (orders?|pickups?)\b/, /\bwhere is my (pickup|order|laundry|clothes)\b/, /\bmy (pickup|order) (status|now)\b/)) return { tool: "orders", filter: "active" };
  if (has(t, /\b(recent|last|latest|past) (orders?|pickups?)\b/, /^(my )?(orders|pickups)$/)) return { tool: "orders", filter: "recent" };
  if (has(t, /\b(summary|overview|report)\b/, /\bhow('s| is) (my |the )?(business|day|it going)\b/, /\btoday'?s (summary|report|status|business|numbers|sales)\b/, /\btell me everything\b/, /\b(business|account) status\b/, /\bhow are things\b/)) return { tool: "overview" };

  // go to a page: "open payments", "take me to fleet", "go to settings"
  const nav = t.match(/\b(?:open|go to|take me to|show me the|navigate to)\s+(?:the\s+|my\s+)?(.+?)(?:\s+page)?$/);
  if (nav) {
    const want = nav[1];
    const hit = PAGES[role].find((p) => p.words.some((w) => want === w || want.startsWith(w)));
    if (hit) return { tool: "go", href: hit.href, label: hit.label };
  }
  return null;
}

// ---------- manager: the pickup area around the store ----------
const AREA = /\b(area|radius|range|zone|coverage|service area|pickup area|delivery area|ilaka|ilaaka)\b/;
const SHRINK = /\b(decrease|reduce|shrink|lower|cut|smaller|less|kam|ghatao|ghata)\b/;
const GROW = /\b(increase|expand|extend|grow|raise|bigger|more|wider|badha\w*|zyada)\b/;

/** "decrease my area of work by 1 km" → change by -1; "set my radius to 5 km" → 5; "what's my area" → show. */
export function areaIntent(t: string): Intent | null {
  if (!AREA.test(t) || /\b(driver|order|basket|password|theme)\b/.test(t)) return null;
  const n = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:km|kms|kilomet\w*)?\b/);
  const km = n ? Math.round(Number(n[1])) : undefined;
  const asking = GENERAL.test(t);
  const shrink = SHRINK.test(t), grow = GROW.test(t);
  if (!asking && km != null && (shrink || grow) && shrink !== grow && /\bby\b/.test(t)) return { tool: "area", op: "change", km: shrink ? -km : km };
  if (!asking && km != null && /\b(set|make|change|to|keep|rakho|kar do|karo)\b/.test(t) && !shrink && !grow) return { tool: "area", op: "set", km };
  if (!asking && km != null && (shrink || grow) && shrink !== grow) return { tool: "area", op: "set", km };
  if (!asking && km == null && (shrink || grow) && shrink !== grow) return { tool: "area", op: "change", km: shrink ? -1 : 1 };
  return { tool: "area", op: "show" };
}

// ---------- owner: change a business's free trial ----------
const TRIAL_FILLER =
  /\b(?:yes|confirm|please|now|immediately|right away|today|the|a|an|free|trials?|period|for|of|to|by|on|end|stop|cancel|finish|close|expire|terminate|extend|increase|add|give|lengthen|more|longer|prolong|its|their|business|laundry|it|days?|weeks?|months?)\b/g;

/** "extend Fresh's trial by 2 weeks" → extend Fresh by 14 days; "yes, end the trial for Fresh (B-E2ZRFP)" → end, confirmed. */
export function trialIntent(t: string): Intent | null {
  if (!/\btrials?\b/.test(t) || /^(how|why|what|when|can|should|does|do|is|will)\b/.test(t)) return null;
  const end = /\b(end|stop|cancel|finish|close|expire|terminate)\b/.test(t);
  const extend = /\b(extend|increase|add|give|lengthen|more|longer|prolong)\b/.test(t);
  if (end === extend) return null; // neither, or both: not a clear command
  const n = t.match(/\b(\d{1,3})\s*(days?|weeks?|months?)\b/);
  const days = n ? Number(n[1]) * (n[2].startsWith("week") ? 7 : n[2].startsWith("month") ? 30 : 1) : 7;
  const code = t.match(/\bb-[a-z0-9]{6}\b/)?.[0];
  const business =
    code ??
    t
      .replace(/\b\d{1,3}\s*(?:days?|weeks?|months?)\b/g, " ")
      .replace(/'s\b/g, " ")
      .replace(TRIAL_FILLER, " ")
      .replace(/[^a-z0-9 &-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return end ? { tool: "trial", op: "end", business, confirmed: /^(yes|confirm)\b/.test(t) } : { tool: "trial", op: "extend", business, days };
}

// ---------- "Did you mean": spelling, Hinglish, suggestions ----------
// Many laundry managers type in Hinglish or quick, misspelt English. Before giving up on a message, the router
// rewrites common Hinglish phrasings into plain English and fixes typos against the words the assistant knows
// (plus, for managers, their drivers' names), then shows the corrected question as "Did you mean: …".

const VOCAB = [
  "switch", "change", "turn", "dark", "light", "mode", "theme", "password", "where", "driver", "drivers", "location",
  "locate", "track", "order", "orders", "pickup", "pickups", "unpaid", "payment", "payments", "pending", "summary",
  "today", "attention", "problems", "issues", "basket", "credit", "balance", "full", "weight", "active", "recent",
  "delivery", "deliveries", "waiting", "open", "settings", "profit", "fleet", "customers", "supplies", "stock",
  "billing", "branches", "ratings", "analytics", "business", "overview", "owe", "show", "status", "available",
  "online", "report", "platform", "subscription", "trial", "extend", "end", "credits", "history", "account", "everything", "please", "about",
  "bills", "dues", "outstanding", "current", "latest", "right", "what", "needs", "tell", "with", "from", "have",
  "much", "many", "list", "all", "now", "how", "my", "is", "are", "the", "to", "me",
];

// Hinglish → English, most specific first. Applied to lower-cased text.
const HINGLISH: [RegExp, string][] = [
  [/\b([a-z]+)\s+(?:abhi\s+)?(?:kaha|kahan|kidhar|kaha pe|kahan par)\s*(?:hai|he|h|hain)?\b/, "where is $1"],
  [/\b(?:kaha|kahan|kidhar)\s+(?:hai|he|h)\s+([a-z]+)\b/, "where is $1"],
  [/\b(?:sab|saare|sare|sabhi)\s+drivers?\b.*\b(?:kaha|kahan|kidhar)\b/, "where are my drivers"],
  [/\b(?:aaj|aj)\s+(?:ka|ki|ke)?\s*(?:hisaab|hisab|summary|report|kaam|business)\b/, "today's summary"],
  [/\b(?:kitna|kitne|kitni)\s+(?:paisa|paise|payment|rupay|rupaye)?\s*(?:baaki|baki|bakaya|pending|dena|dene)\b/, "what is unpaid"],
  [/\b(?:baaki|baki|bakaya)\s+(?:paisa|paise|payment|bill|bills)\b/, "unpaid bills"],
  [/\b(?:dark|kala|andhera)\s+(?:mode|theme)?\s*(?:kar do|kardo|karo|kar|chalu karo|chalu|lagao|on)\b/, "switch to dark mode"],
  [/\b(?:light|safed|ujala)\s+(?:mode|theme)?\s*(?:kar do|kardo|karo|kar|chalu karo|chalu|lagao|on)\b/, "switch to light mode"],
  [/\bpassword\s+(?:badal do|badlo|badalna|change kar do|change karo|change karna)\b/, "change password"],
  [/\b(?:kya|kyaa)\s+(?:problem|dikkat|gadbad|issue)\b|\b(?:problem|dikkat|gadbad)\s+(?:kya|kaun)\b/, "what needs attention"],
  [/\b(?:mera|meri|mere)\s+(?:basket|tokri)\s+(?:kitna|kitni|kitne)\s+(?:bhara|bhari|full)\b/, "how full is my basket"],
  [/\b(?:order|pickup)\s+(?:dikha do|dikhao|batao)\b/, "show my orders"],
  [/\b(\d{1,3})\s*din\b/, "$1 days"],
  [/\b(?:bulao|bula do|bula lo|bulaao|call karo|call kar do|phone karo|phone lagao)\b/, "call"],
  [/\b(?:usko|unko|unhe)\b/, ""],
  [/\b(?:badha do|badhao|badha de|badha dijiye|aur de do)\b/, "extend"],
  [/\b(?:khatam|khtm|band)\s+(?:kar do|kardo|karo|kar de|kar dijiye)\b/, "end"],
];

export function fromHinglish(text: string): string {
  let t = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [re, en] of HINGLISH) t = t.replace(re, en);
  return t;
}

// Typo distance where swapping two neighbouring letters ("drak", "rvai") counts as one mistake, like a slip.
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Fixes typos word by word against the assistant's words (and any extra names). Leaves numbers and unknowns. */
export function correctSpelling(text: string, extra: string[] = []): string {
  const words = [...new Set([...VOCAB, ...extra.map((w) => w.toLowerCase())])];
  return text
    .split(/(\s+)/)
    .map((tok) => {
      const m = tok.match(/^([a-z']+)([?.!,]*)$/i);
      if (!m) return tok;
      const w = m[1].toLowerCase();
      if (w.length < 3 || w.includes("'") || words.includes(w)) return tok;
      const limit = w.length <= 5 ? 1 : 2;
      let best = "";
      let bestD = limit + 1;
      for (const cand of words) {
        const d = distance(w, cand);
        if (d < bestD || (d === bestD && best && Math.abs(cand.length - w.length) < Math.abs(best.length - w.length))) [best, bestD] = [cand, d];
      }
      return best && bestD <= limit ? best + m[2] : tok;
    })
    .join("");
}

/** Hinglish + typo fixes in one go. */
export const understand = (text: string, extra: string[] = []) => correctSpelling(fromHinglish(text), extra);

/** True when the corrected text says something different from what was typed (worth a "Did you mean"). */
export const differs = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() !== b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const EXAMPLES: Record<AssistantRole, string[]> = {
  CUSTOMER: ["How full is my basket?", "Where is my pickup?", "What do I owe?", "How much credit do I have?", "Show my recent orders", "Switch to dark mode", "Change my password"],
  MANAGER: ["Today's summary", "What needs attention?", "Where are my drivers?", "Km driven by drivers this month", "What is my pickup area?", "Show unpaid bills", "Orders waiting for a driver", "Orders out for delivery", "Open payments", "Switch to dark mode", "Change my password"],
  OWNER: ["Platform summary", "Pending subscription payments", "Extend a trial by 7 days", "Open basket credits", "Switch to dark mode", "Change my password"],
};

/** The closest example questions, for "Did you mean" buttons when nothing matched. */
export function suggestions(text: string, role: AssistantRole, max = 3): string[] {
  const words = new Set(understand(text).split(/[^a-z]+/).filter((w) => w.length > 2));
  const score = (q: string) => q.toLowerCase().split(/[^a-z]+/).filter((w) => words.has(w)).length;
  const ranked = EXAMPLES[role].map((q) => [q, score(q)] as const).sort((a, b) => b[1] - a[1]);
  const hits = ranked.filter(([, s]) => s > 0).map(([q]) => q);
  return (hits.length ? hits : EXAMPLES[role]).slice(0, max);
}
