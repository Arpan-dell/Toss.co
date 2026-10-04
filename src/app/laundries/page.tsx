import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOMER_NAV } from "@/app/app/nav";
import { PortalShell } from "@/components/portal-shell";
import { SiteDock } from "@/components/site/site-dock";
import { TelegramMiniApp } from "@/components/telegram-miniapp";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo, PageTitle } from "@/components/ui";
import { getCustomer, getTenantById } from "@/lib/data";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { LaundryFinder } from "./finder";
import { appHref, siteHref } from "@/lib/hosts";

export const metadata: Metadata = {
  alternates: { canonical: "/laundries" },
  title: "Find a laundry",
  description: "Compare the laundries that pick up where you live: distance, price per kg, drivers and how fast they accept.",
};

// Public directory (website and the Telegram Mini App). Anyone can search; a signed-in customer can
// connect or switch in one tap, and their last search location is remembered.
export default async function LaundriesPage() {
  const session = await getSession();
  const viewer = !session ? "signed-out" : session.role === "CUSTOMER" ? "customer" : "other";

  let currentCode: string | undefined;
  let customerName = "";
  let home: [number, number] | undefined;
  let telegramLinked = true;
  if (session?.role === "CUSTOMER") {
    const customer = await getCustomer(session.userId);
    customerName = customer?.name ?? "";
    currentCode = customer?.tenantId ? (await getTenantById(customer.tenantId))?.joinCode : undefined;
    telegramLinked = !!customer?.telegramId;
    // the saved location is private to the customer: read server-side, never exposed to managers
    if (isSupabaseConfigured()) {
      const { data } = await supabaseAdmin().from("customers").select("home_lat, home_lng").eq("id", session.userId).maybeSingle();
      if (data?.home_lat != null && data?.home_lng != null) home = [data.home_lat as number, data.home_lng as number];
    }
  }

  const content = (
    <div className="space-y-6">
      <PageTitle kicker="Find a laundry">Who picks up near you?</PageTitle>
      <p className="max-w-2xl text-secondary">
        Every laundry on Toss picks up within its own area. Share your location (or type your area) to see the ones that cover you, and
        compare distance, price per kg, drivers and how quickly they accept a pickup.
      </p>
      <LaundryFinder viewer={viewer} currentCode={currentCode} home={home} />
    </div>
  );

  // A signed-in customer stays inside their portal: same header, same dock, with this tab marked.
  if (viewer === "customer") {
    return (
      <PortalShell subtitle={customerName} nav={CUSTOMER_NAV}>
        {content}
        <TelegramMiniApp linked={telegramLinked} />
      </PortalShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[var(--header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href={siteHref("/")} aria-label="Toss home">
            <Logo />
          </Link>
          <Link href={siteHref("/")} className="group hidden items-center gap-1.5 text-sm text-secondary transition-colors hover:text-fg sm:inline-flex">
            <span className="transition-transform group-hover:-translate-x-1">←</span> Back to home
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <ThemeToggle className="size-9" />
            {session ? (
              <Link href={appHref("/login")} className="btn-ghost rounded-full px-3.5 py-1.5 text-secondary">
                My dashboard
              </Link>
            ) : (
              <Link href={appHref("/login?next=%2Flaundries")} className="btn-ghost rounded-full px-3.5 py-1.5 text-secondary">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24">{content}</main>
      <SiteDock page="laundries" />
      <TelegramMiniApp linked />
    </div>
  );
}
