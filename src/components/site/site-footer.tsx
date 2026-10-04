import { COMPANY_LINKS } from "./info-page";
import { MainCta } from "./main-cta";
import { Reveal } from "./reveal";
import { appHref } from "@/lib/hosts";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "The Toss basket", href: "#basket" },
      { label: "Get a basket", href: "#buy" },
      { label: "How it works", href: "#how" },
      { label: "Inside Toss", href: "#inside" },
      { label: "Who it's for", href: "#roles" },
      { label: "Find a laundry", href: "/laundries" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: appHref("/login") },
      { label: "Get started", href: appHref("/login") },
    ],
  },
  { title: "Company", links: COMPANY_LINKS },
  {
    title: "Contact",
    links: [
      { label: "toss.smartlaundry@gmail.com", href: "mailto:toss.smartlaundry@gmail.com" },
      { label: "Driver bot on Telegram", href: "https://t.me/toss_driver_bot" },
    ],
  },
];

export function SiteFooter({ logo }: { logo: React.ReactNode }) {
  return (
    <footer className="relative overflow-hidden border-t border-ink/5 pt-32 pb-28">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[140px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal as="h2" className="max-w-4xl text-[clamp(3rem,9vw,7.5rem)] leading-[0.95] font-black tracking-tight">
          Make laundry disappear.
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <MainCta href={appHref("/login")} glow className="btn-primary rounded-full px-9 py-4 text-lg font-semibold">
            Get started
          </MainCta>
        </Reveal>

        <div className="mt-28 grid gap-12 border-t border-ink/10 pt-14 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            {logo}
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">Smart baskets that order their own laundry pickup, and the platform laundries run on.</p>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-sm font-semibold text-fg">{c.title}</p>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm break-all text-muted transition-colors hover:text-fg sm:break-normal">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap justify-between gap-4 border-t border-ink/5 pt-6 text-xs text-muted">
          <span>© 2026 Toss</span>
          <a href="#top" className="transition-colors hover:text-secondary">Back to top</a>
        </div>
      </div>
    </footer>
  );
}
