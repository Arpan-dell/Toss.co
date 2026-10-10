"use server";

import { geminiEnabled, geminiJson } from "../ai/gemini";
import { differs, matchIntent, PAGES, suggestions, understand, type AssistantRole, type Intent } from "../assistant/intents";
import { CHIPS, runIntent, type AssistantReply } from "../assistant/tools";
import { listDrivers } from "../data";
import { logError } from "../log";
import { allow } from "../rate-limit";
import { getSession } from "../session";

// The in-app assistant. Recognised requests are answered by plain rules with no AI call; anything else goes to the
// free Gemini model, which only picks which tool to run (or answers a general "how does Toss work" question). The
// AI sees the user's own words and nothing else: replies are built from the database by our code (assistant/tools),
// so names, phones, addresses and locations never leave our servers, and every number is exact.

const ABOUT = `Toss is a smart laundry service in India. A small box under any laundry basket weighs the clothes and books a pickup by itself when the basket reaches its target weight. Customers use the Toss Control Telegram bot (live weight, tare, target weight, address, Wi-Fi, request pickup, my orders) and the customer web app (pickups, bills, UPI payment, basket credit). Laundries run the manager dashboard: live board with what needs attention, orders, payments (UPI and cash), customers, fleet (drivers and baskets), driver pay (per trip or monthly salary), supplies, profit, Toss AI briefings, analytics, ratings, business accounts for PGs on a monthly bill, branches, and billing (Free and Pro plans, 14-day trial). Drivers use the Toss Handy Telegram bot: they get jobs, confirm with Got it, weigh bags at the door (whites and coloured apart), take a photo, and hand clothes back with a 4-digit delivery code. Tare means zeroing the scale when the basket is empty. Basket credit comes off pickups automatically.`;

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
    if (!intent) return { text: "Sorry, I didn't get that. Did you mean:", chips: suggestions(text, role) };
    const reply = await runIntent(intent, session);
    return understood ? { ...reply, understood: tidy(understood) } : reply;
  } catch (err) {
    logError("assistant failed", err instanceof Error ? err.message : err);
    return { text: "Something went wrong on my side. Try again in a moment." };
  }
}

const TOOLS: Record<AssistantRole, string> = {
  CUSTOMER: `overview (everything about my account), basket (how full the basket is), credit (basket credit), orders (filter: active | unpaid | recent), order (number), go (page), theme (mode), password, help`,
  MANAGER: `overview (today's summary of the business), attention (problems that need the manager), orders (filter: active | waiting | unpaid | recent | delivery), order (number), driver (name: where a driver is), drivers (all drivers), go (page), theme (mode), password, help`,
  OWNER: `overview (platform summary), orders (filter: unpaid = subscription payments to check), go (page), theme (mode), password, help`,
};

// "where is ravi" → "Where is Ravi?" for the "Did you mean" line
function tidy(q: string): string {
  const t = q.trim().replace(/\s+/g, " ");
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[?.!]$/.test(s) ? s : /^(where|what|how|who|when|which|is|are|do|does|can|show|tell)/i.test(s) ? `${s}?` : s;
}

async function aiRoute(text: string, history: Turn[], role: AssistantRole): Promise<{ intent: Intent | null; rephrased?: string } | null> {
  if (!geminiEnabled()) return null;
  const pages = PAGES[role].map((p) => p.label).join(", ");
  const recent = history.slice(-4).filter((t) => t.role === "user").map((t) => `User earlier: ${t.text.slice(0, 200)}`).join("\n");
  const { data } = await geminiJson<{ tool: string; rephrased?: string; name?: string; number?: number; filter?: string; page?: string; mode?: string; answer?: string }>({
    system: `You route requests in the Toss app's assistant for a ${role.toLowerCase()} account in India. People often write in Hindi, Hinglish or quick, misspelt English: understand them, and put their request in "rephrased" as one short, correct, simple English sentence (keep names and numbers exactly). Answer "help" questions in simple English. Pick exactly one tool: ${TOOLS[role]}. For "go", set page to one of: ${pages}. For "help", write a short, friendly answer (at most 3 sentences) in "answer", using only these facts, and say you don't know when the facts don't cover it: ${ABOUT} Never invent numbers or account details; the tools fetch those.`,
    prompt: `${recent ? `${recent}\n` : ""}User: ${text}`,
    schema: {
      type: "object",
      properties: {
        tool: { type: "string", enum: ["overview", "basket", "credit", "orders", "order", "driver", "drivers", "attention", "go", "theme", "password", "help"] },
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

function toIntent(data: { tool: string; name?: string; number?: number; filter?: string; page?: string; mode?: string; answer?: string }, role: AssistantRole): Intent | null {
  switch (data.tool) {
    case "help":
      return { tool: "help", question: data.answer?.trim() || "I'm not sure about that one." };
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
