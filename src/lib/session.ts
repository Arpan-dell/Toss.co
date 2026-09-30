import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Role } from "./types";

// Identity comes from the verified Supabase JWT. Managers have app_metadata.role = "manager",
// which only the service role can set; everyone else is a customer.
export interface Session {
  userId: string;
  email?: string;
  role: Role;
}

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    role: claims.app_metadata?.role === "manager" ? "MANAGER" : "CUSTOMER",
  };
});

// Authoritative check for server components; proxy.ts only does an optimistic redirect.
export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(session.role === "MANAGER" ? "/admin" : "/app");
  return session;
}
