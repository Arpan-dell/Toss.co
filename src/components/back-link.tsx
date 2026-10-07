import Link from "next/link";

// "← Settings" under a page title, for pages reached from the Settings hub.
export function BackLink({ href = "/admin/settings", label = "Settings" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="inline-block text-sm text-accent hover:text-accent-2">
      ← {label}
    </Link>
  );
}
