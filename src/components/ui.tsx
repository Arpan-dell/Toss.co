import Image from "next/image";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import { CountUp } from "./count-up";

// Dashboard visual system ("dispatch ledger"): flat solid panels with hairline borders, monospace labels
// with a dotted leader like a laundry ticket, figures in mono on a heavy top rule, and square-cornered status
// tags. Shape rule: panels 10px, inputs 8px, tags 4px; only buttons are pills. No glass, glow or gradients.

export function Card({ title, action, children, className = "" }: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[10px] border border-border bg-surface-solid p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center gap-3">
          {title && <h2 className="shrink-0 font-mono text-[11px] font-medium tracking-[0.12em] text-secondary uppercase">{title}</h2>}
          <span aria-hidden className="h-px flex-1 border-t border-dotted border-border-strong" />
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-t-2 border-fg pt-3">
      <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{label}</p>
      <p className="mt-1.5 font-mono text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums text-fg">
        <CountUp value={value} />
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

type Tone = "good" | "warn" | "critical" | "info" | "neutral";
const toneClass: Record<Tone, string> = {
  good: "text-good border-good/35",
  warn: "text-warn border-warn/40",
  critical: "text-critical border-critical/35",
  info: "text-info border-info/35",
  neutral: "text-secondary border-border-strong",
};

// Status is never color-alone: every tag carries a label, and live states pulse their marker.
// `icon` is accepted for older call sites but the marker square replaces it.
export function Badge({ tone, live = false, children }: {
  tone: Tone;
  icon?: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide whitespace-nowrap uppercase ${toneClass[tone]}`}
    >
      <span aria-hidden className={`size-1.5 shrink-0 bg-current ${live ? "tag-live" : ""}`} />
      {children}
    </span>
  );
}

// Pulsing placeholder in the shape of the content it stands in for.
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden style={style} className={`skeleton block rounded-[6px] bg-ink/[0.07] ${className}`} />;
}

// Tooltip for icon-only controls: shows on hover and on keyboard focus. Wrap the control; `label` should
// match its aria-label.
export function Tip({ label, children, side = "bottom" }: { label: string; children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-[6px] border border-border bg-surface-solid px-2 py-1 font-mono text-[11px] whitespace-nowrap text-fg opacity-0 shadow-lg transition-[opacity,translate] duration-150 group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100 ${
          side === "top" ? "bottom-full mb-2 translate-y-1 group-hover/tip:translate-y-0" : "top-full mt-2 -translate-y-1 group-hover/tip:translate-y-0"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

const orderStatusMeta: Record<OrderStatus, { tone: Tone; icon: string; label: string; live?: boolean }> = {
  PENDING: { tone: "warn", icon: "⏳", label: "Awaiting driver", live: true },
  ACCEPTED: { tone: "info", icon: "🚚", label: "Driver en route", live: true },
  COMPLETED: { tone: "good", icon: "✓", label: "Picked up" },
  CANCELLED: { tone: "neutral", icon: "✕", label: "Cancelled" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = orderStatusMeta[status];
  return <Badge tone={m.tone} icon={m.icon} live={m.live}>{m.label}</Badge>;
}

const paymentMeta: Record<PaymentStatus, { tone: Tone; icon: string; label: string }> = {
  UNPAID: { tone: "critical", icon: "!", label: "Unpaid" },
  PENDING: { tone: "warn", icon: "…", label: "Processing" },
  PAID: { tone: "good", icon: "✓", label: "Paid" },
  REFUNDED: { tone: "neutral", icon: "↩", label: "Refunded" },
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const m = paymentMeta[status];
  return <Badge tone={m.tone} icon={m.icon}>{m.label}</Badge>;
}

export function OnlineBadge({ online }: { online: boolean }) {
  return online ? (
    <Badge tone="good" live>Online</Badge>
  ) : (
    <Badge tone="critical" icon="○">Offline</Badge>
  );
}

// Firmware v1 baskets only report weight when they place an order and never send a target,
// so both values are optional.
export function FillBar({ weightKg, targetKg }: { weightKg?: number; targetKg?: number }) {
  if (weightKg === undefined) return <p className="text-xs text-muted">No live weight yet. Needs firmware v2.</p>;
  if (!targetKg) return <p className="text-xs tabular-nums text-muted">Last reading {weightKg.toFixed(1)} kg</p>;

  const pct = Math.min(100, Math.round((weightKg / targetKg) * 100));
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-[2px] bg-ink/[0.07]"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Basket fill"
      >
        <div className="h-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-muted">
        {weightKg.toFixed(1)} / {targetKg} kg · <span className="text-secondary">{pct}%</span>
      </p>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function PageTitle({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div>
      {kicker && (
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          <span aria-hidden className="size-1.5 bg-accent" />
          {kicker}
        </p>
      )}
      <h1 className="mt-2 text-[2.1rem] leading-tight font-bold tracking-tight">{children}</h1>
    </div>
  );
}

// Brand artwork lives in public/brand (generated from the original logo). Each base has a "-light" twin
// with navy letters for the light theme; CSS shows the one that matches.
// "wordmark" = shirt + TOSS for headers; "full" adds the SMART LAUNDRY tagline.
// Each variant is two same-size layers: the logo without the shirt, and the shirt alone,
// so the shirt can wave (see .logo-shirt in globals.css) while the letters stay still.
const LOGOS = {
  wordmark: { base: "/brand/toss-wordmark-base.png", shirt: "/brand/toss-wordmark-shirt.png", width: 588, height: 288 },
  full: { base: "/brand/toss-logo-base.png", shirt: "/brand/toss-logo-shirt.png", width: 588, height: 335 },
};

// The shirt pivots where it bursts out of the "O": pixel (240, 160) in both source images.
const SHIRT_PIVOT = { x: 240, y: 160 };

export function Logo({ variant = "wordmark", className = "h-11" }: { variant?: keyof typeof LOGOS; className?: string }) {
  const l = LOGOS[variant];
  // The glow sits on each image, not the wrapper: a filter on the wrapper would be re-rendered on every
  // frame of the shirt's wave instead of the wave running on the GPU.
  const glow = "drop-shadow-[0_0_18px_rgb(2_169_161/0.35)]";
  return (
    <span className={`logo relative inline-block ${className}`} role="img" aria-label="Toss">
      <Image src={l.base} width={l.width} height={l.height} alt="" priority className={`h-full w-auto light:hidden ${glow}`} />
      <Image src={l.base.replace(".png", "-light.png")} width={l.width} height={l.height} alt="" priority className={`hidden h-full w-auto light:block ${glow}`} />
      <Image
        src={l.shirt}
        width={l.width}
        height={l.height}
        alt=""
        priority
        className={`logo-shirt absolute inset-0 h-full w-auto ${glow}`}
        style={{ transformOrigin: `${(SHIRT_PIVOT.x / l.width) * 100}% ${(SHIRT_PIVOT.y / l.height) * 100}%` }}
      />
    </span>
  );
}

