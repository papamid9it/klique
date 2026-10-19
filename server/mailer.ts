import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { after } from "next/server";
import { isProd, smtpConfig } from "./env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const mailerConfigured = () => smtpConfig() !== null;

let transport: Transporter | null = null;
function getTransport(): Transporter | null {
  const cfg = smtpConfig();
  if (!cfg) return null;
  return (transport ??= nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  }));
}

async function deliver(mail: Mail) {
  const t = getTransport();
  const cfg = smtpConfig();
  if (!t || !cfg) {
    // Not configured: show the message where a developer will see it (links included).
    console.info(`\n[mail] SMTP not configured${isProd() ? " (!)" : ""} - would send to ${mail.to}\n  subject: ${mail.subject}\n${mail.text.split("\n").map((l) => "  " + l).join("\n")}\n`);
    return;
  }
  try {
    await t.sendMail({ from: cfg.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (err) {
    console.error("[mail] send failed:", (err as Error)?.message);
  }
}

/** Fire-and-forget: the request that caused the email never waits for, or fails because of, the mail server. */
export function queueMail(mail: Mail) {
  try {
    after(() => deliver(mail));
  } catch {
    void deliver(mail); // outside a request (scripts)
  }
}
