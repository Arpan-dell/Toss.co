"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowSquareOut, ArrowUp, Robot, X } from "@phosphor-icons/react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { NewPasswordInput } from "@/components/password-checklist";
import { setTheme } from "@/components/theme-toggle";
import { changePassword } from "@/lib/actions/account";
import { askAssistant } from "@/lib/actions/assistant";
import { isPasswordRequest, matchIntent, newPasswordFrom, type AssistantRole } from "@/lib/assistant/intents";
import type { AssistantReply } from "@/lib/assistant/tools";

// The in-app assistant: a robot button in the corner of every portal that opens a chat at the side (a sheet from
// the bottom on phones). It answers from the account's own data and can act: switch the theme, open a page, or
// change the password. Theme and password requests are handled right here in the browser, so a password typed
// into the chat ("change my password to …") is never sent anywhere; it only prefills the secure form below.

type Msg = { id: number; from: "user" | "bot"; text: string; reply?: AssistantReply };

const GREETING: Record<AssistantRole, string> = {
  CUSTOMER: "Hi! Ask me about your basket, pickups, bills or credit. I can also switch the theme or change your password.",
  MANAGER: "Hi! Ask me about today's business, any order, unpaid bills, or where a driver is. I can also switch the theme or change your password.",
  OWNER: "Hi! Ask me about the businesses on Toss or subscription payments. I can also switch the theme or change your password.",
};
const START_CHIPS: Record<AssistantRole, string[]> = {
  CUSTOMER: ["How full is my basket?", "My active pickup", "What do I owe?", "Switch to dark mode"],
  MANAGER: ["Today's summary", "What needs attention?", "Where are my drivers?", "Switch to dark mode"],
  OWNER: ["Platform summary", "Pending subscription payments", "Switch to dark mode"],
};
const STORE = "toss-assistant";

export function Assistant({ role }: { role: AssistantRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const push = (m: Omit<Msg, "id">) => setMsgs((all) => [...all, { ...m, id: nextId.current++ }]);

  const act = (reply: AssistantReply) => {
    const a = reply.action;
    if (a?.type === "theme") setTheme(a.mode);
    if (a?.type === "navigate") router.push(a.href);
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    setDraft("");
    // password: handled here, the typed password only prefills the form and is masked in the chat
    if (isPasswordRequest(text)) {
      const pw = newPasswordFrom(text);
      push({ from: "user", text: pw ? text.replace(pw, "•".repeat(Math.min(pw.length, 12))) : text });
      push({ from: "bot", text: "Let's change it here. Your passwords stay on this page; I never see them.", reply: { text: "", action: { type: "password", newPassword: pw } } });
      return;
    }
    push({ from: "user", text });
    // theme: instant, no server round trip
    const local = matchIntent(text, role);
    if (local?.tool === "theme") {
      const now = setTheme(local.mode);
      push({ from: "bot", text: `Done, you're in ${now} mode.` });
      return;
    }
    const history = msgs.filter((m) => m.from === "user").slice(-4).map((m) => ({ role: "user" as const, text: m.text }));
    start(async () => {
      const reply = await askAssistant(text, history).catch(() => ({ text: "I couldn't reach the server. Check your connection and try again." }) as AssistantReply);
      push({ from: "bot", text: reply.text, reply });
      act(reply);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="toss-assistant"
        aria-label={open ? "Close the assistant" : "Ask the Toss assistant"}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-50 grid size-14 place-items-center rounded-full bg-accent text-accent-contrast shadow-[0_12px_32px_-8px_rgb(var(--accent-rgb)/0.7)] transition-transform hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6"
      >
        {open ? <X size={24} weight="bold" /> : <Robot size={28} weight="fill" />}
      </button>

      {open && (
        <section
          id="toss-assistant"
          role="dialog"
          aria-label="Toss assistant"
          className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+11rem)] z-50 flex h-[min(34rem,calc(100dvh-13rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface-solid shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)] sm:inset-x-auto sm:right-6 sm:bottom-24 sm:h-[min(38rem,calc(100dvh-8rem))] sm:w-[24rem]"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent/15 text-accent">
              <Robot size={20} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Toss assistant</p>
              <p className="truncate text-xs text-muted">Answers from your account · can switch theme, change password</p>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={() => setMsgs([])} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-ink/[0.06] hover:text-fg">
                Clear
              </button>
            )}
          </header>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <Bubble from="bot">{GREETING[role]}</Bubble>
            {!msgs.length && <Chips items={START_CHIPS[role]} onPick={send} />}
            {msgs.map((m) => (
              <div key={m.id} className="space-y-2">
                <Bubble from={m.from}>{m.text}</Bubble>
                {m.reply && <ReplyExtras reply={m.reply} onPick={send} />}
              </div>
            ))}
            {pending && (
              <Bubble from="bot">
                <span className="inline-flex gap-1" aria-label="Thinking">
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
              placeholder="Ask anything…"
              aria-label="Message the assistant"
              maxLength={500}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-border bg-ink/[0.03] px-4 py-2.5 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim() || pending} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast disabled:opacity-40">
              <ArrowUp size={18} weight="bold" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function Bubble({ from, children }: { from: "user" | "bot"; children: React.ReactNode }) {
  return (
    <p className={`w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line ${from === "user" ? "ml-auto rounded-br-md bg-accent text-accent-contrast" : "rounded-bl-md bg-ink/[0.06] text-fg"}`}>
      {children}
    </p>
  );
}

function Chips({ items, onPick }: { items: readonly string[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)} className="rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:border-accent/50 hover:text-fg">
          {c}
        </button>
      ))}
    </div>
  );
}

function ReplyExtras({ reply, onPick }: { reply: AssistantReply; onPick: (s: string) => void }) {
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
  return (
    <div className="max-w-[92%] rounded-xl border border-border p-3">
      <ActionForm action={changePassword} submitLabel="Change password" className="space-y-2.5" submitClassName="btn-primary w-full rounded-full px-4 py-2 text-sm font-medium disabled:opacity-70">
        <Field label="Current password">
          <input name="current" type="password" autoComplete="current-password" required className={fieldClass} />
        </Field>
        <Field label="New password">
          <NewPasswordInput name="next" className={fieldClass} defaultValue={newPassword} />
        </Field>
        <Field label="Confirm new password">
          <input name="confirm" type="password" autoComplete="new-password" required maxLength={72} className={fieldClass} />
        </Field>
      </ActionForm>
    </div>
  );
}
