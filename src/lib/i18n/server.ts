import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, translator, type Locale, type T } from ".";

/** The visitor's language, from the toss-lang cookie (English if none). Makes the page dynamic: portals only. */
export async function getLocale(): Promise<Locale> {
  return (await cookies()).get(LANG_COOKIE)?.value === "hi" ? "hi" : "en";
}

/** The translate function for the visitor's language, for Server Components and server actions. */
export async function getT(): Promise<T> {
  return translator(await getLocale());
}
