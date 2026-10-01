"use client";

import { useState } from "react";

// A Customer ID / Business ID shown big, with one-tap copy so it's easy to share.
export function IdChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-ripple
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked: the ID is still visible to copy by hand */
        }
      }}
      className="group inline-flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-4 py-2 text-left transition-colors hover:border-accent/60"
      aria-label={`${label} ${value}. Click to copy.`}
    >
      <span>
        <span className="block text-[10px] tracking-[0.14em] text-muted uppercase">{label}</span>
        <span className="font-mono text-lg font-semibold tracking-wider text-fg">{value}</span>
      </span>
      <span className="text-xs text-accent">{copied ? "Copied ✓" : "Copy"}</span>
    </button>
  );
}
