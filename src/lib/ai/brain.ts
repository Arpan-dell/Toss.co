import type { AiDecision, Analysis, Candidate } from "./engine";
import type { Insights } from "./insights";

// What the language model is asked, and the shape it must answer in. The model sees only numbers,
// dates and customer codes (no names, phone numbers, emails or addresses), and may only choose among
// the engine's candidate actions; applyDecisions() re-checks whatever it returns.

export interface Briefing {
  headline: string;
  narrative: string;
  forecastNote: string;
  risks: string[];
  opportunities: string[];
}

export interface BrainAnswer extends Briefing {
  decisions: AiDecision[];
}

export interface Report extends Briefing {
  kpis: Analysis["kpis"];
  forecast: Analysis["forecast"];
  health: Analysis["health"];
  by: "ai" | "rules";
  model?: string;
}

// Gemini response schema (OpenAPI subset).
export const BRAIN_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING", description: "One punchy sentence, max 90 characters." },
    narrative: { type: "STRING", description: "3-5 sentences: what happened, why, and what to do next." },
    forecastNote: { type: "STRING", description: "1-2 sentences about the next 7 days." },
    risks: { type: "ARRAY", items: { type: "STRING" }, description: "Up to 3 short risks." },
    opportunities: { type: "ARRAY", items: { type: "STRING" }, description: "Up to 3 short opportunities." },
    decisions: {
      type: "ARRAY",
      description: "One entry per candidate action you want to keep or reject.",
      items: {
        type: "OBJECT",
        properties: {
          candidateId: { type: "STRING" },
          approve: { type: "BOOLEAN" },
          discountPct: { type: "INTEGER", description: "winback_offer only: percent off, within the cap." },
          newPrice: { type: "NUMBER", description: "price_change only: new price per kg in rupees." },
          message: { type: "STRING", description: "Short friendly text sent with the action (max 200 characters)." },
          reason: { type: "STRING", description: "Why, in one sentence, for the manager." },
          priority: { type: "INTEGER", description: "1 = do today, 2 = this week, 3 = nice to have." },
        },
        required: ["candidateId", "approve"],
      },
    },
  },
  required: ["headline", "narrative", "forecastNote", "risks", "opportunities", "decisions"],
} as const;

export const BRAIN_SYSTEM = `You are Toss AI, the operations brain of a laundry pickup business in India that uses smart baskets and its own drivers.
You get the business's numbers and a list of candidate actions computed by a deterministic engine.

Your job:
1. Brief the manager like a sharp COO: what's going well, what needs attention, what to do. Be specific with the numbers given; never invent numbers, names or events.
   Use the analytics: name revenue at risk, the busiest window, any anomaly, money stuck in old invoices, and mention forecast accuracy when it's known.
2. Decide each candidate action: approve the ones worth doing, reject ones that are redundant or unwise. You may personalise:
   - winback_offer: discountPct within the stated cap (bigger for loyal customers, smaller for occasional ones) and a warm one-line message.
   - driver_alert: a motivating one-line message for the drivers.
   - payment_reminder / basket_nudge: a polite one-line message.
   - price_change: newPrice within the stated step and limits, only if the data clearly supports it.
3. In the briefing, refer to customers only by their codes. Messages that customers receive must NEVER contain a customer code or name: speak to them as "you" (e.g. "Your basket is almost full!").
4. Write money in Indian format with ₹ (₹70,470; ₹1,20,000). Plain text only, no markdown, no emojis in the briefing.`;

// What a candidate action looks like to the model: no names, internal IDs, phone numbers, emails or Telegram
// IDs. Customers stay as codes (C-XXXXXX); drivers become "a driver". Decisions are matched back to the full
// candidate by id on our side, so the model never needs the rest.
const PRIVATE_PARAM = /(^|[a-z])(id|Id|ID)$|name|Name|phone|email|telegram|Telegram|chat|Chat|address|Address/;
export function modelSafeCandidate(c: Candidate) {
  const params = Object.fromEntries(Object.entries(c.params ?? {}).filter(([k]) => k === "customerCode" || !PRIVATE_PARAM.test(k)));
  const summary =
    c.type === "set_max_jobs"
      ? `Let a driver carry ${String(c.params?.to)} pickups at once (now ${String(c.params?.from)})`
      : c.label;
  return { id: c.id, type: c.type, summary, params, why: c.reason };
}

export function brainPrompt(
  a: Analysis,
  ctx: { business: string; pricePerKg: number; maxDiscount: number; priceStepPct: number; autopilot: string[]; analytics?: object },
) {
  const facts = {
    business: ctx.business,
    pricePerKg: ctx.pricePerKg,
    kpis: a.kpis,
    healthScore: a.health.score,
    healthParts: a.health.parts,
    forecastNext7Days: a.forecast.map((d) => ({ date: d.date, weekday: d.weekday, expectedOrders: d.expectedOrders, driversNeeded: d.driversNeeded, driversConnected: d.driversConnected })),
    guardrails: { maxDiscountPct: ctx.maxDiscount, maxPriceStepPct: ctx.priceStepPct },
    autopilotRunsAutomatically: ctx.autopilot,
    analytics: ctx.analytics, // segments, revenue at risk, forecast accuracy, aging, areas, drivers, anomalies
  };
  const candidates = a.candidates.map(modelSafeCandidate);
  return `BUSINESS FACTS (JSON):\n${JSON.stringify(facts)}\n\nCANDIDATE ACTIONS (JSON):\n${JSON.stringify(candidates)}\n\nReturn the JSON briefing and your decisions.`;
}

