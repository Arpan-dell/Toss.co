"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useSpring, useTransform, type MotionValue, type SpringOptions } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// macOS-style dock: items grow as the pointer nears them. All sizing runs on motion values, so moving the
// mouse along the dock never re-renders React.
const BASE = 40;
// in-app paths navigate client-side; anchors and external links stay plain <a>
const MotionLink = motion.create(Link);

type DockCtx = { mouseX: MotionValue<number>; spring: SpringOptions; magnification: number; distance: number };
const DockContext = createContext<DockCtx | null>(null);
type ItemCtx = { width: MotionValue<number>; hovered: MotionValue<number> };
const ItemContext = createContext<ItemCtx | null>(null);

function useDock() {
  const c = useContext(DockContext);
  if (!c) throw new Error("Dock parts must be inside <Dock>");
  return c;
}
function useItem() {
  const c = useContext(ItemContext);
  if (!c) throw new Error("DockLabel/DockIcon must be inside <DockItem>");
  return c;
}

type DockProps = {
  children: React.ReactNode;
  className?: string;
  spring?: SpringOptions;
  magnification?: number;
  distance?: number;
  panelHeight?: number;
};

export function Dock({ children, className = "", spring = { mass: 0.1, stiffness: 150, damping: 12 }, magnification = 72, distance = 140, panelHeight = 60 }: DockProps) {
  const reduce = useReducedMotion();
  const mag = reduce ? BASE : magnification;
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const maxHeight = useMemo(() => Math.max(panelHeight, mag + mag / 2 + 4), [mag, panelHeight]);
  const height = useSpring(useTransform(isHovered, [0, 1], [panelHeight, maxHeight]), spring);
  const ctx = useMemo(() => ({ mouseX, spring, magnification: mag, distance }), [mouseX, spring, mag, distance]);

  return (
    <motion.div style={{ height, scrollbarWidth: "none" }} className="mx-2 flex max-w-full items-end overflow-x-auto">
      <motion.div
        role="toolbar"
        aria-label="Quick navigation"
        onMouseMove={(e) => {
          isHovered.set(1);
          mouseX.set(e.clientX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        style={{ height: panelHeight }}
        className={`mx-auto flex w-fit gap-2.5 px-3 sm:gap-4 sm:px-4 ${className}`}
      >
        <DockContext.Provider value={ctx}>{children}</DockContext.Provider>
      </motion.div>
    </motion.div>
  );
}

type DockItemProps = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** called when the pointer or focus lands on the item: a cue to prefetch */
  onIntent?: () => void;
  "aria-label"?: string;
  "aria-current"?: "page";
};

export function DockItem({ children, className = "", href, onClick, onIntent, ...rest }: DockItemProps) {
  const ref = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  const { mouseX, spring, magnification, distance } = useDock();
  const hovered = useMotionValue(0);
  const offset = useTransform(mouseX, (v) => {
    const r = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return v - r.x - r.width / 2;
  });
  const width = useSpring(useTransform(offset, [-distance, 0, distance], [BASE, magnification, BASE]), spring);
  const ctx = useMemo(() => ({ width, hovered }), [width, hovered]);

  const shared = {
    style: { width },
    onHoverStart: () => {
      hovered.set(1);
      onIntent?.();
    },
    onHoverEnd: () => hovered.set(0),
    onFocus: () => {
      hovered.set(1);
      onIntent?.();
    },
    onBlur: () => hovered.set(0),
    className: `relative inline-flex shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`,
    "aria-label": rest["aria-label"],
    "aria-current": rest["aria-current"],
  };
  return (
    <ItemContext.Provider value={ctx}>
      {href?.startsWith("/") ? (
        <MotionLink ref={ref} href={href} onClick={onClick} {...shared}>
          {children}
        </MotionLink>
      ) : href ? (
        <motion.a ref={ref} href={href} onClick={onClick} {...shared}>
          {children}
        </motion.a>
      ) : (
        <motion.button ref={ref} type="button" onClick={onClick} {...shared}>
          {children}
        </motion.button>
      )}
    </ItemContext.Provider>
  );
}

export function DockLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { hovered } = useItem();
  const [visible, setVisible] = useState(false);
  useMotionValueEvent(hovered, "change", (v) => setVisible(v === 1));
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ x: "-50%" }}
          role="tooltip"
          className={`pointer-events-none absolute -top-7 left-1/2 w-fit rounded-md border border-ink/10 bg-surface-solid px-2 py-0.5 text-xs whitespace-pre text-fg ${className}`}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function DockIcon({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { width } = useItem();
  const size = useTransform(width, (v) => v / 2);
  return (
    <motion.span aria-hidden style={{ width: size, height: size }} className={`flex items-center justify-center ${className}`}>
      {children}
    </motion.span>
  );
}
