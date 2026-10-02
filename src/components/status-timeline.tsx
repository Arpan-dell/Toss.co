import type { Order } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

// PENDING → ACCEPTED → COMPLETED, matching the Telegram driver-button flow.
export function StatusTimeline({ order }: { order: Order }) {
  const steps = [
    { label: "Basket full — pickup requested", at: order.createdAt, done: true },
    { label: "Driver accepted", at: order.acceptedAt, done: order.status === "ACCEPTED" || order.status === "COMPLETED" },
    { label: "Picked up", at: order.completedAt, done: order.status === "COMPLETED" },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol className="relative space-y-5">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={`absolute top-6 left-[9px] h-[calc(100%-4px)] w-px ${
                steps[i + 1].done ? "bg-gradient-to-b from-accent to-accent-2" : "bg-border"
              }`}
            />
          )}
          <span
            aria-hidden
            className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${
              s.done
                ? "text-[#04131c] font-bold shadow-[0_0_14px_-2px_rgb(var(--accent-rgb)/0.9)]"
                : i === current
                  ? "pulse-ring border-2 border-accent bg-bg"
                  : "border-2 border-border bg-bg"
            }`}
            style={s.done ? { background: "var(--gradient)" } : undefined}
          >
            {s.done ? "✓" : ""}
          </span>
          <div>
            <p className={`text-sm ${s.done ? "text-fg" : i === current ? "font-medium text-fg" : "text-muted"}`}>
              {s.label}
              {i === current && <span className="ml-2 text-xs text-accent">up next</span>}
            </p>
            {s.at && <p className="text-xs text-muted">{formatDateTime(s.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
