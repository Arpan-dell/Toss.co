import Link from "next/link";
import { Tr } from "./locale";

export type OnboardingStep = { done: boolean; title: string; hint: string; href: string; cta: string };

/**
 * A "get started" checklist for a new account: what's done, what's next, one tap to each. It disappears by itself
 * once every step is done, so nobody has to dismiss it. Steps are worked out from real data by the page.
 */
export function Onboarding({ title, steps }: { title: React.ReactNode; steps: OnboardingStep[] }) {
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  const done = steps.length - left;
  const next = steps.find((s) => !s.done);
  return (
    <section aria-labelledby="onboarding-title" className="rounded-[10px] border border-l-4 border-border border-l-accent-3 bg-surface-solid p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase"><Tr vars={{ done, total: steps.length }}>{"Get started · {done} of {total} done"}</Tr></p>
          <h2 id="onboarding-title" className="mt-1 text-lg font-semibold">
            {typeof title === "string" ? <Tr>{title}</Tr> : title}
          </h2>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress" className="h-1.5 w-32 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.title} className="flex flex-wrap items-center gap-3 rounded-[8px] border border-border px-3 py-2.5">
            <span
              aria-hidden
              className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${s.done ? "border-good bg-good-bg text-good" : "border-border-strong text-muted"}`}
            >
              {s.done ? "✓" : ""}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-medium ${s.done ? "text-muted line-through" : "text-fg"}`}>
                <Tr>{s.title}</Tr>
                {s.done && <span className="sr-only"><Tr>{" (done)"}</Tr></span>}
              </span>
              {!s.done && <span className="block text-xs text-secondary"><Tr>{s.hint}</Tr></span>}
            </span>
            {!s.done && (
              <Link href={s.href} className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${s === next ? "btn-primary" : "btn-ghost"}`}>
                <Tr>{s.cta}</Tr>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
