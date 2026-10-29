"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowSquareOut, ArrowUp, X } from "@phosphor-icons/react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { GuideTour, GuideWelcome, markGuideSeen } from "@/components/guide/guide";
import { Mascot } from "@/components/guide/mascot";
import { NewPasswordInput } from "@/components/password-checklist";
import { setLanguage, useLocale, useT } from "@/components/locale";
import { setTheme } from "@/components/theme-toggle";
import { changePassword } from "@/lib/actions/account";
import { askAssistant } from "@/lib/actions/assistant";
import { differs, isPasswordRequest, matchIntent, newPasswordFrom, nowText, understand, type AssistantRole } from "@/lib/assistant/intents";
import type { AssistantReply } from "@/lib/assistant/tools";
import { TOURS, tourRequest, tourSteps, type TourStep } from "@/lib/guide/tours";
import { languageRequest } from "@/lib/i18n";

// The in-app assistant, Tossy: a little basket character in the corner of every portal that opens a chat at the side (a sheet from
// the bottom on phones). It answers from the account's own data and can act: switch the theme, open a page, or
// change the password. Tossy also gives guided tours ("show me around", or "explain this page"), and says hello
// with an offer of one the first time someone opens a portal. Theme and password requests are handled right here in the browser, so a password typed
// into the chat ("change my password to …") is never sent anywhere; it only prefills the secure form below.

type Msg = { id: number; from: "user" | "bot"; text: string; reply?: AssistantReply; understood?: string };

const GREETING: Record<AssistantRole, string> = {
  CUSTOMER: "Hi, I'm Tossy! Ask me about your basket, pickups, bills or credit, or say \"show me around\" for a tour. I can also switch the theme or change your password.",
  MANAGER: "Hi, I'm Tossy! Ask me about today's business, any order, unpaid bills, or where a driver is, or say \"show me around\" for a tour. I can also switch the theme or change your password.",
  OWNER: "Hi, I'm Tossy! Ask me about the businesses on Toss or subscription payments. I can also switch the theme or change your password.",
};
const START_CHIPS: Record<AssistantRole, string[]> = {
  CUSTOMER: ["Show me around", "Explain this page", "How full is my basket?", "My active pickup", "What do I owe?"],
  MANAGER: ["Show me around", "Explain this page", "Today's summary", "What needs attention?", "Where are my drivers?"],
  OWNER: ["Platform summary", "Pending subscription payments", "Switch to dark mode"],
};
const STORE = "toss-assistant";

