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
  neutral: "bg-surface-2 text-secondary ring-white/10",
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

export function FillBar({ weightKg, targetKg }: { weightKg: number; targetKg: number }) {
  const pct = Math.min(100, Math.round((weightKg / targetKg) * 100));
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
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

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-xl text-sm shadow-[0_0_24px_-4px_rgb(139_123_255/0.8)]"
        style={{ background: "var(--gradient)" }}
      >
        🧺
      </span>
      <span>
        Toss<span className="text-gradient">.</span>
      </span>
    </span>
  );
}
