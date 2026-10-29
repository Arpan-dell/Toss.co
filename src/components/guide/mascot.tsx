// Tossy, the Toss mascot: a little laundry basket with a towel peeking out, in the theme's own colours (the accent
// for the basket, the third accent for the towel), so it fits both themes. It blinks now and then and opens its
// mouth while it's talking. Plain SVG and CSS: no images to load, nothing that runs per frame.
export function Mascot({ size = 48, talking = false, className = "" }: { size?: number; talking?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      {/* towel peeking out of the basket */}
      <path d="M17 22c1-7 6-11 13-10 4 .6 6 3 9 3 3.6 0 6-2.6 8.6-1.4 2.4 1.1 2.6 4.7 1.4 8.4z" fill="var(--accent-3)" />
      <path d="M22 18.5c3-2 6-2.4 9-1.4" stroke="rgb(0 0 0 / 0.18)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* basket */}
      <path d="M8.5 23h47a2 2 0 0 1 2 2.3l-4.3 27.2A4 4 0 0 1 49.3 56H14.7a4 4 0 0 1-3.9-3.5L6.5 25.3a2 2 0 0 1 2-2.3z" fill="var(--accent)" />
      <path d="M11.6 47.5h40.8M12.4 52h39.2" stroke="rgb(0 0 0 / 0.16)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="5" y="20" width="54" height="6.5" rx="3.25" fill="var(--accent)" />
      <rect x="5" y="20" width="54" height="6.5" rx="3.25" fill="rgb(0 0 0 / 0.18)" />
      {/* face */}
      <g className="tossy-eyes">
        <circle cx="25" cy="35.5" r="4.4" fill="#fff" />
        <circle cx="39" cy="35.5" r="4.4" fill="#fff" />
        <circle cx="25.8" cy="36.2" r="2.3" fill="#16110d" />
        <circle cx="39.8" cy="36.2" r="2.3" fill="#16110d" />
        <circle cx="26.6" cy="35.2" r="0.8" fill="#fff" />
        <circle cx="40.6" cy="35.2" r="0.8" fill="#fff" />
      </g>
      <ellipse cx="19.5" cy="41.5" rx="2.6" ry="1.6" fill="#ff8a8a" opacity="0.55" />
      <ellipse cx="44.5" cy="41.5" rx="2.6" ry="1.6" fill="#ff8a8a" opacity="0.55" />
      {talking ? (
        <path d="M28.5 41.6h7a.6.6 0 0 1 .6.7c-.5 2.6-2.1 4-4.1 4s-3.6-1.4-4.1-4a.6.6 0 0 1 .6-.7z" fill="#16110d" className="tossy-talk" />
      ) : (
        <path d="M28.6 42.2c1.9 2.2 4.9 2.2 6.8 0" stroke="#16110d" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}
