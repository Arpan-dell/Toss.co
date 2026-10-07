import { NextResponse, type NextRequest } from "next/server";
import { monthLabel, monthRangeIST, statements } from "@/lib/accounts";
import { deviceLabel, getTenantById, listAccounts, listDevices, listOrders } from "@/lib/data";
import { orderLabel } from "@/lib/format";
import { planState, tierOf } from "@/lib/plan";
import { requireRole } from "@/lib/session";
import { buildXlsx, type XlsxCell, type XlsxColumn } from "@/lib/xlsx";

// A business account's bill for one month as an Excel sheet: every pickup with its weight and amount, and the
// total. Reads go through the manager's own session (RLS). Pro only, like the accounts themselves.

const COLUMNS: XlsxColumn[] = [
  { header: "Picked up", width: 18, type: "datetime" },
  { header: "Order", width: 14 },
  { header: "Basket", width: 26 },
  { header: "Weight (kg)", width: 12, type: "number" },
  { header: "Amount", width: 13, type: "money" },
  { header: "Status", width: 10 },
];

export async function GET(request: NextRequest, ctx: RouteContext<"/admin/accounts/[id]/statement">) {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant || tierOf(planState(tenant).state) !== "PRO") {
    return NextResponse.json({ error: "Business accounts are a Toss Pro feature. Upgrade under Billing." }, { status: 403 });
  }
  const { id: raw } = await ctx.params;
  const id = raw.includes("%") ? decodeURIComponent(raw) : raw;
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!monthRangeIST(month)) return NextResponse.json({ error: "Choose a month like 2026-10." }, { status: 400 });

  const [accounts, devices, orders] = await Promise.all([listAccounts(), listDevices(), listOrders({ status: "COMPLETED" })]);
  const account = accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const bill = statements(orders.filter((o) => o.accountId === id)).find((s) => s.month === month);
  const basket = new Map(devices.map((d) => [d.deviceId, deviceLabel(d)]));

  const rows: XlsxCell[][] = (bill?.orders ?? []).map((o) => [
    new Date(o.completedAt ?? o.createdAt),
    orderLabel(o),
    basket.get(o.deviceId) ?? o.deviceId,
    o.weightKg,
    o.amountDue,
    o.paymentStatus === "PAID" ? "Paid" : "Due",
  ]);
  rows.push([], [undefined, undefined, "Total", bill?.kg ?? 0, bill?.amount ?? 0, undefined], [undefined, undefined, "Due", undefined, bill?.unpaid ?? 0, undefined]);

  const file = buildXlsx({ sheetName: `${account.name} ${monthLabel(month)}`.slice(0, 31), columns: COLUMNS, rows });
  const slug = account.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
  return new NextResponse(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-bill-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
