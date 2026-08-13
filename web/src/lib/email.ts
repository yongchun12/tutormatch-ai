import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email sending (activation + password reset).
 *
 * This is the ONLY module in the project that sends mail, so whatever it
 * resolves is what every email uses — there is no second transport anywhere to
 * disagree with it.
 *
 * Transport is chosen from the environment, and the choice is deliberately
 * all-or-nothing:
 *   • SMTP_HOST set  -> that server is used, always. Mailtrap, Gmail, SES-SMTP.
 *     SMTP_USER and SMTP_PASS are then REQUIRED; a missing one is an error
 *     naming the variable, never a quiet fall back to something else.
 *   • SMTP_HOST unset -> a Nodemailer "Ethereal" test account, which delivers
 *     nothing anywhere and logs a preview URL, so the flow still works with no
 *     configuration at all.
 *
 * The one thing that must never happen is the middle case: configured to reach
 * an inbox, quietly sending somewhere else. Run `npm run email:check` to see
 * which of the two is live and to put a real message in the inbox.
 */

/**
 * What the environment currently says the transport should be.
 *
 * Exported so a check command (scripts/email_check.ts) and the app agree on
 * what "configured" means, instead of each deciding for itself.
 */
export interface TransportConfig {
  kind: "smtp" | "ethereal";
  host: string;
  port: number;
  secure: boolean;
  /** Truncated for logging. The password is never returned or printed. */
  user: string | null;
  /** Set when SMTP is configured but unusable — the reason, in one sentence. */
  problem: string | null;
}

export function resolveTransportConfig(): TransportConfig {
  const host = process.env.SMTP_HOST?.trim();

  if (!host) {
    return {
      kind: "ethereal",
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      user: null,
      problem: null,
    };
  }

  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASS?.trim() || "";

  /*
    Half-configured SMTP is treated as an error, not as "no auth".

    Every SMTP service this project can realistically use — Mailtrap, Gmail,
    SES — requires a username and password. Sending without them does not fall
    back to anything useful; it fails at the server, and that failure was
    previously swallowed by the callers. Naming the missing variable is the
    whole point: a blank SMTP_PASS and a wrong SMTP_PASS produce very similar
    silence otherwise.
  */
  const missing = [!user && "SMTP_USER", !pass && "SMTP_PASS"].filter(Boolean);

  return {
    kind: "smtp",
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465
    user: user || null,
    problem: missing.length
      ? `SMTP_HOST is set to "${host}" but ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} empty, so the server will reject the login.`
      : null,
  };
}

/**
 * The transport, cached — but keyed on the configuration that produced it.
 *
 * The cache used to be a bare promise, which pinned the FIRST choice for the
 * lifetime of the process. Start `npm run dev`, then fix SMTP_PASS in
 * .env.local, and every email for the rest of that session still went to the
 * transport chosen before the fix. Keying on the config means a changed
 * variable builds a new transport instead of being ignored.
 */
let cached: { key: string; promise: Promise<Transporter> } | null = null;

/** Identity of the current config. The password is reduced to set/unset. */
function configKey(config: TransportConfig): string {
  return [
    config.kind,
    config.host,
    config.port,
    config.secure,
    config.user ?? "",
    process.env.SMTP_PASS ? "pass:set" : "pass:unset",
  ].join("|");
}

async function getTransport(): Promise<Transporter> {
  const config = resolveTransportConfig();
  const key = configKey(config);

  if (cached?.key === key) return cached.promise;

  const promise = (async (): Promise<Transporter> => {
    if (config.kind === "smtp") {
      if (config.problem) throw new Error(`[email] ${config.problem}`);

      /*
        Announce the transport once, on first use.

        Until this line existed there was no way to tell from the server console
        whether mail was going to the configured SMTP server or to the Ethereal
        fallback below, which delivers to nobody. "I registered and no email
        arrived" then had two completely different causes and no evidence to
        separate them. The username is truncated; the password is never printed.
      */
      console.log(
        `[email] transport: SMTP ${config.host}:${config.port} (secure=${config.secure}) as ${config.user?.slice(0, 4)}…`
      );

      return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user!, pass: process.env.SMTP_PASS! },
      });
    }

    /*
      Zero-config dev fallback: nothing is delivered anywhere, a preview link is
      printed instead. Reached ONLY when SMTP_HOST is unset — a configured host
      never silently degrades to this, because a test inbox that quietly
      receives nothing is indistinguishable from a broken one.
    */
    const testAccount = await nodemailer.createTestAccount();
    console.warn(
      "[email] SMTP_HOST is not set — using an Ethereal test account. NOTHING IS DELIVERED, " +
        "including to Mailtrap. Set SMTP_HOST/PORT/USER/PASS in web/.env.local and restart to deliver for real."
    );
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  cached = { key, promise };
  return promise;
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

const FROM = process.env.EMAIL_FROM || '"TutorMatch" <no-reply@tutormatch.app>';

/**
 * Send one message, and say so in the log either way.
 *
 * Every caller of this wraps it in a try/catch that swallows the error on
 * purpose — a mail hiccup must not fail a registration — so this is the ONLY
 * place a delivery problem can be recorded. It used to log just a preview URL,
 * which exists only for the Ethereal fallback; against a real SMTP server a
 * successful send and a rejected recipient both printed nothing at all.
 *
 * `rejected` matters as much as a thrown error: an SMTP server can accept the
 * message and still refuse the address, in which case nodemailer resolves
 * normally and nothing is delivered.
 */
async function send(to: string, subject: string, html: string) {
  try {
    // Inside the try: building the transport can itself fail (half-configured
    // SMTP), and that failure deserves the same log line as a refused send.
    const transport = await getTransport();
    const info = await transport.sendMail({ from: FROM, to, subject, html });
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    const rejected = (info.rejected ?? []).map(String);

    if (rejected.length > 0) {
      console.error(
        `[email] REJECTED "${subject}" → ${rejected.join(", ")} · server said: ${info.response}`
      );
    } else {
      console.log(
        `[email] sent "${subject}" → ${to} · id ${info.messageId}` +
          (previewUrl ? ` · preview: ${previewUrl}` : "")
      );
    }

    return { messageId: info.messageId, previewUrl };
  } catch (error: unknown) {
    // Logged here, with the SMTP detail, then rethrown so callers keep their
    // existing behaviour. A bare "Failed to send verification email: [object
    // Object]" upstream is not enough to tell a bad password from a bad host.
    const e = error as { code?: string; responseCode?: number; message?: string };
    console.error(
      `[email] FAILED "${subject}" → ${to} · ${e.code ?? "?"} ${e.responseCode ?? ""} ${e.message ?? error}`
    );
    throw error;
  }
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
