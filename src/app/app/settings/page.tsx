import type { Metadata } from "next";
import { TelegramLogin } from "@/components/telegram-login";
import { Badge, Card, PageTitle } from "@/components/ui";
import { deviceLabel, getCustomer, getDeviceForCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

const RESULTS: Record<string, { tone: "good" | "critical" | "warn"; text: string }> = {
  linked: { tone: "good", text: "Telegram linked. Orders from your basket now appear in your account." },
  taken: { tone: "critical", text: "That Telegram account is already linked to a different Toss account." },
  expired: { tone: "warn", text: "The Telegram login took too long. Please try again." },
  invalid: { tone: "critical", text: "We couldn't verify that Telegram login. Please try again." },
  "not-configured": { tone: "warn", text: "Telegram linking isn't set up on this server yet." },
  error: { tone: "critical", text: "Something went wrong while linking. Please try again." },
};

const toneClass = {
  good: "border-good/30 bg-good-bg text-good",
  critical: "border-critical/30 bg-critical-bg text-critical",
  warn: "border-warn/30 bg-warn-bg text-warn",
};

export default async function CustomerSettings({ searchParams }: PageProps<"/app/settings">) {
  const session = await requireRole("CUSTOMER");
  const [customer, device, params] = await Promise.all([
    getCustomer(session.userId),
    getDeviceForCustomer(session.userId),
    searchParams,
  ]);
  const result = typeof params.telegram === "string" ? RESULTS[params.telegram] : undefined;
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  return (
    <div className="stagger max-w-2xl space-y-6">
      <PageTitle kicker="Account">Settings</PageTitle>

      {result && (
        <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${toneClass[result.tone]}`}>
          {result.text}
        </p>
      )}

      <Card title="Account">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Name</dt>
          <dd>{customer?.name ?? "—"}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{customer?.email ?? session.email}</dd>
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
            Linked to Telegram ID <span className="font-mono text-fg">{customer.telegramId}</span>. Orders from the
            basket you claimed in Telegram show up here automatically.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Use the same Telegram account you used to claim your basket. Your past and future orders will appear here.
            </p>
            {botUsername ? (
              <TelegramLogin botUsername={botUsername} />
            ) : (
              <p className="text-xs text-muted">Telegram linking isn&apos;t set up on this server yet.</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Basket">
        {device ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Basket</dt>
            <dd>{deviceLabel(device)}</dd>
            <dt className="text-muted">Device ID</dt>
            <dd className="font-mono">{device.deviceId}</dd>
            {device.targetKg !== undefined && (
              <>
                <dt className="text-muted">Target weight</dt>
                <dd>{device.targetKg} kg</dd>
              </>
            )}
            {device.firmwareVersion && (
              <>
                <dt className="text-muted">Firmware</dt>
                <dd>{device.firmwareVersion}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted">
            No basket linked yet. It appears here once your Telegram account is linked and the basket places an order.
          </p>
        )}
      </Card>
    </div>
  );
}
