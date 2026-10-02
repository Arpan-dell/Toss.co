import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo, PageTitle } from "@/components/ui";
import { SiteDock } from "./site-dock";

// Shell for the plain company pages (About, Contact, Terms, Privacy): the laundries-style header with a way
// home, a readable text column, the site dock, and the company links at the bottom.
export const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

export function InfoPage({ kicker, title, updated, children }: { kicker: string; title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[var(--header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" aria-label="Toss home">
            <Logo />
          </Link>
          <Link href="/" className="group hidden items-center gap-1.5 text-sm text-secondary transition-colors hover:text-fg sm:inline-flex">
            <span className="transition-transform group-hover:-translate-x-1">←</span> Back to home
          </Link>
          <div className="ml-auto">
            <ThemeToggle className="size-9" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-16">
        <PageTitle kicker={kicker}>{title}</PageTitle>
        {updated && <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">Last updated {updated}</p>}
        <div className="mt-8 space-y-5 text-base leading-relaxed text-secondary [&_a]:text-accent [&_a]:underline-offset-4 [&_a:hover]:underline [&_b]:font-semibold [&_b]:text-fg [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-fg [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </div>
      </main>

      <footer className="border-t border-border pt-8 pb-28">
        <nav aria-label="Company" className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 text-sm">
          {COMPANY_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted transition-colors hover:text-fg">
              {l.label}
            </Link>
          ))}
          <span className="ml-auto text-xs text-muted">© 2026 Toss</span>
        </nav>
      </footer>
      <SiteDock page="info" />
    </div>
  );
}
