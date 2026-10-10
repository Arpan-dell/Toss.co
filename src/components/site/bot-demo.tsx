"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// Toss Control (the customer bot) in daily use. The keyboard is the real one from the basket firmware and
// every reply below is the firmware's own text, so this is exactly what a customer sees in Telegram.
type Msg = { from: "me" | "bot"; text: React.ReactNode };
type Demo = { key: string; label: string; title: string; about: string; chat: Msg[] };

const DEMOS: Demo[] = [
  {
    key: "weight",
    label: "⚖️ Weight",
    title: "How full is it?",
    about: "Check the basket from anywhere: the weight, how close it is to a pickup, and a fill bar.",
    chat: [
      { from: "me", text: "⚖️ Weight" },
      {
        from: "bot",
        text: (
          <>
            ⚖️ <b>Your basket</b>
            <br />
            <br />
            <b>3.4 kg</b> of 5.0 kg
            <br />
            🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 68%
            <br />
            <br />
            Toss requests a pickup by itself at 5.0 kg.
          </>
        ),
      },
    ],
  },
  {
    key: "tare",
    label: "🔄 Tare",
    title: "Zero it",
    about: "After setting up the false plate, or swapping baskets, zero the scale so only clothes count.",
    chat: [
      { from: "me", text: "🔄 Tare" },
      {
        from: "bot",
        text: (
          <>
            ✅ Scale reset to <b>0.0 kg</b>.
            <br />
            Tip: only tare when the basket is empty.
          </>
        ),
      },
    ],
  },
  {
    key: "target",
    label: "🎯 Target",
    title: "Pick your pickup weight",
    about: "Small household, big family: choose the weight at which Toss calls a driver.",
    chat: [
      { from: "me", text: "🎯 Target" },
      {
        from: "bot",
        text: (
          <>
            🎯 <b>Auto-pickup weight</b>
            <br />
            Now: 5.0 kg
            <br />
            <br />
            Send the new weight in kg, e.g. <code>5</code>.
          </>
        ),
      },
      { from: "me", text: "6" },
      {
        from: "bot",
        text: (
          <>
            ✅ Toss will now request a pickup at <b>6.0 kg</b>.
          </>
        ),
      },
    ],
  },
  {
    key: "pickup",
    label: "🚚 Request pickup",
    title: "Need it sooner?",
    about: "It calls a driver by itself when full, but you can also ask for one right now.",
    chat: [
      { from: "me", text: "🚚 Request pickup" },
      {
        from: "bot",
        text: (
          <>
            🚚 <b>Pickup requested!</b>
            <br />
            Order <b>#104</b> · 5.2 kg
            <br />
            <br />
            We&apos;re finding the nearest driver. You&apos;ll get a message here when they&apos;re on the way.
          </>
        ),
      },
    ],
  },
  {
    key: "orders",
    label: "📋 My orders",
    title: "Your recent pickups",
    about: "Every pickup with its weight, plus a button to open Toss and pay by UPI.",
    chat: [
      { from: "me", text: "📋 My orders" },
      {
        from: "bot",
        text: (
          <>
            📋 <b>Recent pickups</b>
            <br />
            🧺 <b>#104</b> · 5.2 kg
            <br />
            🧺 <b>#103</b> · 4.8 kg
            <br />
            🧺 <b>#102</b> · 6.1 kg
          </>
        ),
      },
    ],
  },
  {
    key: "address",
    label: "🏠 Address",
    title: "Moved? Update the address",
    about: "Drivers navigate to whatever address the basket has, so keep it current.",
    chat: [
      { from: "me", text: "🏠 Address" },
      {
        from: "bot",
        text: (
          <>
            🏠 <b>Pickup address</b>
            <br />
            Send the new address, including area and city.
          </>
        ),
      },
      { from: "me", text: "C-12, Saket, New Delhi" },
      {
        from: "bot",
        text: (
          <>
            ✅ <b>Pickup address saved</b>
            <br />
            📍 C-12, Saket, New Delhi
          </>
        ),
      },
    ],
  },
  {
    key: "wifi",
    label: "📡 Wi-Fi",
    title: "Is it online?",
    about: "See which Wi-Fi it's on and how strong the signal is. Add a new network from the bot too.",
    chat: [
      { from: "me", text: "📡 Wi-Fi" },
      {
        from: "bot",
        text: (
          <>
            📡 <b>Connected</b>
            <br />
            Network: HomeWiFi
            <br />
            Signal: Excellent (-52 dBm)
          </>
        ),
      },
    ],
  },
];

