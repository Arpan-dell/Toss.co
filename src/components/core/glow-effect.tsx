"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";

type Mode = "rotate" | "pulse" | "breathe" | "colorShift" | "flowHorizontal" | "static";
type Blur = "softest" | "soft" | "medium" | "strong" | "stronger" | "strongest" | "none" | number;

const BLUR: Record<Exclude<Blur, number>, string> = {
  softest: "blur-xs",
  soft: "blur-sm",
  medium: "blur-md",
  strong: "blur-lg",
  stronger: "blur-xl",
  strongest: "blur-2xl",
  none: "blur-none",
};

type Props = {
  colors?: string[];
  mode?: Mode;
  blur?: Blur;
  duration?: number;
  scale?: number;
  className?: string;
};

// An animated, blurred gradient that sits behind its sibling (put both in a `relative` wrapper and give the
// sibling `relative` so it stacks on top).
export function GlowEffect({ colors = ["#2ee6d6", "#00b4ff", "#7aa2ff", "#19cbe9"], mode = "rotate", blur = "medium", duration = 5, scale = 1, className = "" }: Props) {
  const reduce = useReducedMotion();
  const loop: Transition = { duration, repeat: Infinity, ease: "linear" };
  const conic = (deg: number) => `conic-gradient(from ${deg}deg at 50% 50%, ${colors.join(", ")}, ${colors[0]})`;

  const animations: Record<Mode, { background: string | string[]; scale?: number[]; opacity?: number[]; transition?: Transition }> = {
    rotate: { background: [0, 90, 180, 270, 360].map(conic), transition: loop },
    pulse: {
      background: colors.map((c) => `radial-gradient(circle at 50% 50%, ${c} 0%, transparent 100%)`),
      scale: [scale, scale * 1.1, scale],
      opacity: [0.5, 0.8, 0.5],
      transition: { ...loop, repeatType: "mirror" },
    },
    breathe: {
      background: colors.map((c) => `radial-gradient(circle at 50% 50%, ${c} 0%, transparent 100%)`),
      scale: [scale, scale * 1.05, scale],
      transition: { ...loop, repeatType: "mirror" },
    },
    colorShift: {
      background: colors.map((c, i) => {
        const next = colors[(i + 1) % colors.length];
        return `conic-gradient(from 0deg at 50% 50%, ${c} 0%, ${next} 50%, ${c} 100%)`;
      }),
      transition: { ...loop, repeatType: "mirror" },
    },
    flowHorizontal: {
      background: colors.map((c, i) => {
        const next = colors[(i + 1) % colors.length];
        return `linear-gradient(to right, ${c}, ${next})`;
      }),
      transition: { ...loop, repeatType: "mirror" },
    },
    static: { background: `linear-gradient(to right, ${colors.join(", ")})` },
  };

  const a = animations[reduce ? "static" : mode];
  const blurClass = typeof blur === "number" ? "" : BLUR[blur];
  return (
    <motion.div
      aria-hidden
      style={{ scale, willChange: "transform", backfaceVisibility: "hidden", filter: typeof blur === "number" ? `blur(${blur}px)` : undefined }}
      animate={a}
      className={`pointer-events-none absolute inset-0 h-full w-full transform-gpu ${blurClass} ${className}`}
    />
  );
}
