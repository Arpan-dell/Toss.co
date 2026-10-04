// Public addresses. The marketing site lives on SITE_URL (tosslaundry.online); sign-in and the portals live on
// APP_URL (app.tosslaundry.online). Both are served by the same deployment, and proxy.ts sends each path to its
// host. Locally and on *.vercel.app neither is set to the request's host, so everything is served as-is.
const clean = (u: string) => u.replace(/\/$/, "");

export const SITE_URL = clean(process.env.SITE_URL ?? "https://tosslaundry.online");
export const APP_URL = clean(process.env.APP_URL ?? process.env.SITE_URL ?? "https://app.tosslaundry.online");

export const SITE_NAME = "Toss Smart Laundry";
export const SITE_DESCRIPTION =
  "Toss is a smart laundry basket that weighs your clothes and books a laundry pickup by itself when it's full. Find laundries that pick up near you in Delhi, compare price per kg, and pay by UPI.";

// Paths that belong to the app host. Everything else (the website, /laundries, assets) stays on the main host;
// /api answers on any host, because the basket and the bots post to whichever address they were set up with.
const APP_PATHS = ["/app", "/admin", "/owner", "/login", "/auth", "/reset-password", "/invoice", "/r"];
// The website's own pages, which the app host sends back to the main host.
const SITE_PATHS = ["/about", "/contact", "/terms", "/privacy"];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");
export const isAppPath = (path: string) => APP_PATHS.some((p) => under(path, p));
export const isSitePath = (path: string) => path === "/" || SITE_PATHS.some((p) => under(path, p));

/** Where a request should go instead, or null to serve it here. Only acts on the two real hosts. */
export function hostRedirect(host: string | null, path: string, search: string): string | null {
  const site = new URL(SITE_URL).host;
  const app = new URL(APP_URL).host;
  if (!host || site === app) return null;
  if (host === site && isAppPath(path)) return `${APP_URL}${path}${search}`;
  if (host === app && path === "/") return `${APP_URL}/login`;
  if (host === app && isSitePath(path)) return `${SITE_URL}${path}${search}`;
  return null;
}

/** Cookie domain shared by both hosts (".tosslaundry.online"), or undefined on any other host (localhost, vercel.app). */
export function sessionCookieDomain(host: string | null): string | undefined {
  const domain = process.env.AUTH_COOKIE_DOMAIN; // e.g. ".tosslaundry.online"
  if (!domain || !host) return undefined;
  const bare = domain.replace(/^\./, "");
  const h = host.split(":")[0];
  return h === bare || h.endsWith("." + bare) ? domain : undefined;
}
