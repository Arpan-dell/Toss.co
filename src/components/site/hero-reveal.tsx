"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";
import { MainCta } from "./main-cta";

// Scroll-masked hero. A 300vh runway pins a full-screen stage; as you scroll, a circle grows from the
// basket and swaps the blueprint sketch (the idea) for the real photo (the reality). The image plane
// starts tilted back in 3D and settles flat, and both layers drift with the pointer for depth.
export function HeroReveal() {
  const runway = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: runway, offset: ["start start", "end end"] });

  const radius = useTransform(scrollYProgress, [0.04, 0.72], reduce ? [150, 150] : [0, 150]);
  const clipPath = useMotionTemplate`circle(${radius}% at 66% 64%)`;
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1, 1.15]);
  const rotateX = useTransform(scrollYProgress, [0, 0.6], reduce ? [0, 0] : [9, 0]);
  const before = useTransform(scrollYProgress, [0.12, 0.3], [1, 0]);
  const after = useTransform(scrollYProgress, [0.3, 0.48], [0, 1]);

  // pointer parallax (motion values, never React state)
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const sketchX = useTransform(sx, (v) => v * -12);
  const sketchY = useTransform(sy, (v) => v * -8);
  const rotateY = useTransform(sx, (v) => (reduce ? 0 : v * 2.5));

  return (
    <section
      ref={runway}
      className="relative h-[300vh]"
      onPointerMove={(e) => {
        if (reduce) return;
        mx.set(e.clientX / window.innerWidth - 0.5);
        my.set(e.clientY / window.innerHeight - 0.5);
      }}
    >
      <div className="sticky top-0 h-[100dvh] overflow-hidden [perspective:1400px]">
        <motion.div style={{ scale, rotateX, rotateY, transformOrigin: "50% 80%" }} className="absolute inset-0 will-change-transform">
          <motion.div style={{ x: sketchX, y: sketchY }} className="absolute -inset-6">
            {/* light theme gets a pre-inverted copy (navy ink on paper) rather than a live CSS filter */}
            <Image src="/brand/site/hero-sketch.webp" alt="" fill priority sizes="100vw" className="object-cover object-[60%_center] light:hidden" />
            <Image src="/brand/site/hero-sketch-light.webp" alt="" fill priority sizes="100vw" className="hidden object-cover object-[60%_center] light:block" />
          </motion.div>
          <motion.div style={{ clipPath }} className="absolute inset-0">
            <Image
              src="/brand/site/hero-real.webp"
              alt="Laundry baskets overflowing at the foot of a bed"
              fill
              priority
              sizes="100vw"
              className="object-cover object-[60%_center]"
            />
          </motion.div>
        </motion.div>

        {/* legibility: darken behind the copy, fade into the page below */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
        {/* phones: the copy sits at the bottom, so shade upward from there too */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-bg via-bg/75 to-transparent md:hidden" />

        <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-20 sm:px-6 md:justify-center md:pb-0 lg:px-8">
          <div className="max-w-2xl">
            <p className="relative h-5 text-xs font-bold tracking-widest text-accent uppercase">
              <motion.span style={{ opacity: before }} className="absolute inset-0">
                Before Toss
              </motion.span>
              <motion.span style={{ opacity: after }} className="absolute inset-0">
                With Toss
              </motion.span>
            </p>
            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 text-[clamp(2.6rem,6.2vw,5.4rem)] leading-[1.02] font-black tracking-[-0.035em]"
            >
              Laundry that calls its own pickup.
            </motion.h1>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-[34rem] text-lg leading-relaxed font-light text-secondary"
            >
              A smart basket weighs your clothes, books the nearest driver and sends the bill to UPI. You just fill it.
            </motion.p>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <MainCta href="/login" glow className="btn-primary rounded-full px-7 py-3.5 text-base font-semibold">
                Get started <ArrowRight size={18} weight="bold" />
              </MainCta>
              <MainCta href="#how" className="btn-ghost rounded-full px-7 py-3.5 text-base font-medium text-fg">
                See how it works
              </MainCta>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
