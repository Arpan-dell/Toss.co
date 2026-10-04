// Links that cross between the website (tosslaundry.online) and the app (app.tosslaundry.online). Safe in client
// components. With the public env unset (locally, preview builds) they stay relative, so one host serves both.
// Pointing straight at the other host avoids a prefetch that the proxy would redirect cross-origin.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const APP = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

/** A page on the website, e.g. siteHref("/") from the login page. */
export const siteHref = (path: string) => SITE + path;
/** A page in the app, e.g. appHref("/login") from the website. */
export const appHref = (path: string) => APP + path;
