// Branded transactional emails. Pure functions (no I/O) so they can be unit-tested; email clients
// ignore <style> blocks and dark-mode CSS, so everything is inline and table-based.

export const SITE = process.env.SITE_URL ?? "https://toss-code-x-a24a.vercel.app";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

type Row = [label: string, value: string];

/** One email: dark Toss header, a heading, paragraphs, an optional facts table and a button. */
export function layout(o: { preheader: string; heading: string; paragraphs: string[]; rows?: Row[]; cta?: { label: string; url: string }; tone?: "good" | "warn" | "bad" }): Omit<Email, "subject"> {
  const accent = o.tone === "bad" ? "#e5484d" : o.tone === "warn" ? "#f5a524" : "#02a9a1";
  const rows = (o.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:42%">${escapeHtml(k)}</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#050507;padding:22px 28px;border-bottom:3px solid ${accent}"><img src="${SITE}/brand/toss-wordmark.png" alt="Toss" height="34" style="display:block;height:34px"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#111827">${escapeHtml(o.heading)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151">${p}</p>`).join("")}
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">${rows}</table>` : ""}
${o.cta ? `<p style="margin:22px 0 4px"><a href="${o.cta.url}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">${escapeHtml(o.cta.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:12px">Toss · smart laundry pickups · <a href="${SITE}" style="color:#9ca3af">${SITE.replace(/^https?:\/\//, "")}</a></td></tr>
</table></td></tr></table></body></html>`;
  const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const text = [
    o.heading,
    "",
    ...o.paragraphs.map(strip),
    ...(o.rows?.length ? ["", ...o.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(o.cta ? ["", `${o.cta.label}: ${o.cta.url}`] : []),
    "",
    `Toss · ${SITE}`,
  ].join("\n");
  return { html, text };
}

const e = escapeHtml;
const mail = (subject: string, body: ReturnType<typeof layout>): Email => ({ ...body, subject });

// ---------- to the Toss owner ----------

export const ownerNewBusiness = (b: { name: string; joinCode: string; managerEmail: string; pricePerKg: number; trialEndsAt?: string }) =>
  mail(
    `🎉 New business on Toss: ${b.name}`,
    layout({
      preheader: `${b.name} just registered and started a free trial.`,
      heading: "A new laundry joined Toss",
      paragraphs: [`<b>${e(b.name)}</b> registered and started their free trial.`],
      rows: [
        ["Business ID", b.joinCode],
        ["Manager", b.managerEmail],
        ["Price", `₹${b.pricePerKg}/kg`],
        ...(b.trialEndsAt ? ([["Trial ends", day(b.trialEndsAt)]] as Row[]) : []),
      ],
      cta: { label: "Open owner dashboard", url: `${SITE}/owner` },
    }),
  );

export const ownerPaymentToReview = (p: { business: string; joinCode: string; months: number; amount: number; discountPct: number; ref: string }) =>
  mail(
    `💳 Subscription payment to confirm: ${p.business} · ${inr(p.amount)}`,
    layout({
      preheader: `${p.business} paid ${inr(p.amount)} for ${p.months} month(s). Check your UPI app and approve it.`,
      heading: "A subscription payment is waiting for you",
      paragraphs: [`<b>${e(p.business)}</b> says they paid. Check the UPI reference in your UPI app, then approve or reject it.`],
      rows: [
        ["Amount", inr(p.amount)],
        ["Plan", `${p.months} month${p.months > 1 ? "s" : ""}${p.discountPct ? ` (${p.discountPct}% off)` : ""}`],
        ["UPI reference", p.ref],
        ["Business ID", p.joinCode],
      ],
      cta: { label: "Review payment", url: `${SITE}/owner/payments` },
    }),
  );

export const ownerClosureRequest = (b: { name: string; joinCode: string; managerEmail: string; reason: string }) =>
  mail(
    `⚠️ Removal request: ${b.name}`,
    layout({
      preheader: `${b.name} asked to close their business on Toss.`,
      heading: "A business asked to be removed",
      paragraphs: [`<b>${e(b.name)}</b> asked to close their business on Toss.`, b.reason ? `Their reason: “${e(b.reason)}”` : "They didn't give a reason."],
      rows: [
        ["Business ID", b.joinCode],
        ["Manager", b.managerEmail],
      ],
      cta: { label: "Open businesses", url: `${SITE}/owner` },
      tone: "warn",
    }),
  );

export const ownerBusinessLapsed = (b: { name: string; joinCode: string; managerEmail: string; wasTrial: boolean }) =>
  mail(
    `⏰ ${b.name}'s ${b.wasTrial ? "trial" : "subscription"} has ended`,
    layout({
      preheader: `${b.name} is now locked until they renew.`,
      heading: `${b.name}'s ${b.wasTrial ? "free trial" : "subscription"} ended`,
      paragraphs: ["Their dashboard is locked until they pay. We've emailed them how to renew."],
      rows: [
        ["Business ID", b.joinCode],
        ["Manager", b.managerEmail],
      ],
      cta: { label: "Open owner dashboard", url: `${SITE}/owner` },
      tone: "warn",
    }),
  );

// ---------- to a customer ----------

export const customerInvoice = (d: {
  number: string;
  business: { name: string };
  customer: { name?: string };
  order: { label: string; weightKg: number; total: number; discountPct?: number; completedAt?: string };
  payment: { method: string; paidAt?: string };
}) =>
  mail(
    `Your invoice from ${d.business.name} · ${inr(d.order.total)} paid`,
    layout({
      preheader: `Invoice ${d.number} for your laundry pickup is attached.`,
      heading: `Thanks${d.customer.name ? `, ${d.customer.name.split(" ")[0]}` : ""}! Your payment is received`,
      paragraphs: [`Your invoice from <b>${e(d.business.name)}</b> is attached as a PDF. You can also download it anytime from your Toss dashboard.`],
      rows: [
        ["Invoice", d.number],
        ["Pickup", d.order.label],
        ["Weight", `${d.order.weightKg.toFixed(2)} kg`],
        ["Amount paid", `${inr(d.order.total)}${d.order.discountPct ? ` (${d.order.discountPct}% off)` : ""}`],
        ["Paid by", d.payment.method],
        ...(d.payment.paidAt ? ([["Paid on", day(d.payment.paidAt)]] as Row[]) : []),
      ],
      cta: { label: "View your orders", url: `${SITE}/app/orders` },
      tone: "good",
    }),
  );

// ---------- to a business manager ----------

export const managerWelcome = (b: { name: string; joinCode: string; trialEndsAt?: string }) =>
  mail(
    `Welcome to Toss, ${b.name}! 🎉`,
    layout({
      preheader: `Your Business ID is ${b.joinCode}. Your free trial has started.`,
      heading: `${b.name} is live on Toss`,
      paragraphs: [
        "Your free trial has started. Here's how to get going:",
        "1. Share your <b>Business ID</b> with customers. They enter it after signing up.<br>2. Add your drivers on <b>Fleet</b> (name + mobile number).<br>3. Set your store address on <b>Business</b>, so every driver route ends there.",
      ],
      rows: [
        ["Business ID", b.joinCode],
        ...(b.trialEndsAt ? ([["Free trial until", day(b.trialEndsAt)]] as Row[]) : []),
      ],
      cta: { label: "Open your dashboard", url: `${SITE}/admin` },
    }),
  );

export const managerPaymentReceived = (p: { business: string; months: number; amount: number; discountPct: number; ref: string }) =>
  mail(
    `We got your Toss payment of ${inr(p.amount)}`,
    layout({
      preheader: "Toss will confirm it shortly and extend your plan.",
      heading: "Payment received, confirming it now",
      paragraphs: [`Thanks! We'll check your UPI payment and extend <b>${e(p.business)}</b>'s plan. You'll get another email once it's confirmed.`],
      rows: [
        ["Amount", inr(p.amount)],
        ["Plan", `${p.months} month${p.months > 1 ? "s" : ""}${p.discountPct ? ` (${p.discountPct}% off)` : ""}`],
        ["UPI reference", p.ref],
      ],
      cta: { label: "View billing", url: `${SITE}/admin/billing` },
    }),
  );

export const managerPaymentApproved = (p: { business: string; months: number; amount: number; paidUntil?: string }) =>
  mail(
    `✅ Toss subscription renewed${p.paidUntil ? ` until ${day(p.paidUntil)}` : ""}`,
    layout({
      preheader: `Your payment of ${inr(p.amount)} is confirmed.`,
      heading: "Your subscription is renewed",
      paragraphs: [`Your payment for <b>${e(p.business)}</b> is confirmed. Thank you for using Toss!`],
      rows: [
        ["Amount", inr(p.amount)],
        ["Added", `${p.months} month${p.months > 1 ? "s" : ""}`],
        ...(p.paidUntil ? ([["Paid until", day(p.paidUntil)]] as Row[]) : []),
      ],
      cta: { label: "Open your dashboard", url: `${SITE}/admin` },
      tone: "good",
    }),
  );

export const managerPaymentRejected = (p: { business: string; amount: number; ref: string }) =>
  mail(
    `Your Toss payment couldn't be confirmed`,
    layout({
      preheader: `We couldn't find a UPI payment with reference ${p.ref}.`,
      heading: "We couldn't confirm your payment",
      paragraphs: [
        `We couldn't find your UPI payment of <b>${inr(p.amount)}</b> for ${e(p.business)}. Please check the reference in your UPI app's payment details and submit it again.`,
      ],
      rows: [["UPI reference you entered", p.ref]],
      cta: { label: "Go to billing", url: `${SITE}/admin/billing` },
      tone: "bad",
    }),
  );

/** Renewal reminders. daysLeft 0 means it has ended. */
export const managerPlanReminder = (p: { business: string; kind: "TRIAL" | "ACTIVE"; daysLeft: number; until?: string; monthlyPrice: number; bestDiscount: number }) => {
  const what = p.kind === "TRIAL" ? "free trial" : "subscription";
  const ended = p.daysLeft <= 0;
  const when = p.daysLeft === 1 ? "tomorrow" : `in ${p.daysLeft} days`;
  return mail(
    ended ? `⛔ Your Toss ${what} has ended` : `⏰ Your Toss ${what} ends ${when}`,
    layout({
      preheader: ended ? "Renew to unlock your dashboard." : `Renew before ${p.until ? day(p.until) : "it ends"} to keep pickups running.`,
      heading: ended ? `Your ${what} has ended` : `Your ${what} ends ${when}`,
      paragraphs: [
        ended
          ? `<b>${e(p.business)}</b>'s dashboard is locked. Your data is safe: renew and everything comes back instantly.`
          : `Renew <b>${e(p.business)}</b> to keep pickups, drivers and payments running without a break.`,
        p.bestDiscount > 0 ? `Tip: paying for several months at once saves up to <b>${p.bestDiscount}%</b>.` : "",
      ].filter(Boolean),
      rows: [
        ["Plan", `${inr(p.monthlyPrice)}/month`],
        ...(p.until ? ([[ended ? "Ended on" : "Ends on", day(p.until)]] as Row[]) : []),
      ],
      cta: { label: ended ? "Renew now" : "Renew", url: `${SITE}/admin/billing` },
      tone: ended ? "bad" : "warn",
    }),
  );
};

export const managerSuspended = (p: { business: string; suspended: boolean }) =>
  mail(
    p.suspended ? `Your business on Toss has been suspended` : `Your business on Toss is active again`,
    layout({
      preheader: p.suspended ? "Contact Toss to resolve it." : "Your dashboard is unlocked.",
      heading: p.suspended ? `${p.business} is suspended` : `${p.business} is active again`,
      paragraphs: [p.suspended ? "Toss has suspended your business. Reply to this email to resolve it." : "Your dashboard is unlocked. Welcome back!"],
      cta: { label: "Open your dashboard", url: `${SITE}/admin` },
      tone: p.suspended ? "bad" : "good",
    }),
  );

export const managerClosureReceived = (b: { name: string }) =>
  mail(
    `We received your request to close ${b.name}`,
    layout({
      preheader: "Toss will contact you to complete it.",
      heading: "Your removal request is in",
      paragraphs: [
        `We've received your request to close <b>${e(b.name)}</b> on Toss. We'll contact you to complete it.`,
        "Changed your mind? Just reply to this email.",
      ],
      tone: "warn",
    }),
  );