const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;

/** The briefing without a language model: plain, numbers-first. */
export function rulesBriefing(a: Analysis, i?: Insights): Briefing {
  const k = a.kpis;
  const peak = [...a.forecast].sort((x, y) => y.expectedOrders - x.expectedOrders)[0];
  const short = a.forecast.filter((d) => d.driversNeeded > d.driversConnected);
  const risks: string[] = [];
  const opportunities: string[] = [];
  if (k.collectionPct < 90) risks.push(`Only ${k.collectionPct}% of last month's pickups are paid (₹${k.outstanding} outstanding).`);
  if (short.length) risks.push(`${short.length} day(s) this week may need more drivers than are connected.`);
  if (k.growthPct <= -15) risks.push(`Orders are down ${Math.abs(k.growthPct)}% on the previous 30 days.`);
  const winbacks = a.candidates.filter((c) => c.type === "winback_offer").length;
  if (winbacks) opportunities.push(`${winbacks} regular customer(s) are overdue and could be won back with an offer.`);
  if (k.repeatPct < 50 && k.activeCustomers) opportunities.push(`Repeat rate is ${k.repeatPct}%: nudging first-time customers could lift it.`);
  if (k.growthPct >= 15) opportunities.push(`Demand is growing (${pct(k.growthPct)}): a good time to add a driver.`);
  if (i) {
    const old = i.money.aging[2].amount + i.money.aging[3].amount;
    if (i.customers.revenueAtRisk > 0) risks.unshift(`₹${i.customers.revenueAtRisk.toLocaleString("en-IN")} a year is at risk from ${i.customers.segments["At risk"]} customer(s) ordering later than usual.`);
    if (old > 0) risks.push(`₹${old.toLocaleString("en-IN")} has been unpaid for over two weeks.`);
    const anomaly = i.anomalies[i.anomalies.length - 1];
    if (anomaly) risks.push(`${anomaly.weekday} ${anomaly.date.slice(5)} had ${anomaly.actual} pickups against a usual ${anomaly.expected}: an unusual ${anomaly.direction}.`);
    if (i.heatmap.peak) opportunities.unshift(`${i.heatmap.peak.share}% of pickups come ${i.heatmap.peak.weekday} ${i.heatmap.peak.from}:00–${i.heatmap.peak.to}:00: have drivers ready then.`);
    if (i.areas[0] && i.areas[0].share >= 30) opportunities.push(`${i.areas[0].area} brings ${i.areas[0].share}% of pickups: a local promotion there pays off most.`);
  }

  return {
    headline: k.orders30 ? `${k.orders30} pickups and ₹${k.revenue30} in the last 30 days (${pct(k.growthPct)})` : "No pickups yet: the forecast starts once orders come in",
    narrative: k.orders30
      ? `You handled ${k.orders30} pickups (${k.kg30} kg) in the last 30 days, ${pct(k.growthPct)} versus the 30 days before. ${k.collectionPct}% of completed pickups are paid and pickups take about ${k.avgPickupHrs} hours on average. ${k.activeCustomers} customers ordered recently and ${k.repeatPct}% of customers are repeat customers.`
      : "Once your baskets start placing orders, Toss AI forecasts busy days, spots customers who stop ordering and chases unpaid invoices for you.",
    forecastNote:
      peak && peak.expectedOrders > 0
        ? `Busiest day ahead: ${peak.weekday} ${peak.date.slice(5)} with about ${Math.round(peak.expectedOrders)} pickups.${
            i?.forecast.accuracyPct != null ? ` This forecast was ${i.forecast.accuracyPct}% accurate over the last two weeks.` : ""
          }${i ? ` Next 30 days: about ₹${i.forecast.next30.revenue.toLocaleString("en-IN")} in revenue.` : ""}`
        : "Not enough history yet for a forecast.",
    risks: risks.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
  };
}

/** Keeps the model's free text short and plain, whatever it returns. */
export function cleanBriefing(b: Partial<Briefing> | undefined, fallback: Briefing): Briefing {
  const s = (v: unknown, max: number, fb: string) => (typeof v === "string" && v.trim() ? v.replace(/[<>*#`]/g, "").trim().slice(0, max) : fb);
  const list = (v: unknown, fb: string[]) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, 3).map((x: string) => s(x, 200, "")) : fb);
  return {
    headline: s(b?.headline, 120, fallback.headline),
    narrative: s(b?.narrative, 900, fallback.narrative),
    forecastNote: s(b?.forecastNote, 300, fallback.forecastNote),
    risks: list(b?.risks, fallback.risks),
    opportunities: list(b?.opportunities, fallback.opportunities),
  };
}

export const ASK_SYSTEM = `You are Toss AI, the operations assistant for a laundry pickup business in India. Answer the manager's question using ONLY the business data provided. If the data doesn't answer it, say so and suggest what would. Be concise (under 120 words), specific with numbers, plain text, ₹ for money, and refer to customers only by their codes.`;
