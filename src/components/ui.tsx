import Image from "next/image";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import { CountUp } from "./count-up";
import { Tilt } from "./tilt";

export function Card({ title, action, children, className = "" }: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass glow-card rounded-2xl p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Tilt max={8}>
      <div className="glass glow-card group relative overflow-hidden rounded-2xl p-5">
        <div
          aria-hidden
          className="absolute -top-12 -right-12 size-32 rounded-full bg-accent/20 opacity-50 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        />
        <p className="text-xs tracking-[0.14em] text-muted uppercase">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-fg">
          <CountUp value={value} />
        </p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </Tilt>
  );
}

type Tone = "good" | "warn" | "critical" | "info" | "neutral";
const toneClass: Record<Tone, string> = {
  good: "bg-good-bg text-good ring-good/25",
  warn: "bg-warn-bg text-warn ring-warn/25",
  critical: "bg-critical-bg text-critical ring-critical/25",
  info: "bg-info-bg text-info ring-info/25",
  neutral: "bg-surface-2 text-secondary ring-ink/10",
};

// Status is never color-alone: every badge carries an icon (or live dot) + label.
export function Badge({ tone, icon, live = false, children }: {
  tone: Tone;
  icon?: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${toneClass[tone]}`}
    >
      {live ? <span className="live-dot" aria-hidden /> : icon && <span aria-hidden>{icon}</span>}
      {children}
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
        className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Basket fill"
      >
        <div className="fill-bar h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
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
      {kicker && <p className="text-xs tracking-[0.18em] text-accent uppercase">{kicker}</p>}
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{children}</h1>
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

