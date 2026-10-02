"use client";

import Link from "next/link";

// Shown when a page fails. Never shows the error itself (Next.js already replaces server errors with a
// generic one); the digest is the reference that matches the full details in the server logs.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto grid min-h-[60vh] w-full max-w-md place-items-center px-4 py-16">
      <div className="w-full rounded-[10px] border border-t-2 border-border border-t-critical bg-surface-solid p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">We couldn&apos;t load this page</h1>
        <p className="mt-2 text-sm text-secondary">Try again in a moment. If it keeps happening, send us the reference below.</p>
        {error.digest && <p className="mt-4 font-mono text-xs text-muted">Reference {error.digest}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className="btn-primary rounded-full px-5 py-2.5 text-sm font-medium">
            Try again
          </button>
          <Link href="/" className="btn-ghost rounded-full px-5 py-2.5 text-sm">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
