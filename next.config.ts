import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited dashboard pages in the client router cache so tab switches don't refetch. Freshness is
    // event-driven instead: LiveRefresh calls router.refresh() on realtime changes and every server action
    // revalidates, and both clear this cache.
    staleTimes: { dynamic: 120, static: 300 },
  },
};

export default nextConfig;
