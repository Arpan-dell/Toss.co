import { HowScrolly } from "@/components/how-scrolly";
import { HeroReveal } from "@/components/site/hero-reveal";
import { InsideGallery } from "@/components/site/inside-gallery";
import { Manifesto } from "@/components/site/manifesto";
import { Reveal } from "@/components/site/reveal";
import { RolesBento } from "@/components/site/roles-bento";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteDock } from "@/components/site/site-dock";
import { SiteNav } from "@/components/site/site-nav";
import { WorksWith } from "@/components/site/works-with";
import { Logo } from "@/components/ui";

// Landing page. Midnight theme, Outfit, one aqua accent. Interactive pieces are client islands under
// components/site; this page stays a Server Component that only lays them out.
export default function Home() {
  return (
    <div id="top" className="relative flex min-h-[100dvh] w-full flex-1 flex-col overflow-x-clip bg-[#0c1128] text-white selection:bg-[#2ee6d6]/30">
      <SiteNav logo={<Logo className="h-9" />} />

      <main className="flex-1">
        <HeroReveal />

        <WorksWith />

        <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Reveal as="h2" className="max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
            Three people, one basket. See your side.
          </Reveal>
          <Reveal as="p" delay={0.1} className="mt-5 max-w-[56ch] text-lg leading-relaxed font-light text-gray-300">
            Pick who you are and scroll. Every step is what actually happens on Toss, from the first weigh-in to the paid invoice.
          </Reveal>
          <div className="mt-8">
            <HowScrolly />
          </div>
        </section>

        <section id="inside" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <Reveal as="h2" className="text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
              Inside Toss
            </Reveal>
            <Reveal delay={0.1}>
              <a href="/login" className="group inline-flex items-center gap-2 text-sm text-gray-300 transition-colors hover:text-white">
                Sign in to your dashboard
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <InsideGallery />
          </Reveal>
        </section>

        <section id="roles" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Reveal as="h2" className="mb-14 max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
            Built for everyone who touches the laundry.
          </Reveal>
          <RolesBento />
        </section>

        <section id="why" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-32 sm:px-6 lg:px-8">
          <Manifesto />
        </section>
      </main>

      <SiteFooter logo={<Logo variant="full" className="h-14" />} />
      <SiteDock />
    </div>
  );
}
