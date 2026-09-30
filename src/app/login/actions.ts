"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_CUSTOMER_ID } from "@/lib/mock-data";
import { SESSION_COOKIE, type Session } from "@/lib/session";

// DEMO AUTH (Phase A). Replaced by Amplify Auth / Cognito sign-in in Phase C.
export async function signInAs(formData: FormData) {
  const role = formData.get("role");
  const session: Session =
    role === "MANAGER" ? { role: "MANAGER" } : { role: "CUSTOMER", customerId: DEMO_CUSTOMER_ID };

  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect(session.role === "MANAGER" ? "/admin" : "/app");
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
