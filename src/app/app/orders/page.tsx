import type { Metadata } from "next";
import { OrderTable } from "@/components/order-table";
import { Card, PageTitle, StatTile } from "@/components/ui";
import { listOrdersForCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";
import { myFormat } from "@/lib/my-format";

export const metadata: Metadata = { title: "Order history" };

export default async function CustomerOrders() {
  const fmt = await myFormat();
  const session = await requireRole("CUSTOMER");
  const orders = await listOrdersForCustomer(session.userId);
  const totalKg = orders.reduce((s, o) => s + o.weightKg, 0);
  const totalPaid = orders.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.amountDue, 0);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Your laundry">Order history</PageTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Pickups" value={String(orders.length)} />
        <StatTile label="Laundry washed" value={`${totalKg.toFixed(0)} kg`} />
        <StatTile label="Total paid" value={fmt.money(totalPaid)} />
      </div>
      <Card>
        <OrderTable orders={orders} />
      </Card>
    </div>
  );
}
