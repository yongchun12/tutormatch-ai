// Must come first: it loads .env.local, and everything below reads process.env.
import "./_env";
import nodemailer from "nodemailer";
import { resolveTransportConfig, sendVerificationEmail } from "../src/lib/email";

/**
 * Answer one question: where do this project's emails actually go?
 *
 * The app cannot tell you on its own. Registration and password reset both
 * swallow send failures on purpose — a mail hiccup must not fail a sign-up — so
 * "no email arrived" looks identical whether the credentials are wrong, the
 * variables were never loaded, or the message went to a different inbox than
 * the one being watched.
 *
 *   npm run email:check                       # report config + test the connection
 *   npm run email:check -- --send you@x.com   # also send a real activation email
 *
 * The --send form puts a genuine "Activate your TutorMatch account" message
 * through the same function the registration route calls, so a message landing
 * in Mailtrap is proof of the whole path, not of this script.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const config = resolveTransportConfig();
  const recipient = arg("send");

  console.log(`\n─── email configuration ${"─".repeat(34)}`);
  console.log(`  read from   : web/.env.local`);
  console.log(`  EMAIL_FROM  : ${process.env.EMAIL_FROM || "(default) TutorMatch <no-reply@tutormatch.app>"}`);

  if (config.kind === "ethereal") {
    console.log(`  transport   : Ethereal test account`);
    console.error(
      `\n✋ SMTP_HOST is not set, so NOTHING is delivered — not to Mailtrap, not anywhere.\n` +
        `   Mail is written to a throwaway Ethereal account and only a preview link is printed.\n\n` +
        `   Fix: set these in web/.env.local, then restart the dev server.\n\n` +
        `       SMTP_HOST=sandbox.smtp.mailtrap.io\n` +
        `       SMTP_PORT=587\n` +
        `       SMTP_SECURE=false\n` +
        `       SMTP_USER=<your Mailtrap inbox username>\n` +
        `       SMTP_PASS=<your Mailtrap inbox password>\n\n` +
        `   Mailtrap → Email Testing → your inbox → Integrations → Nodemailer shows all five.\n`
    );
    process.exit(1);
  }

  console.log(`  transport   : SMTP ${config.host}:${config.port} (secure=${config.secure})`);
  console.log(`  username    : ${config.user ? `${config.user.slice(0, 4)}… (${config.user.length} chars)` : "(none)"}`);
  console.log(`  password    : ${process.env.SMTP_PASS ? "set" : "NOT SET"}`);

  if (config.problem) {
    console.error(`\n✋ ${config.problem}\n`);
    process.exit(1);
  }

  const isMailtrap = /mailtrap\.io$/i.test(config.host);
  console.log(`  destination : ${isMailtrap ? "Mailtrap — every message is caught, nothing reaches a real person" : "a real mail server — messages CAN reach real inboxes"}`);

  // A live login. Distinguishes "wrong password" (EAUTH) from "wrong host" or a
  // blocked port, both of which look the same from inside the app.
  console.log(`\n─── connection ${"─".repeat(43)}`);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user!, pass: process.env.SMTP_PASS! },
  });

  try {
    await transport.verify();
    console.log(`  ✅ connected and authenticated`);
  } catch (error: unknown) {
    const e = error as { code?: string; responseCode?: number; message?: string };
    console.error(`  ❌ ${e.code ?? ""} ${e.responseCode ?? ""} ${e.message ?? error}`);
    console.error(
      e.code === "EAUTH"
        ? `\n  The server rejected the username/password. In Mailtrap these are per-inbox —\n` +
            `  copy them again from the inbox you intend to watch (Integrations → Nodemailer).\n`
        : `\n  The server could not be reached. Check SMTP_HOST and SMTP_PORT.\n`
    );
    process.exit(1);
  }

  if (!recipient) {
    console.log(`\n  Nothing was sent. To put a real activation email in the inbox:\n`);
    console.log(`      npm run email:check -- --send you@example.com\n`);
    return;
  }

  // Through the app's own function, not a hand-rolled message — this is the
  // exact call /api/auth/register makes.
  console.log(`\n─── sending ${"─".repeat(46)}`);
  const token = `email-check-${Date.now()}`;
  try {
    const info = await sendVerificationEmail(recipient, "Email Check", token);
    console.log(`  ✅ accepted · id ${info.messageId}`);
    console.log(
      `\n  Look for "Activate your TutorMatch account" addressed to ${recipient}` +
        `${isMailtrap ? " in your Mailtrap inbox" : ""}.\n` +
        `  If it is not there, the credentials belong to a DIFFERENT inbox than the one you are watching.\n`
    );
    console.log(`  (The activation link in it carries a dummy token, so it will not verify an account.)\n`);
  } catch (error: unknown) {
    const e = error as { code?: string; responseCode?: number; message?: string };
    console.error(`  ❌ ${e.code ?? ""} ${e.responseCode ?? ""} ${e.message ?? error}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
