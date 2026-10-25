import Link from "next/link";

// The bottom dock: a row of round icon buttons with a label on hover. Deliberately static: no magnification, no
// springs and no mouse tracking (that measured every icon on every mouse move, which made pages feel laggy).
// The hover label and the small lift are plain CSS. Kept as server-safe components with the same API.
const BASE = 40;

type DockProps = {
  children: React.ReactNode;
  className?: string;
  panelHeight?: number;
};

export function Dock({ children, className = "", panelHeight = 60 }: DockProps) {
  return (
    <div className="mx-2 flex max-w-full items-end overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div role="toolbar" aria-label="Quick navigation" style={{ height: panelHeight }} className={`mx-auto flex w-fit gap-2.5 px-3 sm:gap-4 sm:px-4 ${className}`}>
        {children}
      </div>
    </div>
  );
}

type DockItemProps = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** called when the pointer or focus lands on the item: a cue to prefetch */
  onIntent?: () => void;
  "aria-label"?: string;
  "aria-current"?: "page";
};

export function DockItem({ children, className = "", href, onClick, onIntent, ...rest }: DockItemProps) {
  const shared = {
    style: { width: BASE, height: BASE },
    onMouseEnter: onIntent,
    onFocus: onIntent,
    className: `group/dock relative inline-flex shrink-0 items-center justify-center outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent ${className}`,
    "aria-label": rest["aria-label"],
    "aria-current": rest["aria-current"],
  };
  if (href?.startsWith("/"))
    return (
      <Link href={href} onClick={onClick} {...shared}>
        {children}
      </Link>
    );
  if (href)
    return (
      <a href={href} onClick={onClick} {...shared}>
        {children}
      </a>
    );
  return (
    <button type="button" onClick={onClick} {...shared}>
      {children}
    </button>
  );
}

export function DockLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute -top-8 left-1/2 w-fit -translate-x-1/2 rounded-md border border-ink/10 bg-surface-solid px-2 py-0.5 text-xs whitespace-pre text-fg opacity-0 transition-opacity duration-150 group-hover/dock:opacity-100 group-focus-visible/dock:opacity-100 ${className}`}
    >
      {children}
    </span>
  );
}

export function DockIcon({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden style={{ width: BASE / 2, height: BASE / 2 }} className={`flex items-center justify-center ${className}`}>
      {children}
    </span>
  );
}
