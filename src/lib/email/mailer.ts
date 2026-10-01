import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { Email } from "./templates";

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

/** Best-effort: an email problem never breaks the action that triggered it. Returns whether it was sent. */
export async function sendEmail(to: string | undefined | null, email: Email, opts: { replyTo?: string } = {}): Promise<boolean> {
  if (!to || !emailEnabled()) return false;
  try {
    await getTransport().sendMail({
      from: { name: "Toss", address: process.env.GMAIL_USER! },
      to,
      replyTo: opts.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return true;
  } catch (err) {
    console.error("email failed", email.subject, err instanceof Error ? err.message : err);
    return false;
  }
}
