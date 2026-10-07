"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listMyBranches } from "../branches";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";

// Branches: a manager running several laundries. Adding one needs Pro on the main business; switching works on any
// plan so nobody gets stuck in a branch. The current branch is app_metadata.tenant_id (set only server-side), so
// every page and RLS policy follows the switch.

async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return session;
}

async function moveTo(userId: string, tenantId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.auth.admin.getUserById(userId);
  const meta = data.user?.app_metadata ?? {};
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...meta, role: "manager", tenant_id: tenantId } });
  if (error) throw error;
  // new access token with the new tenant_id claim (cookies are rewritten by the server client)
  await (await createClient()).auth.refreshSession();
}

export async function switchBranch(fd: FormData) {
  const session = await requireManager();
  const id = text(fd, "tenantId");
  const mine = await listMyBranches(session.userId);
  if (id !== session.tenantId && mine.some((b) => b.id === id)) {
    await moveTo(session.userId, id);
    revalidatePath("/", "layout");
  }
  redirect("/admin");
}

export async function addBranch(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireManager();
  const main = (await listMyBranches(session.userId)).find((b) => b.main);
  if (!main || main.tier !== "PRO") return { error: "Branches need Toss Pro on your main business. Upgrade under Billing." };
  const { data, error } = await supabaseAdmin().rpc("add_branch", { p_user: session.userId, p_name: text(fd, "name") });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin", "layout");
  return { message: `Branch added. Its Business ID is ${(data as { join_code: string }).join_code}: switch to it to add drivers, baskets and the store address.` };
}