// the real reply keyboard, row by row
const KEYBOARD: (string | null)[][] = [
  ["weight", "pickup"],
  ["orders", null],
  ["target", "tare"],
  ["address", "wifi"],
];

// Quick enough that a visitor sees every key in under 20 seconds without tapping through them.
const BUBBLE_MS = 380; // between chat bubbles
const HOLD_MS = 1500; // a finished exchange stays this long before the next key

export function BotDemo() {
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const touched = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const demo = DEMOS[active];

  // reveal the exchange one bubble at a time
  useEffect(() => {
    if (reduce) {
      const id = requestAnimationFrame(() => setShown(demo.chat.length));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    const id0 = requestAnimationFrame(() => setShown(0));
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= demo.chat.length) clearInterval(id);
    }, BUBBLE_MS);
    return () => {
      cancelAnimationFrame(id0);
      clearInterval(id);
    };
  }, [active, demo.chat.length, reduce]);

  // tour the features until someone taps a key
  useEffect(() => {
    if (!inView || reduce || touched.current) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % DEMOS.length), demo.chat.length * BUBBLE_MS + HOLD_MS);
    return () => clearTimeout(id);
  }, [active, inView, reduce, demo.chat.length]);

  const pick = (i: number) => {
    touched.current = true;
    setActive(i);
  };

  return (
    <div ref={box} className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(0,24rem)] lg:gap-20">
      <div>
        <ul className="divide-y divide-border border-y border-border">
          {DEMOS.map((d, i) => (
            <li key={d.key}>
              <button
                type="button"
                onClick={() => pick(i)}
                aria-pressed={i === active}
                className={`flex w-full items-baseline gap-4 py-4 text-left transition-colors ${i === active ? "text-fg" : "text-muted hover:text-secondary"}`}
              >
                <span className="font-mono text-[11px] tracking-[0.12em] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">
                  <span className="block text-lg font-semibold">{d.title}</span>
                  <AnimatePresence initial={false}>
                    {i === active && (
                      <motion.span
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="block overflow-hidden text-sm leading-relaxed text-secondary"
                      >
                        <span className="block pt-1">{d.about}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="font-mono text-xs">{d.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* phone */}
      <div data-theme="dark" className="mx-auto w-full max-w-[22rem] rounded-[2.6rem] border border-ink/15 bg-[#0b0f1d] p-2.5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)]">
        <div className="flex h-[34rem] flex-col overflow-hidden rounded-[2.1rem] bg-[#0e1621]">
          <div className="flex items-center gap-3 border-b border-white/5 bg-[#17212b] px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bot/avatar.png" alt="" width={36} height={36} className="size-9 rounded-full" />
            <span>
              <span className="block text-sm font-semibold text-white">Toss Control</span>
              <span className="block text-[11px] text-[#7d8b99]">bot</span>
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-3 py-3" aria-live="polite">
            <AnimatePresence mode="popLayout">
              {demo.chat.slice(0, shown).map((m, i) => (
                <motion.div
                  key={`${demo.key}-${i}`}
                  initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug text-white ${
                    m.from === "me" ? "self-end rounded-br-md bg-[#2b5278]" : "self-start rounded-bl-md bg-[#182533]"
                  }`}
                >
                  {m.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {/* reply keyboard */}
          <div className="grid gap-1.5 bg-[#17212b] p-2">
            {KEYBOARD.map((row, r) => (
              <div key={r} className="grid grid-cols-2 gap-1.5">
                {row.map((k, c) => {
                  if (!k) {
                    return (
                      <span key={c} className="rounded-lg bg-[#22303e] py-2 text-center text-[12px] text-[#c9d6e3]">
                        📱 Open Toss
                      </span>
                    );
                  }
                  const i = DEMOS.findIndex((d) => d.key === k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => pick(i)}
                      className={`rounded-lg py-2 text-[12px] transition-colors ${i === active ? "bg-[#2b5278] text-white" : "bg-[#22303e] text-[#c9d6e3] hover:bg-[#2a3a4b]"}`}
                    >
                      {DEMOS[i].label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
