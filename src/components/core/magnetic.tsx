"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, type SpringOptions } from "framer-motion";

const SPRING: SpringOptions = { stiffness: 26.7, damping: 4.1, mass: 0.2 };

type Props = {
  children: React.ReactNode;
  intensity?: number;
  range?: number;
  /** "self": only while hovering this element. "parent": while hovering its parent. "global": anywhere within `range`. */
  actionArea?: "self" | "parent" | "global";
  springOptions?: SpringOptions;
  className?: string;
};

// Pulls its children toward the pointer while the pointer is within `range` px, falling off with distance.
// Nest two (outer = button, inner = label) for the label to drift a little further than the button.
export function Magnetic({ children, intensity = 0.6, range = 100, actionArea = "self", springOptions = SPRING, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const hovered = useRef(actionArea === "global");
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, springOptions);
  const sy = useSpring(y, springOptions);

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      // measure from the untranslated centre so the pull doesn't feed back on itself
      const dx = e.clientX - (r.left - sx.get() + r.width / 2);
      const dy = e.clientY - (r.top - sy.get() + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (hovered.current && d <= range) {
        const k = intensity * (1 - d / range);
        x.set(dx * k);
        y.set(dy * k);
      } else {
        x.set(0);
        y.set(0);
      }
    };
    const target = actionArea === "parent" ? el.parentElement : actionArea === "self" ? el : null;
    const enter = () => (hovered.current = true);
    const leave = () => {
      hovered.current = false;
      x.set(0);
      y.set(0);
    };
    // only track the pointer while the element is on screen
    let listening = false;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !listening) document.addEventListener("mousemove", onMove, { passive: true });
      if (!e.isIntersecting && listening) {
        document.removeEventListener("mousemove", onMove);
        x.set(0);
        y.set(0);
      }
      listening = e.isIntersecting;
    });
    io.observe(el);
    target?.addEventListener("mouseenter", enter);
    target?.addEventListener("mouseleave", leave);
    return () => {
      io.disconnect();
      target?.removeEventListener("mouseenter", enter);
      target?.removeEventListener("mouseleave", leave);
      document.removeEventListener("mousemove", onMove);
    };
  }, [actionArea, intensity, range, reduce, sx, sy, x, y]);

  return (
    <motion.div ref={ref} style={{ x: sx, y: sy }} className={className ?? "inline-block"}>
      {children}
    </motion.div>
  );
}
