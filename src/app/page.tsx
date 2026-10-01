import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { HowMotion } from "@/components/how-motion";
import { RevealText } from "@/components/reveal-text";
import { Tilt } from "@/components/tilt";
import { Logo } from "@/components/ui";

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

// Illustrative weekday demand shape for the dashboard preview (Mon..Sun).
const previewBars = [42, 35, 40, 44, 55, 88, 100];
const previewDays = ["M", "T", "W", "T", "F", "S", "S"];

// Toasts slide in after the weight counter finishes, like the real dispatch sequence.
const toast = (delaySec: number) => ({ animation: `fade-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) ${delaySec}s both` });

function HeroDevice() {
  return (
    <div className="float relative mx-auto w-full max-w-sm">
      <div aria-hidden className="absolute -inset-10 rounded-full bg-accent/25 blur-3xl" />
      <Tilt max={12}>
        <div className="spin-border shadow-2xl">
          <div className="glass relative rounded-[1.55rem] bg-[#0b0b10]/80 p-6">
            <div className="tilt-glare" aria-hidden />
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
      </Tilt>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div data-reveal="right" className="relative">
      <div aria-hidden className="orb -top-10 -right-10 size-64 bg-accent-2/25" />
      <div className="glass glow-card relative rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs tracking-[0.14em] text-muted uppercase">Manager · Analytics</p>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs text-accent">✨ AI forecast</span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Pickups", value: "284" },
            { label: "Laundry", value: "1,712 kg" },
            { label: "Avg pickup", value: "2.2 h" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-white/[0.03] p-3">
              <p className="text-[10px] tracking-[0.14em] text-muted uppercase">{s.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                <CountUp value={s.value} duration={1600} />
              </p>
            </div>
          ))}
        </div>
        <div data-reveal="bars" className="mt-6 flex h-40 items-end gap-3 border-b border-border pb-px">
          {previewBars.map((h, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div
                className="bar w-full max-w-7 rounded-t-md"
                style={{
                  height: `${h}%`,
                  transitionDelay: `${200 + i * 90}ms`,
                  background:
                    i >= 5
                      ? "linear-gradient(to top, rgb(34 211 238 / 0.5), #22d3ee)"
                      : "linear-gradient(to top, rgb(144 133 233 / 0.45), #9085e9)",
                  boxShadow: i >= 5 ? "0 0 24px -4px rgb(34 211 238 / 0.7)" : undefined,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-3">
          {previewDays.map((d, i) => (
            <span key={i} className="flex-1 text-center text-xs text-muted">{d}</span>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-2.5 text-sm text-secondary">
          Peak days: <span className="text-gradient font-medium">Sat &amp; Sun</span>. Add an extra driver on weekends.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="site-header sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="Toss home"><Logo className="h-12" /></Link>
          <nav className="hidden items-center gap-6 text-sm text-secondary md:flex">
            <a href="#how" className="transition-colors hover:text-fg">How it works</a>
            <a href="#dashboard" className="transition-colors hover:text-fg">Dashboard</a>
            <a href="#who" className="transition-colors hover:text-fg">Who it&apos;s for</a>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-secondary sm:inline-flex">
              <span className="live-dot text-good" aria-hidden /> Live in Delhi
            </span>
            <Link href="/login" className="btn-ghost rounded-full px-4 py-1.5 text-sm">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-10 pb-24 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
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
            <div className="mt-10 flex items-center gap-6 text-xs text-muted">
              <span className="flex items-center gap-2"><span className="text-good">✓</span> No app for drivers</span>
              <span className="flex items-center gap-2"><span className="text-good">✓</span> Works on home Wi-Fi</span>
              <span className="hidden items-center gap-2 sm:flex"><span className="text-good">✓</span> Pay in one tap</span>
            </div>
          </div>
          <HeroDevice />
        </section>

        {/* Ticker */}
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

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-28">
          <p data-reveal="up" className="text-xs tracking-[0.18em] text-accent uppercase">How it works</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            <RevealText text="From full basket to picked up," /> <RevealText text="automatically." gradient />
          </h2>
          <p data-reveal="up" className="mt-4 max-w-xl text-secondary">
            Thirty seconds, start to finish: watch a full basket turn into a picked-up, paid-for order. Tap the stage to pause, or jump to any step.
          </p>
          <div data-reveal="up" className="mt-10">
            <HowMotion />
          </div>
        </section>

        {/* Dashboard preview */}
        <section id="dashboard" className="relative mx-auto grid max-w-6xl scroll-mt-20 items-center gap-14 px-4 pb-28 lg:grid-cols-2">
          <div data-reveal="left">
            <p className="text-xs tracking-[0.18em] text-accent uppercase">For laundry businesses</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              <RevealText text="Your whole city," /> <RevealText text="one screen." gradient />
            </h2>
            <p className="mt-5 max-w-md text-secondary">
              See every basket filling up, every driver on the road and every unpaid invoice in real time. AI spots
              your busiest days so you can staff ahead of demand.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {["Live board of every active pickup", "Basket fill levels and Wi-Fi health", "AI demand forecasts from real weight data"].map(
                (f, i) => (
                  <li key={f} data-reveal="left" data-reveal-delay={200 + i * 120} className="flex items-center gap-3">
                    <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-xs text-accent ring-1 ring-accent/30" aria-hidden>
                      ✓
                    </span>
                    {f}
                  </li>
                ),
              )}
            </ul>
          </div>
          <DashboardPreview />
        </section>

        {/* Audiences */}
        <section id="who" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-28">
          <div data-reveal="scale" className="glass relative overflow-hidden rounded-3xl p-8 sm:p-12">
            <div aria-hidden className="orb -top-24 -right-24 size-72 bg-accent-2/20" />
            <div aria-hidden className="orb -bottom-32 -left-20 size-72 bg-accent/20" />
            <p className="relative text-xs tracking-[0.18em] text-accent uppercase">One platform, three sides</p>
            <div className="relative mt-8 grid gap-8 md:grid-cols-3">
              {audiences.map((a, i) => (
                <div key={a.title} data-reveal="up" data-reveal-delay={250 + i * 130} className="group">
                  <span
                    aria-hidden
                    className="grid size-12 place-items-center rounded-xl border border-border-strong bg-white/[0.04] text-xl transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
                  >
                    {a.icon}
                  </span>
                  <h3 className="mt-4 font-medium">{a.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-secondary">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative mx-auto max-w-6xl px-4 pb-32 text-center">
          <div aria-hidden className="orb top-0 left-1/2 size-96 -translate-x-1/2 bg-accent/25" />
          <h2 className="relative text-5xl font-semibold tracking-tighter sm:text-6xl">
            <RevealText text="Stop scheduling laundry." />
            <br />
            <RevealText text="Just toss it in." gradient />
          </h2>
          <div data-reveal="up" data-reveal-delay={300} className="relative mt-10">
            <Link href="/login" className="btn-primary inline-block rounded-full px-8 py-4 text-base font-medium">
              Get started →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted">
          <Logo variant="full" className="h-16" />
          <span>© 2026 Toss</span>
        </div>
      </footer>
    </div>
  );
}
