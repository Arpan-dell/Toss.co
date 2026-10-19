"use server";

import { geminiEnabled, geminiJson } from "../ai/gemini";
import { differs, matchIntent, PAGES, suggestions, understand, type AssistantRole, type Intent } from "../assistant/intents";
import { CHIPS, runIntent, type AssistantReply } from "../assistant/tools";
import { ABOUT_TOSS } from "../assistant/about";
import { listDrivers } from "../data";
import { logError } from "../log";
import { allow } from "../rate-limit";
import { getSession } from "../session";

// The in-app assistant. Recognised requests are answered by plain rules with no AI call; anything else goes to the
// free Gemini model, which only picks which tool to run (or answers a general "how does Toss work" question). The
// AI sees the user's own words and nothing else: replies are built from the database by our code (assistant/tools),
// so names, phones, addresses and locations never leave our servers, and every number is exact.



type Turn = { role: "user" | "assistant"; text: string };

export async function askAssistant(message: string, history: Turn[] = []): Promise<AssistantReply> {
  const session = await getSession();
  if (!session) return { text: "Please sign in again." };
  const role = session.role as AssistantRole;
  const text = message.trim().slice(0, 500);
  if (!text) return { text: "Ask me anything about your account.", chips: [...CHIPS[role]] };
  if (!(await allow("assistant", session.userId))) return { text: "That's a lot of questions at once. Give me a minute and try again." };

  try {
    // 1. as typed; 2. Hinglish and typos fixed (managers' driver names count as known words); 3. the AI, which
    // also rewrites the question in plain English. When we answered a corrected question, say which one,
    // like a search engine's "Did you mean".
    let intent = matchIntent(text, role);
    let understood: string | undefined;
    if (!intent) {
      const names = role === "MANAGER" ? (await listDrivers().catch(() => [])).flatMap((d) => d.name.split(/\s+/)) : [];
      const fixed = understand(text, names);
      if (differs(text, fixed)) {
        intent = matchIntent(fixed, role);
        if (intent) understood = fixed;
      }
    }
    if (!intent) {
      const ai = await aiRoute(text, history, role);
      intent = ai?.intent ?? null;
      if (intent && ai?.rephrased && differs(text, ai.rephrased)) understood = ai.rephrased;
    }
    // nothing matched: any sensible question still gets an answer (from the account's numbers or general knowledge)
    if (!intent && geminiEnabled() && /[a-z\u0900-\u097f]{2,}/i.test(text) && text.split(/\s+/).length >= 2) intent = { tool: "analyze", question: text };
    if (!intent) return { text: "Sorry, I didn't get that. Did you mean:", chips: suggestions(text, role) };
    if (intent.tool === "analyze" && !intent.question) intent = { tool: "analyze", question: text };
    const reply = await runIntent(intent, session);
    return understood ? { ...reply, understood: tidy(understood) } : reply;
  } catch (err) {
    logError("assistant failed", err instanceof Error ? err.message : err);
    return { text: "Something went wrong on my side. Try again in a moment." };
  }
}

const TOOLS: Record<AssistantRole, string> = {
  CUSTOMER: `money (how much I spent; set period), overview (everything about my account), basket (how full the basket is), credit (basket credit), orders (filter: active | unpaid | recent), order (number), go (page), theme (mode), password, analyze (a question that needs judgement or an explanation from their numbers: why a bill is higher, should I, is it worth, compare, trends), help (how the app works, how to do something, what a feature means)`,
  MANAGER: `money (profit, revenue, earnings, costs or sales; set period), overview (today's summary of the business), attention (the live list of problems: only when they ask what is wrong or what needs attention), orders (filter: active | waiting | unpaid | recent | delivery), order (number), driver (name: where a driver is, or to call them), drivers (list of drivers and their status), distance (kilometres driven by a driver or all drivers on their jobs; set name if one driver, and period), area (the pickup or service area radius around the store), go (page), theme (mode), password, analyze (any question that needs judgement, advice, a comparison or an explanation from the business numbers: should I hire or add a driver, are drivers overworked or idle, is business growing, busiest days or hours, why are pickups late, how to earn more, pricing), help (how the app works, how to do something, what a feature or term means)`,
  OWNER: `overview (platform summary), orders (filter: unpaid = subscription payments to check), go (page), theme (mode), password, analyze (questions that need judgement from the numbers: which business is growing or shrinking, who might stop paying), help (how the app works)`,
};

// "where is ravi" → "Where is Ravi?" for the "Did you mean" line
function tidy(q: string): string {
  const t = q.trim().replace(/\s+/g, " ");
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[?.!]$/.test(s) ? s : /^(where|what|how|who|when|which|is|are|do|does|can|show|tell)\b/i.test(s) ? `${s}?` : s;
}

