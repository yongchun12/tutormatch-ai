// Must come first: it loads .env.local, and everything below reads process.env.
import "./_env";

/**
 * Find WHICH Mailtrap inbox this project's credentials deliver into, and list
 * what is sitting in it.
 *
 * `npm run email:check` proves a message was accepted — the SMTP server
 * authenticates, takes the body and replies "250 Ok: queued". What it cannot
 * show is where the message landed, because Mailtrap issues a separate username
 * and password for every inbox and the SMTP conversation never names the inbox.
 * That is the gap this closes: "sent successfully" and "not in the inbox I am
 * looking at" are both true at the same time, and only the API can say why.
 *
 *   npm run email:inbox
 *
 * Needs a Mailtrap API token in web/.env.local:
 *
 *   MAILTRAP_API_TOKEN=...
 *
 * Get one from Mailtrap → Settings → API Tokens. Only read access is used here:
 * this script lists accounts, inboxes and message headers, and never sends,
 * deletes or modifies anything. The token is not printed, and neither are the
 * inbox passwords the API returns alongside each inbox.
 */

const API = "https://mailtrap.io/api";

interface Account {
  id: number;
  name: string;
}

interface Inbox {
  id: number;
  name: string;
  /** The SMTP username for THIS inbox — what we match against SMTP_USER. */
  username: string;
  domain?: string;
  emails_count?: number;
  sent_messages_count?: number;
}

interface Message {
  id: number;
  subject?: string;
  to_email?: string;
  sent_at?: string;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Api-Token": token, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "Mailtrap rejected the API token (401). Check MAILTRAP_API_TOKEN in web/.env.local."
        : `Mailtrap API ${res.status} on ${path}`
    );
  }
  return (await res.json()) as T;
}

async function main() {
  const token = process.env.MAILTRAP_API_TOKEN?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();

  if (!token) {
    console.error(
      `\n✋ MAILTRAP_API_TOKEN is not set.\n\n` +
        `   This script asks Mailtrap which inbox your SMTP credentials belong to,\n` +
        `   which needs an API token (the SMTP password will not do).\n\n` +
        `   1. Mailtrap → Settings → API Tokens → copy a token with read access\n` +
        `   2. Add it to web/.env.local:\n\n` +
        `          MAILTRAP_API_TOKEN=your-token\n\n` +
        `   3. Run: npm run email:inbox\n\n` +
        `   It only reads. Nothing is sent, deleted or changed.\n`
    );
    process.exit(1);
  }

  if (!smtpUser) {
    console.error(`\n✋ SMTP_USER is not set in web/.env.local, so there is nothing to match against.\n`);
    process.exit(1);
  }

  console.log(`\nLooking for the inbox that owns SMTP_USER "${smtpUser}"…`);

  const accounts = await api<Account[]>(token, "/accounts");
  if (accounts.length === 0) {
    console.error("\nThis token can see no Mailtrap accounts.\n");
    process.exit(1);
  }

  let match: { account: Account; inbox: Inbox } | null = null;

  for (const account of accounts) {
    const inboxes = await api<Inbox[]>(token, `/accounts/${account.id}/inboxes`);
    console.log(`\n─── account: ${account.name} (${inboxes.length} inbox${inboxes.length === 1 ? "" : "es"}) ${"─".repeat(20)}`);

    for (const inbox of inboxes) {
      const isMatch = inbox.username === smtpUser;
      if (isMatch) match = { account, inbox };
      console.log(
        `  ${isMatch ? "➡️ " : "   "}${inbox.name.padEnd(24)} ` +
          `messages: ${String(inbox.emails_count ?? 0).padStart(4)}   ` +
          `username: ${inbox.username.slice(0, 6)}…` +
          (isMatch ? "   ← your .env.local sends HERE" : "")
      );
    }
  }

  if (!match) {
    console.error(
      `\n✋ No inbox in any account this token can see uses the username "${smtpUser}".\n\n` +
        `   That is the whole explanation for the missing emails: the credentials in\n` +
        `   web/.env.local belong to an inbox this Mailtrap account no longer has —\n` +
        `   a deleted inbox, or one in a different Mailtrap account.\n\n` +
        `   Fix: open the inbox you want to use → Integrations → Nodemailer, and copy\n` +
        `   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS from there into web/.env.local.\n`
    );
    process.exit(1);
  }

  console.log(
    `\n✅ Your emails go to "${match.inbox.name}" in the "${match.account.name}" account.\n` +
      `   If that is not the inbox open in your browser, that is why it looks empty.\n`
  );

  const messages = await api<Message[]>(
    token,
    `/accounts/${match.account.id}/inboxes/${match.inbox.id}/messages`
  );

  console.log(`─── last ${Math.min(messages.length, 10)} message(s) in that inbox ${"─".repeat(20)}`);
  if (messages.length === 0) {
    console.log(
      `  (empty)\n\n` +
        `  The inbox is genuinely empty even though SMTP accepted the message. Check the\n` +
        `  Mailtrap plan's monthly message limit — once it is used up, new messages stop\n` +
        `  being stored.\n`
    );
    return;
  }

  messages.slice(0, 10).forEach((m) => {
    const when = m.sent_at ? new Date(m.sent_at).toISOString().slice(0, 16).replace("T", " ") : "?";
    console.log(`  ${when}  ${(m.to_email ?? "?").padEnd(38)} ${m.subject ?? "(no subject)"}`);
  });
  console.log("");
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
