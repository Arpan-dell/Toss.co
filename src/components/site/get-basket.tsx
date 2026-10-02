"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { requestBasket } from "@/lib/actions/basket";
import type { FormState } from "@/lib/actions/shared";
import { BASKET_COLORS, colorOf } from "./basket-colors";
import { useBasketColor } from "./basket-color-store";

// "Get a Toss basket": the real photo in the chosen filament colour, and a short request form. The owner is
// emailed the request and replies about availability.
const ANGLES = [
  { id: "hero", label: "Angle", w: 1000, h: 694 },
  { id: "front", label: "Front", w: 640, h: 350 },
  { id: "side", label: "Side", w: 640, h: 405 },
  { id: "top", label: "Top", w: 520, h: 493 },
] as const;

const field =
  "w-full rounded-[8px] border border-border-strong bg-surface-solid px-3.5 py-3 text-base text-fg placeholder:text-muted focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none";
const label = "mb-1.5 block text-sm font-medium text-fg";

export function GetBasket() {
  const [color, setColor] = useBasketColor();
  const [angle, setAngle] = useState<(typeof ANGLES)[number]["id"]>("hero");
  const [state, action, pending] = useActionState<FormState, FormData>(requestBasket, {});
  const a = ANGLES.find((x) => x.id === angle)!;

  return (
    <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      {/* the real thing, in the chosen colour */}
      <div>
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-border bg-[radial-gradient(ellipse_at_50%_60%,rgb(var(--ink-rgb)/0.06),transparent_70%)]">
          <AnimatePresence mode="wait">
            <motion.div key={`${a.id}-${color}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="w-[82%]">
              <Image
                src={`/brand/basket/${a.id}-${color}.webp`}
                alt={`Toss basket box, ${a.label.toLowerCase()} view, ${colorOf(color).name}`}
                width={a.w}
                height={a.h}
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="h-auto w-full drop-shadow-[0_24px_30px_rgb(0_0_0/0.25)]"
              />
            </motion.div>
          </AnimatePresence>
          <span className="absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
            Real photo · colours shown are print options
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {ANGLES.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setAngle(x.id)}
              aria-pressed={angle === x.id}
              className={`grid aspect-[4/3] place-items-center rounded-[8px] border p-2 transition-colors ${angle === x.id ? "border-fg" : "border-border hover:border-border-strong"}`}
            >
              <Image src={`/brand/basket/${x.id}-${color}.webp`} alt={`${x.label} view`} width={x.w} height={x.h} sizes="120px" className="h-auto max-h-full w-auto" />
            </button>
          ))}
        </div>
      </div>

      {/* request form */}
      <div>
        {state.message ? (
          <div role="status" className="rounded-[10px] border border-l-4 border-border border-l-good bg-surface-solid p-6">
            <p className="font-mono text-[11px] tracking-[0.14em] text-good uppercase">Request sent</p>
            <p className="mt-2 text-lg font-semibold text-fg">{state.message}</p>
          </div>
        ) : (
          <form action={action} className="space-y-5" noValidate={false}>
            <fieldset>
              <legend className={label}>Colour</legend>
              <div className="flex flex-wrap gap-2.5">
                {BASKET_COLORS.map((c) => (
                  <label key={c.id} className="cursor-pointer" title={c.name}>
                    <input type="radio" name="colour" value={c.id} checked={color === c.id} onChange={() => setColor(c.id)} className="peer sr-only" />
                    <span
                      className={`block size-9 rounded-full border-2 transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-accent hover:scale-110 ${color === c.id ? "border-fg" : "border-ink/15"}`}
                      style={{ background: c.hex }}
                    />
                    <span className="sr-only">{c.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{colorOf(color).name}</p>
            </fieldset>

            <div>
              <label htmlFor="br-name" className={label}>
                Your name <span className="text-critical">*</span>
              </label>
              <input id="br-name" name="name" autoComplete="name" required minLength={2} maxLength={80} enterKeyHint="next" className={field} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="br-phone" className={label}>
                  Mobile number
                </label>
                <input id="br-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" enterKeyHint="next" className={field} aria-describedby="br-reach" />
              </div>
              <div>
                <label htmlFor="br-email" className={label}>
                  Email
                </label>
                <input id="br-email" name="email" type="email" autoComplete="email" enterKeyHint="next" className={field} aria-describedby="br-reach" />
              </div>
            </div>
            <p id="br-reach" className="-mt-3 text-xs text-muted">
              Mobile or email, at least one, so we can tell you when it&apos;s available.
            </p>
            <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
              <div>
                <label htmlFor="br-city" className={label}>
                  City / area
                </label>
                <input id="br-city" name="city" autoComplete="address-level2" maxLength={80} placeholder="Saket, New Delhi" className={field} />
              </div>
              <div>
                <label htmlFor="br-qty" className={label}>
                  How many
                </label>
                <select id="br-qty" name="quantity" defaultValue="1" className={field}>
                  {[1, 2, 3, 4, 5, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="br-msg" className={label}>
                Anything else? <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea id="br-msg" name="message" rows={3} maxLength={500} className={field} placeholder="For a laundry business, a PG, a hostel…" />
            </div>
            {/* honeypot: hidden from people, irresistible to bots */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="br-company">Company</label>
              <input id="br-company" name="company" tabIndex={-1} autoComplete="off" />
            </div>
            {state.error && (
              <p role="alert" className="rounded-[8px] border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn-primary w-full rounded-full px-6 py-3.5 text-base font-semibold disabled:opacity-70 sm:w-auto">
              {pending ? "Sending…" : "Ask about availability"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
