"use client";

import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// Line-art solar system behind the sign-in card: the planets line up through the middle of the screen, so they
// show softly through the frosted glass. One image per theme (cream on black, navy on light). It drifts a little
// against the pointer so the glass in front reads as a separate layer.
export function LoginBackdrop() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(useTransform(px, [-0.5, 0.5], [18, -18]), { stiffness: 60, damping: 20 });
  const y = useSpring(useTransform(py, [-0.5, 0.5], [14, -14]), { stiffness: 60, damping: 20 });

  useEffect(() => {
    if (reduce) return;
    const move = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduce, px, py]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <motion.div
        initial={reduce ? false : { scale: 1.16, opacity: 0 }}
        animate={{ scale: 1.08, opacity: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ x, y }}
        className="absolute inset-0"
      >
        <Image src="/brand/login/cosmos-dark.webp" alt="" fill priority sizes="100vw" className="object-cover light:hidden" />
        <Image src="/brand/login/cosmos-light.webp" alt="" fill priority sizes="100vw" className="hidden object-cover light:block" />
      </motion.div>
      {/* accent light leaking through the cracks, behind the card */}
      <div className="absolute top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[140px]" />
    </div>
  );
}
