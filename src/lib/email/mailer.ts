import "server-only";
import { EMAIL_CATEGORIES, isOptedOut, unsubscribeUrl, type EmailCategory } from "../unsubscribe";
import nodemailer, { type Transporter } from "nodemailer";
import type { Email } from "./templates";
import { logError } from "@/lib/log";

export type Attachment = { filename: string; content: Buffer; contentType: string };

// Sends through the Toss Gmail account over SMTP with a Google App Password (free, ~500 mails/day).
//   GMAIL_USER          the Toss Gmail address (also the sender)
//   GMAIL_APP_PASSWORD  16-character App Password (Google Account → Security → App passwords)
//   OWNER_EMAIL         where owner alerts go (defaults to GMAIL_USER)
// Without credentials every send is skipped, so the app works the same, just without emails.

let transport: Transporter | null = null;

export const emailEnabled = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export const ownerEmail = () => process.env.OWNER_EMAIL || process.env.GMAIL_USER || "";

function getTransport() {
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "") },
  });
  return transport;
}

/**
 * Best-effort: an email problem never breaks the action that triggered it. Returns whether it was sent.
 * `category` marks an optional email (reminders, alerts): it isn't sent to anyone who unsubscribed from that kind,
 * and it carries an unsubscribe link plus the List-Unsubscribe headers mail apps use for their own button.
 * Without a category it's a service email (invoices, password resets, account notices) and always goes out.
 */
export async function sendEmail(
  to: string | undefined | null,
  email: Email,
  opts: { replyTo?: string; attachments?: Attachment[]; category?: EmailCategory } = {},
): Promise<boolean> {
  if (!to || !emailEnabled()) return false;
  try {
    let { html, text } = email;
    let headers: Record<string, string> | undefined;
    if (opts.category) {
      if (await isOptedOut(to, opts.category)) return false;
      const url = unsubscribeUrl(to, opts.category);
      const oneClick = url.replace("/unsubscribe?", "/api/unsubscribe?");
      html = html.replace("<!--UNSUBSCRIBE-->", ` · <a href="${url}" style="color:#9ca3af">Unsubscribe from ${EMAIL_CATEGORIES[opts.category]}</a>`);
      text = `${text}\n\nUnsubscribe from ${EMAIL_CATEGORIES[opts.category]}: ${url}`;
      headers = { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    }
    await getTransport().sendMail({
      from: { name: "Toss", address: process.env.GMAIL_USER! },
      to,
      replyTo: opts.replyTo,
      subject: email.subject,
      html: html.replace("<!--UNSUBSCRIBE-->", ""),
      text,
      attachments: opts.attachments,
      headers,
    });
    return true;
  } catch (err) {
    logError("email failed", err);
    return false;
  }
}
