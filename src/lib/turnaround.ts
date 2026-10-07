// The laundry's promise on a picked-up order (migration 0022): ready_by = completed + turnaround.
type O = { status: string; readyBy?: string; readyAt?: string };

/** Picked up, not marked ready, and past its promised time. */
export const isLate = (o: O, now: Date) => o.status === "COMPLETED" && !o.readyAt && !!o.readyBy && new Date(o.readyBy).getTime() < now.getTime();

/** "Ready", "Due in 5 h", "Due in 2 days", "Late by 3 h": for the board and order pages. */
export function dueLabel(o: O, now: Date): string | null {
  if (o.status !== "COMPLETED") return null;
  if (o.readyAt) return "Ready";
  if (!o.readyBy) return null;
  const ms = new Date(o.readyBy).getTime() - now.getTime();
  const h = Math.round(Math.abs(ms) / 3_600_000);
  const span = h >= 48 ? `${Math.round(h / 24)} days` : `${Math.max(1, h)} h`;
  return ms >= 0 ? `Due in ${span}` : `Late by ${span}`;
}