async function aiRoute(text: string, history: Turn[], role: AssistantRole): Promise<{ intent: Intent | null; rephrased?: string } | null> {
  if (!geminiEnabled()) return null;
  const pages = PAGES[role].map((p) => p.label).join(", ");
  const recent = history.slice(-4).filter((t) => t.role === "user").map((t) => `User earlier: ${t.text.slice(0, 200)}`).join("\n");
  const { data } = await geminiJson<{ tool: string; rephrased?: string; name?: string; number?: number; filter?: string; page?: string; mode?: string; answer?: string; period?: string; days?: number }>({
    system: `You route requests in the Toss app's assistant for a ${role.toLowerCase()} account in India. People often write in Hindi, Hinglish or quick, misspelt English: understand them, and put their request in "rephrased" as one short, correct, simple English sentence (keep names and numbers exactly). Answer "help" questions in simple English. Pick exactly one tool: ${TOOLS[role]}. When unsure, or when the question needs thinking about their numbers, pick "analyze"; for general knowledge questions pick "help". Use "go" ONLY when they explicitly ask to open, go to or see a page; when they ask for a number or a fact (like "profit this week"), use a data tool, never "go". For "go", set page to one of: ${pages}. For "money", set period to one of: today, yesterday, week, lastweek, month, lastmonth, days (and days = how many). For "help", write a short, friendly answer (at most 5 sentences, no markdown) in "answer". Use these facts about Toss: ${ABOUT_TOSS} For general questions (laundry care, running a business, technology) you may use general knowledge. Never invent numbers or details about this account: the tools fetch those, so pick "analyze" or a data tool instead.`,
    prompt: `${recent ? `${recent}\n` : ""}User: ${text}`,
    schema: {
      type: "object",
      properties: {
        tool: { type: "string", enum: ["money", "overview", "basket", "credit", "orders", "order", "driver", "drivers", "distance", "area", "attention", "go", "theme", "password", "analyze", "help"] },
        period: { type: "string", enum: ["today", "yesterday", "week", "lastweek", "month", "lastmonth", "days"] },
        days: { type: "integer" },
        rephrased: { type: "string" },
        name: { type: "string" },
        number: { type: "integer" },
        filter: { type: "string", enum: ["active", "unpaid", "recent", "waiting", "delivery"] },
        page: { type: "string" },
        mode: { type: "string", enum: ["dark", "light", "toggle"] },
        answer: { type: "string" },
      },
      required: ["tool", "rephrased"],
    },
    temperature: 0.1,
    timeoutMs: 12_000,
  });
  const allowed = new Set(TOOLS[role].split(/,\s*/).map((t) => t.split(" ")[0]));
  const rephrased = data.rephrased?.trim().slice(0, 200) || undefined;
  return { intent: allowed.has(data.tool) ? toIntent(data, role) : null, rephrased };
}

function toIntent(data: { tool: string; rephrased?: string; name?: string; number?: number; filter?: string; page?: string; mode?: string; answer?: string; period?: string; days?: number }, role: AssistantRole): Intent | null {
  switch (data.tool) {
    case "help":
      return { tool: "help", question: data.answer?.trim() || "I'm not sure about that one." };
    case "analyze":
      return { tool: "analyze", question: data.rephrased?.trim() || "" };
    case "money": {
      const keys = ["today", "yesterday", "week", "lastweek", "month", "lastmonth", "days"] as const;
      const key = keys.find((k) => k === data.period) ?? "days";
      return { tool: "money", period: key === "days" ? { key, days: Math.min(365, Math.max(1, data.days ?? 30)) } : { key } };
    }
    case "go": {
      const want = (data.page ?? "").toLowerCase();
      const hit = PAGES[role].find((p) => p.label.toLowerCase() === want) ?? PAGES[role].find((p) => p.words.some((w) => want.includes(w)));
      return hit ? { tool: "go", href: hit.href, label: hit.label } : null;
    }
    case "theme":
      return { tool: "theme", mode: data.mode === "light" ? "light" : data.mode === "dark" ? "dark" : "toggle" };
    case "password":
      return { tool: "password" };
    case "driver":
      return data.name ? { tool: "driver", name: data.name } : { tool: "drivers" };
    case "distance": {
      const keys = ["today", "yesterday", "week", "lastweek", "month", "lastmonth", "days"] as const;
      const key = keys.find((k) => k === data.period) ?? "month";
      return { tool: "distance", who: (data.name ?? "").toLowerCase(), period: key === "days" ? { key, days: Math.min(365, Math.max(1, data.days ?? 30)) } : { key } };
    }
    case "area":
      // changing the area only from a clear typed command (the rules above), never from the AI's guess
      return { tool: "area", op: "show" };
    case "order":
      return data.number ? { tool: "order", number: data.number } : { tool: "orders", filter: "recent" };
    case "orders": {
      const f = data.filter;
      return { tool: "orders", filter: f === "unpaid" || f === "active" || f === "waiting" || f === "delivery" ? f : "recent" };
    }
    default:
      return { tool: data.tool as "overview" | "basket" | "credit" | "drivers" | "attention" } as Intent;
  }
}
