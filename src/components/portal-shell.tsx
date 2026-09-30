import Link from "next/link";
import { NavLinks } from "./nav-links";
import { Logo } from "./ui";
import { signOut } from "@/app/login/actions";

export function PortalShell({ badge, subtitle, nav, children }: {
  badge?: string;
  subtitle: string;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            {badge && (
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] tracking-[0.14em] text-secondary uppercase">
                {badge}
              </span>
            )}
          </Link>
          <NavLinks items={nav} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{subtitle}</span>
            <form action={signOut}>
              <button className="btn-ghost rounded-full px-3.5 py-1.5 text-secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
