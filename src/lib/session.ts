import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "./types";

// DEMO AUTH (Phase A only). Replaced by Cognito via Amplify in Phase C, where the role
// comes from the `cognito:groups` claim and customerId from the token `sub`.
export const SESSION_COOKIE = "sl_demo_session";

export interface Session {
  role: Role;
  customerId?: string;
}

export function parseSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s.role === "CUSTOMER" || s.role === "MANAGER" ? s : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return parseSession(store.get(SESSION_COOKIE)?.value);
}

// Authoritative check for server components; proxy.ts only does an optimistic redirect.
export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(session.role === "MANAGER" ? "/admin" : "/app");
  return session;
}
