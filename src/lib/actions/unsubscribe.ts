"use server";

import { optOut, readUnsubscribeLink } from "../unsubscribe";
import type { FormState } from "./shared";

// The unsubscribe page's button. The signed link is checked again here, so the form can't be pointed at someone
// else's address.
export async function unsubscribe(_prev: FormState, formData: FormData): Promise<FormState> {
  const link = readUnsubscribeLink(String(formData.get("e") ?? ""), String(formData.get("c") ?? ""), String(formData.get("t") ?? ""));
  if (!link) return { error: "This unsubscribe link isn't valid any more. Use the link in your latest email." };
  const all = formData.get("scope") === "all";
  const ok = await optOut(link.email, [all ? "all" : link.category]);
  return ok
    ? { message: all ? "Done. You won't get any optional emails from Toss. Invoices and account emails still arrive." : "Done. You won't get these emails any more." }
    : { error: "Couldn't save that. Please try again in a minute." };
}
