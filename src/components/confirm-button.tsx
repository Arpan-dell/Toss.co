"use client";

import { useState, useTransition } from "react";

// A small destructive action (remove, delete, cancel) that asks for confirmation first.
export function ConfirmButton({
  action,
  fields,
  label,
  confirm,
  tone = "critical",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  confirm: string;
  tone?: "critical" | "neutral";
}) {
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const run = () =>
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
      try {
        await action(fd);
        setAsking(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  const color = tone === "critical" ? "text-critical" : "text-secondary";
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`text-xs ${color} hover:underline`}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex max-w-xs flex-col items-end gap-1.5 text-left" role="alertdialog" aria-label={confirm}>
      <span className="text-xs text-secondary">{confirm}</span>
      <span className="flex gap-2">
        <button type="button" disabled={pending} onClick={run} className={`rounded-full bg-critical-bg px-3 py-1 text-xs ${color} disabled:opacity-60`}>
          {pending ? "…" : `Yes, ${label.toLowerCase()}`}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="text-xs text-muted hover:text-fg">
          Keep
        </button>
      </span>
      {error && <span className="text-xs text-critical">{error}</span>}
    </span>
  );
}
