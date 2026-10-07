import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search engines may crawl the public site; the portals, APIs and one-off links (invoices, referral
// redirects, password resets) are private or useless in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/admin", "/owner", "/api/", "/auth/", "/invoice/", "/r/", "/rate/", "/reset-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
