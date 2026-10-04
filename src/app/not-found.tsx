import Link from "next/link";
import { siteHref } from "@/lib/hosts";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[60vh] w-full max-w-md place-items-center px-4 py-16">
      <div className="w-full rounded-[10px] border border-t-2 border-border border-t-accent bg-surface-solid p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-secondary">The link may be old or mistyped.</p>
        <Link href={siteHref("/")} className="btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-medium">
          Go home
        </Link>
      </div>
    </main>
  );
}
