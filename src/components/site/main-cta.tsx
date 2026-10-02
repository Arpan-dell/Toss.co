"use client";

import Link from "next/link";
import { GlowEffect } from "@/components/core/glow-effect";
import { Magnetic } from "@/components/core/magnetic";

const SPRING = { bounce: 0.1 };

// Nested magnetic pull (button drifts toward the pointer, its label a little further) for the page's main
// buttons. `glow` adds the shifting aqua halo; reserve it for the primary "Get started".
export function MainCta({ href, children, className, glow = false }: { href: string; children: React.ReactNode; className: string; glow?: boolean }) {
  const inner = (
    <Magnetic intensity={0.1} springOptions={SPRING} actionArea="global" range={200}>
      <span className="inline-flex items-center gap-2">{children}</span>
    </Magnetic>
  );
  const Tag = href.startsWith("#") ? "a" : Link;
  return (
    <Magnetic intensity={0.2} springOptions={SPRING} actionArea="global" range={200}>
      <div className="relative">
        {glow && <GlowEffect colors={["#2ee6d6", "#00b4ff", "#7aa2ff", "#19cbe9"]} mode="colorShift" blur="medium" duration={3} scale={1.06} className="rounded-full" />}
        <Tag href={href} className={`relative inline-flex items-center ${className}`}>
          {inner}
        </Tag>
      </div>
    </Magnetic>
  );
}
