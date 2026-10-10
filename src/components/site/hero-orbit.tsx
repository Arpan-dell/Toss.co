import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { appHref } from "@/lib/hosts";
import { DotField } from "./dot-field";
import { MainCta } from "./main-cta";
import { TossOrbit } from "./toss-orbit";

// First screen. Complete without scrolling: a dot field, HUD labels in the corners, the headline, and the orbit
// that shows how the basket, the two bots and the accounts connect. The text and the dot field are still (no
// entrance animation: it is the first thing every phone renders); only the orbit moves.
// Server component; DotField (canvas) and TossOrbit are client islands.

const LINES = [["Laundry", "that"], ["calls", "its", "own"]];

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`absolute size-[0.32em] border-accent ${className}`} />;
}

export function HeroOrbit() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_62%_72%_at_74%_52%,black_30%,transparent_88%)] max-lg:[mask-image:radial-gradient(ellipse_90%_50%_at_50%_78%,black_25%,transparent_90%)]">
        <DotField originX={0.72} originY={0.52} />
      </div>

      {/* HUD, like a reel's frame labels */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 z-10 mx-auto hidden max-w-7xl justify-between px-4 font-mono text-[11px] tracking-[0.16em] text-muted uppercase sm:flex sm:px-6 lg:px-8">
        <span>Toss · Smart laundry · New Delhi</span>
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent" /> Live · basket 04 · 5.8 / 6.0 kg
        </span>
      </div>

      <div className="mx-auto grid min-h-[100dvh] max-w-7xl items-center gap-6 px-4 pt-32 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:px-8 lg:pt-28 lg:pb-12">
        <div className="relative z-10">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
            <span className="h-px w-8 bg-accent" /> One basket. Two bots. Every account in sync.
          </p>
          <h1 id="hero-title" className="mt-6 text-[clamp(3rem,7.4vw,6.4rem)] leading-[0.95] font-black tracking-[-0.045em] text-fg">
            {LINES.map((line, li) => (
              <span key={li} className="block">
                {line.map((w) => (
                  <span key={w} className="mr-[0.22em] inline-block">
                    {w}
                  </span>
                ))}
              </span>
            ))}
            <span className="block">
              <span className="relative inline-block px-[0.12em] text-accent">
                pickup
                <Corner className="top-0 left-0 border-t-[3px] border-l-[3px]" />
                <Corner className="top-0 right-0 border-t-[3px] border-r-[3px]" />
                <Corner className="bottom-[0.06em] left-0 border-b-[3px] border-l-[3px]" />
                <Corner className="right-0 bottom-[0.06em] border-r-[3px] border-b-[3px]" />
              </span>
              <span>.</span>
            </span>
          </h1>
          <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-secondary">
            A smart basket weighs your clothes and books the nearest driver when it&apos;s full. You hear about it on Telegram, the laundry sees it
            live, and the bill lands in your account.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <MainCta href={appHref("/login")} glow className="btn-primary rounded-full px-7 py-3.5 text-base font-semibold">
              Get started <ArrowRight size={18} weight="bold" />
            </MainCta>
            <MainCta href="#basket" className="btn-ghost rounded-full px-7 py-3.5 text-base font-medium text-fg">
              Meet the basket
            </MainCta>
          </div>
          <dl className="mt-10 hidden max-w-md grid-cols-3 border-t border-border pt-5 font-mono sm:grid">
            {[
              ["0", "apps to install"],
              ["2", "Telegram bots"],
              ["3", "account types"],
            ].map(([v, k]) => (
              <div key={k} className="flex flex-col-reverse">
                <dt className="mt-1 text-[10px] tracking-[0.14em] text-muted uppercase">{k}</dt>
                <dd className="text-2xl font-bold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <TossOrbit className="relative z-10" />
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
    </section>
  );
}
