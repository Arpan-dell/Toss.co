import { getOrder } from "@/lib/data";
import { invoiceFileName, invoicePdf, loadInvoice } from "@/lib/invoice/service";
import { getSession } from "@/lib/session";

// Download a paid order's invoice as PDF. Visibility is decided by RLS on the caller's own session:
// the customer sees their orders, a manager their business's, the owner all. Only then is the
// invoice assembled server-side.
export async function GET(request: Request, ctx: RouteContext<"/invoice/[id]">) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/login", request.url), 303);

  const { id: raw } = await ctx.params;
  const id = raw.includes("%") ? decodeURIComponent(raw) : raw;
  const order = await getOrder(id);
  if (!order) return new Response("Invoice not found", { status: 404 });
  if (order.paymentStatus !== "PAID") return new Response("This order isn't paid yet, so it has no invoice.", { status: 409 });

  // managers and the owner get the business copy, without the customer's email and phone
  const inv = await loadInvoice(id, session.role === "CUSTOMER" ? "customer" : "business");
  if (!inv) return new Response("Invoice not found", { status: 404 });
  const pdf = await invoicePdf(inv.data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoiceFileName(inv.data.number)}"`,
      "cache-control": "private, no-store",
    },
  });
}
