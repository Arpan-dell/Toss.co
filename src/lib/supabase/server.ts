import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sessionCookie } from "./cookies";

// Per-request client that acts as the signed-in user, so Postgres RLS applies.
export async function createClient() {
  const cookieStore = await cookies();
  const host = (await headers()).get("host");
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, sessionCookie(options, host)));
        } catch {
          // Called from a Server Component, which can't write cookies. proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}
