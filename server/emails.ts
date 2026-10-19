import type { Mail } from "./mailer";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Layout {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footnote: string;
}

/** One plain, readable template for every message (inline styles: email clients ignore stylesheets). */
function build(l: Layout): Mail {
  const text = [l.heading, "", ...l.paragraphs, ...(l.button ? ["", `${l.button.label}: ${l.button.url}`] : []), "", l.footnote, "", "klique."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b1b20">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:14px;padding:32px">
<tr><td style="font-size:24px;font-weight:700;letter-spacing:-0.04em;padding-bottom:20px">klique.</td></tr>
<tr><td style="font-size:20px;font-weight:650;padding-bottom:12px">${esc(l.heading)}</td></tr>
${l.paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px;color:#3a3a42">${esc(p)}</td></tr>`).join("\n")}
${l.button ? `<tr><td style="padding:8px 0 20px"><a href="${esc(l.button.url)}" style="display:inline-block;background:#5b5bf0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(l.button.label)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#7a7a85;padding-bottom:16px">Button not working? Paste this into your browser:<br><span style="word-break:break-all">${esc(l.button.url)}</span></td></tr>` : ""}
<tr><td style="font-size:12px;line-height:1.5;color:#7a7a85;border-top:1px solid #ececf0;padding-top:16px">${esc(l.footnote)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to: l.to, subject: l.subject, text, html };
}

export const verifyEmailMail = (to: string, name: string, url: string) =>
  build({
    to,
    subject: "Confirm your email for klique.",
    heading: `Welcome, ${name}`,
    paragraphs: ["Confirm this is your email address so you can host events and start communities.", "The link works for 24 hours."],
    button: { label: "Confirm email", url },
    footnote: "If you didn't create a klique. account, you can ignore this message.",
  });

export const resetPasswordMail = (to: string, name: string, url: string) =>
  build({
    to,
    subject: "Reset your klique. password",
    heading: "Reset your password",
    paragraphs: [`Hi ${name}, someone asked to reset the password for this account. Use the button to choose a new one.`, "The link works for 1 hour and can be used once."],
    button: { label: "Choose a new password", url },
    footnote: "If this wasn't you, ignore this message. Your password stays as it is.",
  });

export const passwordChangedMail = (to: string, name: string) =>
  build({
    to,
    subject: "Your klique. password was changed",
    heading: "Password changed",
    paragraphs: [`Hi ${name}, the password on your klique. account was just changed, and you were signed out on your other devices.`],
    footnote: "If this wasn't you, reset your password right away from the sign-in page.",
  });
