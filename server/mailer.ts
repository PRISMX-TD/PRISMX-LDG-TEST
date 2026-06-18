/**
 * Simple SMTP mailer using Brevo (or any SMTP) to send password reset emails.
 * Uses nodemailer with config from environment variables.
 */
import nodemailer from "nodemailer";

const smtpConfig = {
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

const fromAddress = process.env.SMTP_FROM || "noreply@prismxledger.com";
const fromName = process.env.SMTP_FROM_NAME || "PRISMX";

const transporter = nodemailer.createTransport(smtpConfig);

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      html,
    });
    console.log(`[mailer] Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error(`[mailer] Failed to send email to ${to}: ${error.message}`);
    return false;
  }
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
