import { NextResponse, type NextRequest } from "next/server";
import { getTenantById, listCustomers, listDrivers, listOrders } from "@/lib/data";
import { orderLabel } from "@/lib/format";
import { planState, tierOf } from "@/lib/plan";
import { requireRole } from "@/lib/session";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import { buildXlsx, type XlsxCell, type XlsxColumn } from "@/lib/xlsx";

// "Download Excel" on the manager's Orders page: the same list (same status filter and search) as a real .xlsx
// workbook. Reads go through the manager's own session, so RLS limits them to their business. Pro only.

const STATUS: Record<OrderStatus, string> = { PENDING: "Awaiting driver", ACCEPTED: "Driver en route", COMPLETED: "Picked up", CANCELLED: "Cancelled" };
const PAYMENT: Record<PaymentStatus, string> = { UNPAID: "Unpaid", PENDING: "Payment to confirm", PAID: "Paid", REFUNDED: "Refunded" };
const STATUSES = Object.keys(STATUS) as OrderStatus[];

const COLUMNS: XlsxColumn[] = [
  { header: "Order", width: 14 },
  { header: "Invoice", width: 20 },
  { header: "Placed", width: 18, type: "datetime" },
  { header: "Status", width: 16 },
  { header: "Customer", width: 22 },
  { header: "Customer ID", width: 13 },
  { header: "Address", width: 40 },
  { header: "Weight (kg)", width: 12, type: "number" },
  { header: "Weight from", width: 12 },
  { header: "Whites (kg)", width: 11, type: "number" },
  { header: "Coloured (kg)", width: 12, type: "number" },
  { header: "Discount %", width: 11, type: "number" },
  { header: "Amount", width: 13, type: "money" },
  { header: "Payment", width: 18 },
  { header: "Paid by", width: 9 },
  { header: "UPI reference", width: 18 },
  { header: "Paid on", width: 18, type: "datetime" },
  { header: "Driver", width: 18 },
  { header: "Driver accepted", width: 18, type: "datetime" },
  { header: "Picked up", width: 18, type: "datetime" },
];

const at = (iso?: string) => (iso ? new Date(iso) : undefined);

export async function GET(request: NextRequest) {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant || tierOf(planState(tenant).state) !== "PRO") {
    return NextResponse.json({ error: "Excel export is a Toss Pro feature. Upgrade under Billing." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const s = params.get("status");
  const status = STATUSES.find((x) => x === s);
  const q = params.get("q")?.slice(0, 100) || undefined;

  const [orders, customers, drivers] = await Promise.all([listOrders({ status, q }), listCustomers(), listDrivers()]);
  const customer = new Map(customers.map((c) => [c.id, c]));
  const driver = new Map(drivers.filter((d) => d.telegramChatId).map((d) => [d.telegramChatId!, d.name]));

  const rows: XlsxCell[][] = orders.map((o) => {
    const c = o.customerId ? customer.get(o.customerId) : undefined;
    return [
      orderLabel(o),
      o.invoiceNumber,
      at(o.createdAt),
      STATUS[o.status] ?? o.status,
      c?.name,
      c?.customerCode,
      o.address,
      o.weightKg,
      o.weightSource,
      o.whitesKg,
      o.colouredKg,
      o.discountPct,
      o.amountDue,
      PAYMENT[o.paymentStatus] ?? o.paymentStatus,
      o.paymentMethod,
      o.paymentRef,
      at(o.paymentConfirmedAt),
      o.driverId ? (driver.get(o.driverId) ?? o.driverId) : undefined,
      at(o.acceptedAt),
      at(o.completedAt),
    ];
  });

  const file = buildXlsx({ sheetName: `${tenant.name} orders`, columns: COLUMNS, rows });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); // YYYY-MM-DD
  const slug = tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "toss";
  const name = `${slug}-orders${status ? `-${status.toLowerCase()}` : ""}-${day}.xlsx`;

  return new NextResponse(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
