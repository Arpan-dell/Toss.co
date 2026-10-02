"use client";

import { createContext, useContext, useOptimistic, useState } from "react";

// Optimistic UI for quick row actions (confirm a payment, skip a suggestion, suspend a business…).
// The screen changes the moment you click; the server action runs behind it. When it finishes, the
// revalidated page replaces the optimistic state. If it fails, React drops the optimistic state, so the row
// comes back as it was, with the error under the button.

const HideRow = createContext<((hidden: boolean) => void) | null>(null);

/** Hide the surrounding OptimisticRow for the duration of the current action (no-op outside one). */
export function useHideRow() {
  return useContext(HideRow);
}

export function OptimisticRow({ as: Tag = "li", className, children }: { as?: "li" | "tr" | "div"; className?: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useOptimistic(false);
  return (
    <HideRow.Provider value={setHidden}>
      <Tag className={className} hidden={hidden || undefined}>
        {children}
      </Tag>
    </HideRow.Provider>
  );
}

export function OptimisticForm({
  action,
  hide = false,
  done,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  /** remove the surrounding OptimisticRow straight away */
  hide?: boolean;
  /** or show this outcome in place of the form straight away */
  done?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const hideRow = useHideRow();
  const [shown, setShown] = useOptimistic<string | null>(null);
  const [error, setError] = useState<string>();

  return (
    <form
      className={className}
      action={async (fd) => {
        setError(undefined);
        if (hide) hideRow?.(true);
        if (done) setShown(done);
        try {
          await action(fd);
        } catch {
          setError("Couldn't save that. Try again.");
        }
      }}
    >
      {shown ? (
        <span role="status" className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-good uppercase">
          <span aria-hidden className="size-1.5 bg-current" />
          {shown}
        </span>
      ) : (
        children
      )}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-critical">
          {error}
        </span>
      )}
    </form>
  );
}
