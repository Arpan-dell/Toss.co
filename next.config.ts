import type { NextConfig } from "next";

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabase.replace(/^https:/, "wss:");
const dev = process.env.NODE_ENV !== "production";

// What the browser may load. Scripts only from this site and Telegram's Mini App script. 'unsafe-inline' stays
// for scripts because Next.js and the theme switch use inline bootstrap scripts (a nonce would force every page,
// including the landing page, to render per request); external script injection is still blocked. Framing is
// limited to Telegram (Telegram Web shows Mini Apps in an iframe), which is why there's no X-Frame-Options: DENY.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://telegram.org${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}${dev ? " ws:" : ""}`.trim(),
  "frame-src 'self'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Keep visited dashboard pages in the client router cache so tab switches don't refetch. Freshness is
    // event-driven instead: LiveRefresh calls router.refresh() on realtime changes and every server action
    // revalidates, and both clear this cache.
    staleTimes: { dynamic: 120, static: 300 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // pages get the CSP; invoice PDFs are files, and a page policy on them can stop the browser's PDF viewer
      { source: "/((?!invoice/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
      // the app host (sign-in and portals) stays out of search; only the website on the main host is indexed
      { source: "/:path*", has: [{ type: "host", value: "app.tosslaundry.online" }], headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
