/**
 * Email helper. Right now only used for password reset.
 *
 * If SMTP env vars are not present, we log the message instead of sending —
 * useful for local dev and means the feature degrades gracefully in production.
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * or
 *   RESEND_API_KEY, RESEND_FROM
 *
 * Either backend works.
 */

type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

async function sendViaResend(msg: Email): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "noreply@prismx.local",
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html || msg.text,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`[mailer] Resend returned ${resp.status}: ${errText}`);
      return { sent: false, error: `HTTP ${resp.status}: ${errText}` };
    }
    return { sent: true };
  } catch (err: any) {
    console.warn("[mailer] Resend send failed:", err);
    return { sent: false, error: err?.message || String(err) };
  }
}

async function sendViaSmtp(msg: Email): Promise<{ sent: boolean; error?: string }> {
  const host = process.env.SMTP_HOST;
  if (!host) return { sent: false, error: "SMTP_HOST not set" };
  try {
    // Lazy require so a missing nodemailer install doesn't break the build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || "noreply@prismx.local",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html || msg.text,
    });
    return { sent: true };
  } catch (err: any) {
    console.warn("[mailer] SMTP send failed:", err);
    return { sent: false, error: err?.message || String(err) };
  }
}

export async function sendEmail(msg: Email): Promise<{ sent: boolean; error?: string }> {
  // Try Resend first (simplest), then SMTP, then fall back to logging.
  const resendResult = await sendViaResend(msg);
  if (resendResult.sent) return { sent: true };
  if (resendResult.error) return { sent: false, error: `Resend: ${resendResult.error}` };
  const smtpResult = await sendViaSmtp(msg);
  if (smtpResult.sent) return { sent: true };
  if (smtpResult.error) return { sent: false, error: `SMTP: ${smtpResult.error}` };
  console.warn(`[mailer] no provider configured — logging instead:\n  to: ${msg.to}\n  subject: ${msg.subject}\n  body: ${msg.text}`);
  return { sent: false, error: "No email provider configured (set RESEND_API_KEY or SMTP_HOST)" };
}
