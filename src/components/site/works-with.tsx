// The services Toss actually plugs into. One marquee on the page, logos only (Simple Icons, self-hosted).
// A pure CSS animation (.marquee-track) so the endless scroll runs on the compositor, not in JS.
const LOGOS = [
  { file: "telegram", name: "Telegram" },
  { file: "googlepay", name: "Google Pay" },
  { file: "phonepe", name: "PhonePe" },
  { file: "paytm", name: "Paytm" },
  { file: "googlemaps", name: "Google Maps" },
  { file: "gmail", name: "Gmail" },
];

export function WorksWith() {
  const row = [...LOGOS, ...LOGOS, ...LOGOS];
  return (
    <section aria-label="Works with" className="relative border-y border-ink/5 py-14">
      <p className="mx-auto max-w-6xl px-4 text-center text-sm text-muted sm:px-6 lg:px-8">Works with the apps you already use</p>
      <div className="relative mt-8 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-bg to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-bg to-transparent" />
        <ul className="marquee-track flex w-max items-center gap-20">
          {[...row, ...row].map((l, i) => (
            <li key={i} className="flex shrink-0 items-center gap-3 opacity-60 transition-opacity hover:opacity-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/brand/logos/${l.file}.svg`} alt={l.name} className="h-7 w-auto light:brightness-0" loading="lazy" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
