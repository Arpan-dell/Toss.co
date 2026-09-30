import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { Logo } from "@/components/ui";

const steps = [
  { n: "01", title: "The basket weighs itself", body: "A load cell under the basket tracks your laundry around the clock. No app to open, no button to press." },
  { n: "02", title: "It calls its own pickup", body: "The moment it hits your target weight, a driver gets the job on Telegram and accepts with one tap." },
  { n: "03", title: "Track it. Pay for it. Done.", body: "Watch the pickup in real time, then pay the invoice in a single click." },
];

const audiences = [
  { icon: "🏠", title: "Customers", body: "Zero effort. The basket handles scheduling while you get on with your day." },
  { icon: "🚚", title: "Drivers", body: "Jobs arrive in Telegram with the weight and address. Tap to accept, tap to complete." },
  { icon: "🏭", title: "Laundry businesses", body: "One command centre for every basket, driver and invoice in the city, with AI demand forecasts." },
];

const ticker = [
  "🧺 Basket full · Saket · 5.4 kg",
  "🚚 Vikram accepted · Connaught Place",
  "✓ Picked up · Hauz Khas · 6.2 kg",
  "💳 Invoice paid · Dwarka",
  "⚖️ Basket at 82% · Rajouri Garden",
  "🧺 Basket full · Hauz Khas · 6.3 kg",
];

// Toasts slide in after the weight counter finishes, like the real dispatch sequence.
const toast = (delaySec: number) => ({ animation: `fade-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) ${delaySec}s both` });

function HeroDevice() {
  return (
    <div className="float relative mx-auto w-full max-w-sm">
      <div aria-hidden className="absolute -inset-10 rounded-full bg-accent/25 blur-3xl" />
      <div className="glass relative rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.14em] text-muted uppercase">Basket · Connaught Place</p>
            <p className="mt-1 font-mono text-[11px] text-muted">24:6F:28:A1:B2:01</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-good-bg px-2.5 py-0.5 text-xs text-good ring-1 ring-good/25 ring-inset">
            <span className="live-dot" aria-hidden /> Live
          </span>
        </div>

        <p className="mt-8 text-6xl font-semibold tracking-tighter tabular-nums">
          <CountUp value="5.3" duration={2200} />
          <span className="ml-1 text-2xl text-muted">kg</span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="fill-bar h-full w-full rounded-full" style={{ animationDuration: "2.2s" }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">Target 5 kg reached</p>

        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.04] px-3 py-2.5 text-sm" style={toast(2.4)}>
            <span aria-hidden>📦</span>
            <span className="flex-1">Pickup #104 dispatched</span>
            <span className="text-xs text-muted">now</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm" style={toast(3.3)}>
            <span aria-hidden>🚚</span>
            <span className="flex-1">Vikram accepted, en route</span>
            <span className="text-xs text-muted">+9 min</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-secondary sm:inline-flex">
            <span className="live-dot text-good" aria-hidden /> Live in Delhi
          </span>
          <Link href="/login" className="btn-ghost rounded-full px-4 py-1.5 text-sm">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-12 pb-20 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
          <div className="stagger">
            <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-white/[0.03] px-3 py-1 text-xs text-secondary">
              <span className="rounded-full px-1.5 py-px text-[10px] font-semibold text-white" style={{ background: "var(--gradient)" }}>
                NEW
              </span>
              Self-ordering smart laundry baskets
            </span>
            <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tighter sm:text-7xl">
              Laundry that
              <br />
              <span className="text-gradient">calls its own pickup.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-secondary">
              A smart basket that knows when it&apos;s full and sends a driver automatically. Customers track and pay
              online. Laundry businesses run the whole city from one dashboard.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className="btn-primary rounded-full px-6 py-3 text-sm font-medium">
                Open dashboard →
              </Link>
              <a href="#how" className="btn-ghost rounded-full px-6 py-3 text-sm font-medium">
                How it works
              </a>
            </div>
          </div>
          <HeroDevice />
        </section>

        <div className="marquee overflow-hidden border-y border-border bg-white/[0.02] py-4" aria-hidden>
          <div className="marquee-track flex w-max gap-10 text-sm whitespace-nowrap text-secondary">
            {[...ticker, ...ticker].map((t, i) => (
              <span key={i} className="flex items-center gap-10">
                {t}
                <span className="text-accent/60">✦</span>
              </span>
            ))}
          </div>
        </div>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-4 py-24">
          <p className="text-xs tracking-[0.18em] text-accent uppercase">How it works</p>
          <h2 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight">From full basket to picked up, automatically.</h2>
          <div className="stagger mt-12 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="glass glow-card rounded-2xl p-6">
                <span className="text-gradient font-mono text-sm font-semibold">{s.n}</span>
                <h3 className="mt-6 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24">
          <div className="glass relative overflow-hidden rounded-3xl p-8 sm:p-12">
            <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-accent-2/20 blur-3xl" />
            <p className="text-xs tracking-[0.18em] text-accent uppercase">One platform, three sides</p>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {audiences.map((a) => (
                <div key={a.title}>
                  <span aria-hidden className="grid size-11 place-items-center rounded-xl border border-border-strong bg-white/[0.04] text-xl">
                    {a.icon}
                  </span>
                  <h3 className="mt-4 font-medium">{a.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-secondary">{a.body}</p>
                </div>
              ))}
            </div>
            <Link href="/login" className="btn-primary mt-10 inline-block rounded-full px-6 py-3 text-sm font-medium">
              Get started →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted">
          <Logo />
          <span>© 2026 Toss</span>
        </div>
      </footer>
    </div>
  );
}
