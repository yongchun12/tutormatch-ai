import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email sending (activation + password reset).
 *
 * Transport is chosen from the environment:
 *   • If SMTP_HOST is set, real SMTP is used (Gmail, Mailtrap, SES-SMTP, …).
 *     This is how emails are delivered to real inboxes — including
 *     `<namespace>.<tag>@inbox.testmail.app` addresses for testmail.app testing.
 *   • Otherwise a Nodemailer "Ethereal" test account is created on the fly:
 *     nothing is actually delivered, but a preview URL is logged so the flow
 *     works with zero configuration during development.
 *
 * NOTE: testmail.app itself only RECEIVES mail (for test assertions via its
 * API) — it is not a sender, so an SMTP sender is always required to deliver.
 */

let transportPromise: Promise<Transporter> | null = null;

async function getTransport(): Promise<Transporter> {
  if (!transportPromise) {
    transportPromise = (async () => {
      if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true", // true for port 465
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
      }

      // Dev fallback — no credentials needed, prints a preview link to the console.
      const testAccount = await nodemailer.createTestAccount();
      console.warn(
        "[email] SMTP_HOST not set — using an Ethereal test account (no real delivery). Set SMTP_* to deliver for real."
      );
      return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }
  return transportPromise;
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

const FROM = process.env.EMAIL_FROM || '"TutorMatch" <no-reply@tutormatch.app>';

async function send(to: string, subject: string, html: string) {
  const transport = await getTransport();
  const info = await transport.sendMail({ from: FROM, to, subject, html });
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) {
    console.log(`[email] "${subject}" → ${to} · preview: ${previewUrl}`);
  }
  return { messageId: info.messageId, previewUrl };
}

// --- Templates -------------------------------------------------------------

function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `
  <div style="margin:0;padding:24px;background:#f4f4f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e7f1;">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:22px 28px;color:#ffffff;">
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.2px;">TutorMatch</span>
      </div>
      <div style="padding:28px;color:#1b1d2e;">
        <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;">${heading}</h1>
        <div style="font-size:15px;line-height:1.6;color:#40435a;">${body}</div>
        <div style="margin:26px 0;">
          <a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">${cta.label}</a>
        </div>
        <p style="font-size:12.5px;color:#83879f;line-height:1.6;margin:18px 0 0;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${cta.url}" style="color:#4f46e5;word-break:break-all;">${cta.url}</a>
        </p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eeeef4;color:#9599b3;font-size:12px;">
        You received this email because someone used this address on TutorMatch. If it wasn't you, you can safely ignore it.
      </div>
    </div>
  </div>`;
}

export async function sendVerificationEmail(to: string, name: string, rawToken: string) {
  const url = `${baseUrl()}/api/auth/verify-email?token=${rawToken}`;
  const html = layout(
    "Activate your account",
    `Hi ${name || "there"}, thanks for signing up! Please confirm your email address to activate your TutorMatch account. This link expires in 24 hours.`,
    { label: "Activate my account", url }
  );
  return send(to, "Activate your TutorMatch account", html);
}

export async function sendPasswordResetEmail(to: string, name: string, rawToken: string) {
  const url = `${baseUrl()}/auth/reset-password?token=${rawToken}`;
  const html = layout(
    "Reset your password",
    `Hi ${name || "there"}, we received a request to reset your TutorMatch password. Click below to choose a new one. This link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    { label: "Reset my password", url }
  );
  return send(to, "Reset your TutorMatch password", html);
}
