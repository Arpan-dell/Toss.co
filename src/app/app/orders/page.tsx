import type { Metadata } from "next";
import { OrderTable } from "@/components/order-table";
import { Card, PageTitle, StatTile } from "@/components/ui";
import { listOrdersForCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";
import { myFormat } from "@/lib/my-format";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "My orders" };

export default async function CustomerOrders() {
  const [fmt, t] = await Promise.all([myFormat(), getT()]);
  const session = await requireRole("CUSTOMER");
  const orders = await listOrdersForCustomer(session.userId);
  const totalKg = orders.reduce((s, o) => s + o.weightKg, 0);
  const totalPaid = orders.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.amountDue, 0);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker={t("Your laundry")}>{t("My orders")}</PageTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={t("Pickups")} value={String(orders.length)} />
        <StatTile label={t("Laundry washed")} value={`${totalKg.toFixed(0)} kg`} />
        <StatTile label={t("Total paid")} value={fmt.money(totalPaid)} />
      </div>
      <Card>
        <OrderTable orders={orders} />
      </Card>
    </div>
  );
}
