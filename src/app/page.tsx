import { HowScrolly } from "@/components/how-scrolly";
import { BasketShowcase } from "@/components/site/basket-showcase";
import { BotDemo } from "@/components/site/bot-demo";
import { GetBasket } from "@/components/site/get-basket";
import { HeroOrbit } from "@/components/site/hero-orbit";
import { InsideGallery } from "@/components/site/inside-gallery";
import { ManagerPricing } from "@/components/site/manager-pricing";
import { CreditOffer, CreditSmallPrint } from "@/components/site/credit-offer";
import { Manifesto } from "@/components/site/manifesto";
import { Reveal } from "@/components/site/reveal";
import { RolesBento } from "@/components/site/roles-bento";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteDock } from "@/components/site/site-dock";
import { SiteNav } from "@/components/site/site-nav";
import { WorksWith } from "@/components/site/works-with";
import { Logo } from "@/components/ui";
import { getPublicPlan } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { Suspense } from "react";
import { appHref } from "@/lib/hosts";

export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/" } };

// Static page, refreshed every 5 minutes so a price change in /owner/settings shows up without a deploy.
export const revalidate = 300;

// Tells search engines who runs the site and what it is (shown as the knowledge panel / sitelinks search).
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      alternateName: "Toss",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      email: "toss.smartlaundry@gmail.com",
      description: SITE_DESCRIPTION,
      areaServed: { "@type": "City", name: "New Delhi" },
      sameAs: ["https://t.me/smart_laundry_control_bot"],
    },
    { "@type": "WebSite", "@id": `${SITE_URL}/#site`, name: SITE_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#org` }, inLanguage: "en-IN" },
  ],
};

// Landing page. Midnight theme, Outfit, one aqua accent. Interactive pieces are client islands under
// components/site; this page stays a Server Component that only lays them out. Each heavy island sits in its own
// <Suspense> so React hydrates them one at a time and lets the browser breathe in between: hydrated all at once
// they were one multi-second task on mid-range phones, during which taps and scrolling did nothing.
// Async so the manager pricing section can read the live price/trial/discounts from platform_settings.
export default async function Home() {
  const plan = await getPublicPlan();
  return (
    <div id="top" className="relative flex min-h-[100dvh] w-full flex-1 flex-col overflow-x-clip bg-bg text-fg selection:bg-accent/30">
      {/* constant data, no user input, so plain JSON is safe here */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <SiteNav logo={<Logo className="h-9" />} />

      <main className="flex-1">
        <HeroOrbit plan={plan} />

        <Suspense><WorksWith /></Suspense>

        <Suspense><BasketShowcase offer={<CreditOffer plan={plan} />} /></Suspense>

        <section id="control" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Reveal as="p" className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
            Toss Control on Telegram
          </Reveal>
          <Reveal as="h2" delay={0.05} className="mt-3 max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
            Your basket, in your chats.
          </Reveal>
          <Reveal as="p" delay={0.1} className="mt-5 mb-12 max-w-[60ch] text-lg leading-relaxed font-light text-secondary">
            No app to install. The basket talks to you through a Telegram bot: check how full it is, zero the scale, change when it calls a
            pickup, or ask for one now. Tap the buttons on the phone to try it.
          </Reveal>
          <Suspense><BotDemo /></Suspense>
        </section>

        <section id="manager" className="mx-auto flex max-w-7xl scroll-mt-6 flex-col justify-center px-4 py-16 sm:px-6 lg:min-h-[100dvh] lg:px-8 lg:pt-10 lg:pb-28">
          <Suspense><ManagerPricing plan={plan} /></Suspense>
        </section>

        <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Reveal as="h2" className="max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
            Three people, one basket. See your side.
          </Reveal>
          <Reveal as="p" delay={0.1} className="mt-5 max-w-[56ch] text-lg leading-relaxed font-light text-secondary">
            Pick who you are and scroll. Every step is what actually happens on Toss, from the first weigh-in to the paid invoice.
          </Reveal>
          <div className="mt-8">
            <Suspense><HowScrolly /></Suspense>
          </div>
        </section>

        <section id="inside" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <Reveal as="h2" className="text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
              Inside Toss
            </Reveal>
            <Reveal delay={0.1}>
              <a href={appHref("/login")} className="group inline-flex items-center gap-2 text-sm text-secondary transition-colors hover:text-fg">
                Sign in to your dashboard
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <Suspense><InsideGallery /></Suspense>
          </Reveal>
        </section>

        <section id="roles" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Reveal as="h2" className="mb-14 max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
            Built for everyone who touches the laundry.
          </Reveal>
          <Suspense><RolesBento /></Suspense>
        </section>

        <section id="why" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Suspense><Manifesto /></Suspense>
        </section>

        <section id="buy" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Reveal as="p" className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
            Get a Toss basket
          </Reveal>
          <Reveal as="h2" delay={0.05} className="mt-3 mb-4 max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
            Want one? Pick a colour.
          </Reveal>
          <Reveal as="p" delay={0.1} className="mb-12 max-w-[56ch] text-lg leading-relaxed font-light text-secondary">
            {plan && plan.basketPrice > 0 ? (
              <>
                <span className="font-medium text-fg">₹{plan.basketPrice.toLocaleString("en-IN")}</span>
                {plan.basketCredit > 0 && (
                  <>
                    , and it comes with <span className="font-medium text-accent">₹{plan.basketCredit.toLocaleString("en-IN")} of laundry credit</span>{" "}
                    that comes off your pickups
                  </>
                )}
                . Each box is printed to order: leave your details and we&apos;ll get back to you about availability and delivery.
              </>
            ) : (
              <>Each box is printed to order. Leave your details and we&apos;ll get back to you about availability, price and delivery.</>
            )}
          </Reveal>
          <CreditSmallPrint plan={plan} className="-mt-8 mb-12" />
          <Suspense><GetBasket /></Suspense>
        </section>
      </main>

      <SiteFooter logo={<Logo variant="full" className="h-14" />} />
      <Suspense><SiteDock /></Suspense>
    </div>
  );
}
