import { Skeleton } from "./ui";

// Loading placeholders in the shape of the dashboard pages, shown instantly by each route's loading.tsx
// while the server renders the real page.

function TitleSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-56" />
    </div>
  );
}

function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2.5 border-t-2 border-border-strong pt-3">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-border bg-surface-solid p-5 ${className}`}>
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-2.5 w-28" />
        <span className="h-px flex-1 border-t border-dotted border-border" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 py-3.5">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5" style={{ width: `${55 - i * 7}%` }} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <TitleSkeleton />
      {stats && <StatsSkeleton />}
      <PanelSkeleton rows={5} />
    </div>
  );
}

export function CustomerSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <TitleSkeleton />
      <PanelSkeleton rows={1} />
      <div className="grid gap-6 lg:grid-cols-3">
        <PanelSkeleton rows={3} className="lg:col-span-2" />
        <PanelSkeleton rows={2} />
      </div>
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <TitleSkeleton />
      <div className="rounded-[10px] border border-l-4 border-border border-l-border-strong bg-surface-solid p-6 sm:p-8">
        <div className="flex items-center gap-6">
          <Skeleton className="size-28 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        </div>
      </div>
      <StatsSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[10px] border border-border bg-surface-solid p-5">
          <Skeleton className="mb-5 h-2.5 w-28" />
          <div className="flex h-40 items-end gap-2">
            {[40, 65, 50, 80, 70, 95, 60].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-[2px] rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <PanelSkeleton rows={4} />
      </div>
    </div>
  );
}
