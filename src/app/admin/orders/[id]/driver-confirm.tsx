import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui";
import { remindDriver } from "@/lib/actions/delivery";
import { formatDateTime, timeAgo } from "@/lib/format";

// Under the driver's name: did the job reach them? "Got it" (or acting on it) confirms; until then the manager can
// remind them once, which replaces the earlier message instead of adding another.
export function DriverConfirm({
  orderId,
  kind,
  name,
  ackAt,
  sentAt,
  now,
}: {
  orderId: string;
  kind: "pickup" | "delivery";
  name: string;
  ackAt?: string;
  sentAt?: string;
  now: Date;
}) {
  if (ackAt) {
    return (
      <span className="mt-1 flex flex-wrap items-center gap-2">
        <Badge tone="good">✓ Confirmed</Badge>
        <span className="text-xs text-muted">{formatDateTime(ackAt)}</span>
      </span>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <Badge tone="warn">⏳ Not confirmed yet</Badge>
      {sentAt && <span className="text-xs text-muted">sent {timeAgo(sentAt, now)}</span>}
      <ConfirmButton
        action={remindDriver}
        fields={{ orderId, kind }}
        label="🔔 Remind driver"
        tone="neutral"
        confirm={`Send ${name} this ${kind} again? The earlier message is deleted first, so they only see one.`}
      />
    </span>
  );
}
