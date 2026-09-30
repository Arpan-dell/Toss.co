import type { Metadata } from "next";
import { Badge, Card, PageTitle } from "@/components/ui";
import { getCustomer, getDeviceForCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function CustomerSettings() {
  const session = await requireRole("CUSTOMER");
  const [customer, device] = await Promise.all([
    getCustomer(session.customerId!),
    getDeviceForCustomer(session.customerId!),
  ]);

  return (
    <div className="stagger max-w-2xl space-y-6">
      <PageTitle kicker="Account">Settings</PageTitle>

      <Card title="Account">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Name</dt>
          <dd>{customer?.name}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{customer?.email}</dd>
        </dl>
      </Card>

      <Card
        title="Telegram"
        action={
          customer?.telegramId ? <Badge tone="good" icon="✓">Linked</Badge> : <Badge tone="warn" icon="!">Not linked</Badge>
        }
      >
        {customer?.telegramId ? (
          <p className="text-sm text-secondary">
            Linked to Telegram ID <span className="font-mono text-fg">{customer.telegramId}</span>. Orders from
            baskets you claimed in Telegram show up here automatically.
          </p>
        ) : (
          <p className="text-sm text-secondary">
            Link your Telegram account to see orders from the basket you claimed with the bot.
          </p>
        )}
        {/* Phase C: Telegram Login Widget → linkTelegram Lambda verifies the hash. */}
        <p className="mt-3 text-xs text-muted">The Telegram Login Widget is added in Phase C.</p>
      </Card>

      <Card title="Basket">
        {device ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Device ID</dt>
            <dd className="font-mono">{device.deviceId}</dd>
            <dt className="text-muted">Pickup address</dt>
            <dd>{device.address}</dd>
            <dt className="text-muted">Target weight</dt>
            <dd>{device.targetKg} kg</dd>
            <dt className="text-muted">Firmware</dt>
            <dd>{device.firmwareVersion}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted">No basket linked.</p>
        )}
      </Card>
    </div>
  );
}
