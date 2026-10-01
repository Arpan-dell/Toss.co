import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Role } from "./types";

// Identity comes from the verified Supabase JWT. app_metadata (settable only server-side) holds
// role = "owner" | "manager" and, for managers, tenant_id. Everyone else is a customer.
export interface Session {
  userId: string;
  email?: string;
  role: Role;
  tenantId?: string; // managers only; a customer's business lives on their customers row
}

export function roleFromClaims(appMetadata: Record<string, unknown> | undefined): Role {
  const role = appMetadata?.role;
  return role === "owner" ? "OWNER" : role === "manager" ? "MANAGER" : "CUSTOMER";
}

export const HOME: Record<Role, string> = { OWNER: "/owner", MANAGER: "/admin", CUSTOMER: "/app" };

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    role: roleFromClaims(claims.app_metadata),
    tenantId: typeof claims.app_metadata?.tenant_id === "string" ? claims.app_metadata.tenant_id : undefined,
  };
});

// Authoritative check for server components; proxy.ts only does an optimistic redirect.
export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(HOME[session.role]);
  return session;
}
