"use server";

import { geminiEnabled, geminiJson } from "../ai/gemini";
import { matchIntent, PAGES, type AssistantRole, type Intent } from "../assistant/intents";
import { CHIPS, runIntent, type AssistantReply } from "../assistant/tools";
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
    const intent = matchIntent(text, role) ?? (await aiRoute(text, history, role));
    if (!intent) {
      return { text: "I'm not sure how to help with that. Here are some things I can do:", chips: [...CHIPS[role]] };
    }
    return await runIntent(intent, session);
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

async function aiRoute(text: string, history: Turn[], role: AssistantRole): Promise<Intent | null> {
  if (!geminiEnabled()) return { tool: "help", question: "I can answer questions about your account. Try one of these:" };
  const pages = PAGES[role].map((p) => p.label).join(", ");
  const recent = history.slice(-4).filter((t) => t.role === "user").map((t) => `User earlier: ${t.text.slice(0, 200)}`).join("\n");
  const { data } = await geminiJson<{ tool: string; name?: string; number?: number; filter?: string; page?: string; mode?: string; answer?: string }>({
    system: `You route requests in the Toss app's assistant for a ${role.toLowerCase()} account. Pick exactly one tool: ${TOOLS[role]}. For "go", set page to one of: ${pages}. For "help", write a short, friendly answer (at most 3 sentences) in "answer", using only these facts, and say you don't know when the facts don't cover it: ${ABOUT} Never invent numbers or account details; the tools fetch those.`,
    prompt: `${recent ? `${recent}\n` : ""}User: ${text}`,
    schema: {
      type: "object",
      properties: {
        tool: { type: "string", enum: ["overview", "basket", "credit", "orders", "order", "driver", "drivers", "attention", "go", "theme", "password", "help"] },
        name: { type: "string" },
        number: { type: "integer" },
        filter: { type: "string", enum: ["active", "unpaid", "recent", "waiting", "delivery"] },
        page: { type: "string" },
        mode: { type: "string", enum: ["dark", "light", "toggle"] },
        answer: { type: "string" },
      },
      required: ["tool"],
    },
    temperature: 0.1,
    timeoutMs: 12_000,
  });
  const allowed = new Set(TOOLS[role].split(/,\s*/).map((t) => t.split(" ")[0]));
  if (!allowed.has(data.tool)) return null;
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
