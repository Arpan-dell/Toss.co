import "server-only";
import { customerInvoice } from "../email/templates";
import { emailEnabled, sendEmail } from "../email/mailer";
import { orderLabel } from "../format";
import { formatPhone } from "../phone";
import { supabaseAdmin } from "../supabase/admin";
import { esc, sendDocument } from "../telegram-api";
import { renderInvoicePdf, type InvoiceData } from "./pdf";
import { logError } from "@/lib/log";
import { SITE_URL } from "@/lib/site";

// Invoices for paid pickups. Server-side with the service role: an invoice joins the business,
// its manager, the customer and the driver, which no single client role may read together
// (e.g. managers can't read customer phone numbers; the customer's own invoice shows theirs).

const SITE = SITE_URL;
type Row = Record<string, unknown>;
const u = <T>(v: unknown) => (v ?? undefined) as T | undefined;

let logo: Uint8Array | null | undefined;
async function logoPng(): Promise<Uint8Array | undefined> {
  if (logo === undefined) {
    logo = await fetch(`${SITE}/brand/toss-wordmark.png`, { signal: AbortSignal.timeout(5000) })
      .then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null))
      .catch(() => null);
  }
  return logo ?? undefined;
}

export const invoiceFileName = (number: string) => `Toss-invoice-${number}.pdf`;

/**
 * Gives a paid order its invoice number and gathers everything printed on it. Null if not paid.
 * `audience` decides whose copy it is: the customer's own copy shows their email and phone; the business copy
 * (manager or owner downloading it) doesn't, because managers may not see customers' contact details.
 */
export async function loadInvoice(orderId: string, audience: "customer" | "business" = "customer"): Promise<{ data: InvoiceData; customerEmail?: string; customerTelegram?: string } | null> {
  const db = supabaseAdmin();
  const { data: number, error } = await db.rpc("issue_invoice", { p_order: orderId });
  if (error) throw error;
  if (!number) return null;

  const { data: o } = await db.from("orders").select("*").eq("id", orderId).single();
  const [{ data: t }, { data: c }, { data: d }, { data: dev }] = await Promise.all([
    db.from("tenants").select("name, join_code, store_address, upi_id, manager_id").eq("id", o.tenant_id).maybeSingle(),
    o.customer_id
      ? db.from("customers").select("name, customer_code, email, phone, telegram_id").eq("id", o.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    o.driver_id ? db.from("drivers").select("name").eq("telegram_chat_id", o.driver_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("devices").select("area").eq("device_id", o.device_id).maybeSingle(),
  ]);
  const manager = t?.manager_id ? (await db.auth.admin.getUserById(t.manager_id as string)).data.user?.email : undefined;
  const label = orderLabel({ deviceId: o.device_id as string, deviceOrderId: o.device_order_id as number });

  const data: InvoiceData = {
    number: number as string,
    issuedAt: (o.invoice_issued_at as string) ?? new Date().toISOString(),
    business: {
      name: (t?.name as string) ?? "Your laundry",
      joinCode: (t?.join_code as string) ?? "-",
      storeAddress: u(t?.store_address),
      upiId: u(t?.upi_id),
      managerEmail: manager,
    },
    customer: {
      name: u((c as Row | null)?.name),
      code: ((c as Row | null)?.customer_code as string) ?? "-",
      email: audience === "customer" ? u((c as Row | null)?.email) : undefined,
      phone: audience === "customer" && (c as Row | null)?.phone ? formatPhone((c as Row).phone as string) : undefined,
    },
    order: {
      label: dev?.area ? `${dev.area as string} · ${label}` : label,
      placedAt: o.placed_at as string,
      acceptedAt: u(o.accepted_at),
      completedAt: u(o.completed_at),
      address: (o.address as string) ?? "",
      weightKg: Number(o.weight_kg),
      subtotal: Number(o.amount_before_discount ?? o.amount_gross ?? o.amount_due),
      discountPct: u(o.discount_pct),
      basketCredit: Number(o.credit_applied) || undefined,
      total: Number(o.amount_due),
    },
    driver: d?.name ? { name: d.name as string } : undefined,
    payment: { method: (o.payment_method as string) ?? "UPI", ref: u(o.payment_ref), paidAt: u(o.payment_confirmed_at) },
    site: SITE,
  };
  return {
    data,
    customerEmail: u((c as Row | null)?.email),
    customerTelegram: u((c as Row | null)?.telegram_id) ?? u(o.customer_telegram_id),
  };
}

export async function invoicePdf(data: InvoiceData) {
  return renderInvoicePdf(data, await logoPng());
}

/**
 * After a payment is confirmed: emails the customer their invoice PDF and sends it in the customer
 * bot (Toss Control). Sent once per order. Never throws.
 */
export async function sendInvoice(orderId: string): Promise<{ email: boolean; telegram: boolean } | null> {
  try {
    const db = supabaseAdmin();
    const inv = await loadInvoice(orderId);
    if (!inv) return null;
    // Claim the send so a double click or retry doesn't email twice.
    const { data: claimed } = await db.from("orders").update({ invoice_sent_at: new Date().toISOString() }).eq("id", orderId).is("invoice_sent_at", null).select("id");
    if (!claimed?.length) return null;

    const pdf = await invoicePdf(inv.data);
    const file = invoiceFileName(inv.data.number);
    const email = emailEnabled()
      ? await sendEmail(inv.customerEmail, customerInvoice(inv.data), {
          replyTo: inv.data.business.managerEmail,
          attachments: [{ filename: file, content: Buffer.from(pdf), contentType: "application/pdf" }],
        })
      : false;

    let telegram = false;
    const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (token && inv.customerTelegram) {
      telegram = await sendDocument(
        token,
        inv.customerTelegram,
        pdf,
        file,
        // Telegram parses this caption as HTML and the business name is typed by the manager: escape it.
        `🧾 <b>Payment received, thank you!</b>\nInvoice ${esc(inv.data.number)} · ${esc(inv.data.business.name)}`,
      )
        .then(() => true)
        .catch((err) => {
          logError("invoice telegram failed", err);
          return false;
        });
    }
    return { email, telegram };
  } catch (err) {
    logError("sending invoice failed", err);
    return null;
  }
}
