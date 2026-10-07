"use client";

import { useTransition } from "react";

// Manager header: which branch the dashboard shows. Picking another one switches the whole portal to it.
export function BranchSwitcher({
  action,
  current,
  branches,
}: {
  action: (fd: FormData) => Promise<void>;
  current: string;
  branches: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span>Branch</span>
      <select
        defaultValue={current}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("tenantId", e.target.value);
          start(() => action(fd));
        }}
        className="max-w-[220px] rounded-full border border-border bg-surface-solid px-3 py-1.5 text-sm text-fg disabled:opacity-60"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
