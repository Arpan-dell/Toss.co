import { qrSvg } from "@/lib/qr";

// QR code that opens the driver bot (Toss Handy) in Telegram. The manager shows it to a new driver,
// who scans it with their phone camera, taps Start and shares their number to connect.
export async function DriverBotQr({ username }: { username: string }) {
  const link = `https://t.me/${username}`;
  const svg = await qrSvg(link);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-white/[0.03] p-3 sm:flex-col sm:items-center sm:gap-2 sm:p-4">
      <div
        role="img"
        aria-label={`QR code for @${username}`}
        className="size-28 shrink-0 overflow-hidden rounded-xl bg-white p-1.5 shadow-[0_0_30px_-8px_rgb(2_169_161/0.6)] sm:size-36 [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="space-y-1 text-xs sm:text-center">
        <p className="font-medium text-fg">Scan to open Toss Handy</p>
        <p className="text-muted">The driver scans, taps Start and shares their number.</p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 sm:justify-center">
          <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download="toss-handy-qr.svg" className="text-accent hover:text-accent-2">
            Download
          </a>
          <a href={link} target="_blank" rel="noreferrer" className="font-mono text-accent hover:text-accent-2">
            @{username}
          </a>
        </p>
      </div>
    </div>
  );
}
