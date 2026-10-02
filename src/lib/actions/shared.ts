import "server-only";

export interface FormState {
  error?: string;
  message?: string;
}

export const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// Postgres exceptions raised by our SQL functions → messages people can act on.
const MESSAGES: Record<string, string> = {
  unknown_business_id: "No business has that ID. Check it with your laundry and try again.",
  business_suspended: "That business isn't accepting customers right now.",
  only_customers_can_join: "Only customer accounts can join a business.",
  invalid_reference: "That doesn't look like a UPI reference. It's usually a 12-digit number in your UPI app's payment details.",
  order_not_payable: "This order can't be paid right now. It may already be paid or awaiting confirmation.",
  only_managers: "Only business managers can do this.",
  invalid_months: "Choose between 1 and 12 months.",
  already_manages_a_business: "This account already runs a business.",
  customer_not_in_business: "That customer isn't part of your business.",
  payment_not_pending: "That payment was already reviewed.",
  pickup_in_progress: "You have a pickup in progress. Switch laundries once it's picked up.",
};

export function friendlyError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? "";
  const key = Object.keys(MESSAGES).find((k) => msg.includes(k));
  return key ? MESSAGES[key] : "Something went wrong. Please try again.";
}
