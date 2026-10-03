import type { PortalNavItem } from "@/components/portal-dock";

// The customer portal's dock. Shared with /laundries, which a signed-in customer sees inside the portal.
export const CUSTOMER_NAV: PortalNavItem[] = [
  { href: "/app", label: "Overview", icon: "home" },
  { href: "/app/orders", label: "Order history", icon: "history" },
  { href: "/laundries", label: "Find a laundry", icon: "find" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];
