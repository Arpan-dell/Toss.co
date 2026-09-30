"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // The portal root (/app, /admin) should only match exactly; sub-pages match by prefix.
  const rootHref = items[0]?.href;
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-full border border-border bg-white/[0.03] p-1 text-sm">
      {items.map((item) => {
        const active = item.href === rootHref ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1 whitespace-nowrap transition-colors duration-300 ${
              active
                ? "bg-white/10 font-medium text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_0_20px_-6px_rgb(139_123_255/0.8)]"
                : "text-muted hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
