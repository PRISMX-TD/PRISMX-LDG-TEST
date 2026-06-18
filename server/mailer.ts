/**
 * Mailer — tries Brevo REST API first (works on Railway), falls back to SMTP.
 * Uses HTTPS (port 443) so it's never blocked by PaaS outbound restrictions.
 */
import nodemailer from "nodemailer";

// ---- Brevo REST API (HTTPS, never blocked) --------------------------------
const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.SMTP_PASS || "";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const fromAddress = process.env.SMTP_FROM || "noreply@prismxledger.com";
const fromName = process.env.SMTP_FROM_NAME || "PRISMX";

async function sendViaBrevoApi(to: string, subject: string, html: string): Promise<boolean> {
  if (!BREVO_API_KEY) return false;
  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromAddress },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (res.ok) {
      const data = await res.json() as any;
      console.log(`[mailer:api] Email sent to ${to}: ${data.messageId}`);
      return true;
    }
    const err = await res.json().catch(() => ({})) as any;
    console.error(`[mailer:api] Brevo API error ${res.status}: ${err.message || "unknown"}`);
    return false;
  } catch (err: any) {
    console.error(`[mailer:api] Request failed: ${err.message}`);
    return false;
  }
}

// ---- SMTP fallback --------------------------------------------------------
const smtpConfig = {
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

const transporter = nodemailer.createTransport(smtpConfig);

// Verify SMTP at startup
transporter.verify().then(() => {
  console.log(`[mailer:smtp] Ready — ${smtpConfig.host}:${smtpConfig.port}`);
}).catch((err: any) => {
  console.warn(`[mailer:smtp] Unavailable: ${err.message} (will use API fallback)`);
});

async function sendViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      html,
    });
    console.log(`[mailer:smtp] Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error(`[mailer:smtp] Failed: ${error.message}`);
    return false;
  }
}

// ---- Public API -----------------------------------------------------------
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  // Try API first (unblocked on Railway), fall back to SMTP
  if (BREVO_API_KEY) {
    const ok = await sendViaBrevoApi(to, subject, html);
    if (ok) return true;
  }
  return sendViaSmtp(to, subject, html);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const subject = "重置您的 PRISMX 密码";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #6366f1;">PRISMX</h2>
      <p>我们收到了您的密码重置请求。</p>
      <p>点击下方按钮重置密码（链接 1 小时内有效）：</p>
      <a href="${resetUrl}" 
         style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; 
                text-decoration: none; border-radius: 6px; margin: 16px 0;">
        重置密码
      </a>
      <p style="color: #888; font-size: 12px;">如果这不是您发起的请求，请忽略此邮件。</p>
    </div>
  `;
  return sendEmail(to, subject, html);
}
