"use client";

import { motion, useReducedMotion } from "framer-motion";

// Standard scroll entrance used across the landing page sections.
export function Reveal({ children, className = "", delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "h2" | "p" }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </M>
  );
}