export function Assistant({ role }: { role: AssistantRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // the guided tour that's running, if any (a new key restarts it from the first step)
  const [tour, setTour] = useState<{ key: number; steps: TourStep[] } | null>(null);
  // the conversation survives page changes in this tab (the panel starts closed, so server and browser match)
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(sessionStorage.getItem(`${STORE}:${role}`) ?? "[]") as Msg[];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(msgs.length ? Math.max(...msgs.map((m) => m.id)) + 1 : 1);

  // saved after every message (never a password: masked in the chat, stripped from the form below)
  useEffect(() => {
    try {
      // never store a prefilled password, even on this device
      const safe = msgs.slice(-30).map((m) => (m.reply?.action?.type === "password" ? { ...m, reply: { ...m.reply, action: { type: "password" as const } } } : m));
      sessionStorage.setItem(`${STORE}:${role}`, JSON.stringify(safe));
    } catch {}
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, role]);
  useEffect(() => {
    if (!open) return;
    // reopened: start at the latest message, not the top
    const id = requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const push = (m: Omit<Msg, "id">) => setMsgs((all) => [...all, { ...m, id: nextId.current++ }]);

  // start a tour: the whole portal, or just the page on screen; false when there's nothing to show
  const startTour = (scope: "all" | "page"): boolean => {
    const steps = tourSteps(role, scope, pathname);
    if (!steps.length) return false;
    markGuideSeen(role);
    setOpen(false);
    setTour({ key: Date.now(), steps });
    return true;
  };

  // the theme, worded from what's on screen now: "already in dark mode" instead of switching to it again
  const theme = (mode: "dark" | "light" | "toggle" | "status"): string => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const other = current === "dark" ? "light" : "dark";
    if (mode === "status") return t(`You're in ${current} mode right now. Say "switch to ${other} mode" to change it.`);
    if (mode === current) return t(`You're already in ${current} mode.`);
    return t(`Done, you're in ${setTheme(mode)} mode now.`);
  };

  const act = (reply: AssistantReply) => {
    if (reply.action?.type === "navigate") router.push(reply.action.href);
  };

  // shown: what the chat shows for a tapped suggestion (in the site's language); raw is what gets understood
  const send = (raw: string, shown?: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    setDraft("");
    // "hindi mein karo", "switch to English"
    const lang = languageRequest(text);
    if (lang) {
      push({ from: "user", text: shown ?? text });
      if (lang === locale) return push({ from: "bot", text: lang === "hi" ? "हम पहले से हिंदी में हैं।" : "We're already in English." });
      push({ from: "bot", text: lang === "hi" ? "ठीक है, हिंदी में बदल रहा हूँ…" : "Okay, switching to English…" });
      setTimeout(() => setLanguage(lang), 400);
      return;
    }
    const fixed = understand(text); // Hinglish and typos, for the requests handled right here
    // password: handled here, the typed password only prefills the form and is masked in the chat
    if (isPasswordRequest(text) || isPasswordRequest(fixed)) {
      const pw = newPasswordFrom(text);
      push({ from: "user", text: pw ? text.replace(pw, "•".repeat(Math.min(pw.length, 12))) : text });
      push({ from: "bot", text: "Let's change it here. Your passwords stay on this page; I never see them.", reply: { text: "", action: { type: "password", newPassword: pw } } });
      return;
    }
    push({ from: "user", text: shown ?? text });
    // a tour: "show me around", "explain this page", "kaise use kare"
    const wants = TOURS[role] ? (tourRequest(text) ?? tourRequest(fixed)) : null;
    if (wants) {
      if (startTour(wants)) return push({ from: "bot", text: wants === "page" ? "Here's what's on this page. Follow me!" : "Let's go! Follow me." });
      return push({ from: "bot", text: "I don't have a walkthrough for this page yet. Want the full tour instead?", reply: { text: "", chips: ["Show me around"] } });
    }
    // theme, date and time: instant, no server round trip
    const asTyped = matchIntent(text, role);
    const local = asTyped ?? (differs(text, fixed) ? matchIntent(fixed, role) : null);
    const said = !asTyped && local ? tidyQuestion(fixed) : undefined;
    if (local?.tool === "theme") return push({ from: "bot", text: theme(local.mode), understood: said });
    if (local?.tool === "now") return push({ from: "bot", text: nowText(), understood: said });
    const history = msgs.filter((m) => m.from === "user").slice(-4).map((m) => ({ role: "user" as const, text: m.text }));
    start(async () => {
      const reply = await askAssistant(text, history).catch(() => ({ text: "I couldn't reach the server. Check your connection and try again." }) as AssistantReply);
      const a = reply.action;
      push({ from: "bot", text: a?.type === "theme" ? theme(a.mode) : reply.text, reply, understood: reply.understood });
      act(reply);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          markGuideSeen(role); // met Tossy: no hello pop-up from now on
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls="toss-assistant"
        aria-label={open ? t("Close Tossy") : t("Ask Tossy, your Toss guide")}
        data-guide="assistant"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-50 grid size-14 place-items-center rounded-full border border-border bg-surface-solid text-fg shadow-[0_12px_32px_-8px_rgb(var(--accent-rgb)/0.7)] transition-transform hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6"
      >
        {open ? <X size={22} weight="bold" /> : <Mascot size={40} />}
      </button>

      {!open && !tour && TOURS[role] && <GuideWelcome role={role} onStart={() => startTour("all")} />}
      {tour && <GuideTour key={tour.key} steps={tour.steps} onEnd={() => setTour(null)} />}

      {open && (
        <section
          id="toss-assistant"
          role="dialog"
          aria-label={t("Tossy, your Toss guide")}
          className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-50 flex h-[min(36rem,calc(100dvh-8rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface-solid shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)] sm:inset-x-auto sm:right-6 sm:bottom-24 sm:h-[min(38rem,calc(100dvh-8rem))] sm:w-[24rem]"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Mascot size={36} talking={pending} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Tossy</p>
              <p className="truncate text-xs text-muted">{t("Your Toss guide · answers from your account")}</p>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={() => setMsgs([])} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-ink/[0.06] hover:text-fg">
                {t("Clear")}
              </button>
            )}
          </header>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <Bubble from="bot">{t(GREETING[role])}</Bubble>
            {!msgs.length && <Chips items={[...START_CHIPS[role], locale === "hi" ? "Switch to English" : "हिंदी में बदलें"]} onPick={send} />}
            {msgs.map((m) => (
              <div key={m.id} className="space-y-2">
                {m.understood && (
                  <p className="text-xs text-muted">
                    {t("Did you mean:")} <button type="button" onClick={() => send(m.understood!)} className="font-medium text-accent italic hover:underline">{m.understood}</button>
                  </p>
                )}
                <Bubble from={m.from}>{m.from === "bot" ? t(m.text) : m.text}</Bubble>
                {m.reply && <ReplyExtras reply={m.reply} onPick={send} />}
              </div>
            ))}
            {pending && (
              <Bubble from="bot">
                <span className="inline-flex gap-1" aria-label={t("Thinking")}>
                  <i className="size-1.5 animate-bounce rounded-full bg-muted" />
                  <i className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:120ms]" />
                  <i className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:240ms]" />
                </span>
              </Bubble>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Ask anything…")}
              aria-label={t("Message the assistant")}
              maxLength={500}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-border bg-ink/[0.03] px-4 py-2.5 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim() || pending} aria-label={t("Send")} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast disabled:opacity-40">
              <ArrowUp size={18} weight="bold" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

// "where is ravi" → "Where is ravi?"
function tidyQuestion(q: string): string {
  const s = q.charAt(0).toUpperCase() + q.slice(1);
  return /[?.!]$/.test(s) ? s : /^(where|what|how|who|when|which|is|are|do|does|can)\b/i.test(s) ? `${s}?` : s;
}

function Bubble({ from, children }: { from: "user" | "bot"; children: React.ReactNode }) {
  return (
    <p className={`w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line ${from === "user" ? "ml-auto rounded-br-md bg-accent text-accent-contrast" : "rounded-bl-md bg-ink/[0.06] text-fg"}`}>
      {children}
    </p>
  );
}

// a suggestion shows in the site's language but is understood as written
function Chips({ items, onPick }: { items: readonly string[]; onPick: (s: string, shown?: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c, t(c))} className="rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:border-accent/50 hover:text-fg">
          {t(c)}
        </button>
      ))}
    </div>
  );
}

function ReplyExtras({ reply, onPick }: { reply: AssistantReply; onPick: (s: string, shown?: string) => void }) {
  return (
    <>
      {reply.rows && reply.rows.length > 0 && (
        <dl className="max-w-[92%] divide-y divide-border rounded-xl border border-border text-xs">
          {reply.rows.map(([k, v], i) => (
            <div key={`${k}-${i}`} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {reply.links && reply.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reply.links.map((l) =>
            l.external ? (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25">
                {l.label} <ArrowSquareOut size={12} />
              </a>
            ) : (
              <Link key={l.href} href={l.href} className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25">
                {l.label}
              </Link>
            ),
          )}
        </div>
      )}
      {reply.action?.type === "password" && <PasswordInChat newPassword={reply.action.newPassword} />}
      {reply.chips && reply.chips.length > 0 && <Chips items={reply.chips} onPick={onPick} />}
    </>
  );
}

function PasswordInChat({ newPassword }: { newPassword?: string }) {
  const t = useT();
  return (
    <div className="max-w-[92%] rounded-xl border border-border p-3">
      <ActionForm action={changePassword} submitLabel={t("Change password")} className="space-y-2.5" submitClassName="btn-primary w-full rounded-full px-4 py-2 text-sm font-medium disabled:opacity-70">
        <Field label={t("Current password")}>
          <input name="current" type="password" autoComplete="current-password" required className={fieldClass} />
        </Field>
        <Field label={t("New password")}>
          <NewPasswordInput name="next" className={fieldClass} defaultValue={newPassword} />
        </Field>
        <Field label={t("Confirm new password")}>
          <input name="confirm" type="password" autoComplete="new-password" required maxLength={72} className={fieldClass} />
        </Field>
      </ActionForm>
    </div>
  );
}
