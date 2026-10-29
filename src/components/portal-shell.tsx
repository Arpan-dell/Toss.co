import Link from "next/link";
import { PortalDock, type PortalNavItem } from "./portal-dock";
import { PortalMenu } from "./portal-menu";
import { LanguageToggle, LocaleProvider } from "./locale";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./ui";
import { signOut } from "@/app/login/actions";
import { siteHref } from "@/lib/hosts";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

// Every portal page sits in this shell, so it also sets the page's language (the toss-lang cookie) for everything inside.
export async function PortalShell({ badge, subtitle, nav, children }: {
  badge?: string;
  subtitle: string;
  nav: PortalNavItem[];
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const t = translator(locale);
  const links = nav.map((item) => ({ ...item, label: t(item.label) }));
  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[var(--header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={siteHref("/")} className="flex items-center gap-2">
            <Logo />
            {badge && (
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] tracking-[0.14em] text-secondary uppercase">
                {t(badge)}
              </span>
            )}
          </Link>
          <div className="ml-auto flex items-center gap-2 text-sm sm:gap-3">
            <span className="hidden text-muted sm:inline">{subtitle}</span>
            <LanguageToggle />
            <ThemeToggle className="size-9" />
            {/* on phones, Sign out lives in the side menu */}
            <form action={signOut} className="hidden md:block">
              <button className="btn-ghost rounded-full px-3.5 py-1.5 text-secondary">{t("Sign out")}</button>
            </form>
            <PortalMenu items={links} title={subtitle} />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-28 md:pb-32">{children}</main>
      <PortalDock items={links} />
    </div>
    </LocaleProvider>
  );
}
