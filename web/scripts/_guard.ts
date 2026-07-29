/**
 * Refuses to let a destructive script run against the real database.
 *
 * `wipe_db.ts` calls dropDatabase(), and `seed.ts` / `seed_users.ts` call
 * deleteMany({}) on whole collections. None of them asked anything before doing
 * it, and all of them read the same MONGODB_URI the app uses — so running the
 * wrong npm script once would have destroyed the gatedecisions the results
 * chapter is built on. Those cannot be regenerated: the gate rules changed
 * between the two crawls, so re-crawling would produce different decisions.
 *
 * Every destructive script now calls assertDisposableDatabase() first.
 */

// Must come first: it loads .env.local, and everything below reads process.env.
import "./_env";
import { getDbName, PROTECTED_DB_NAME } from "../src/lib/db";

/** The database this process will actually talk to, resolved after .env.local. */
export const DB_NAME = getDbName();

export { PROTECTED_DB_NAME };

/**
 * Throw unless the currently-selected database is a disposable one.
 *
 * The escape hatch is deliberately awkward — an environment variable naming the
 * exact database — because the only legitimate reason to wipe the real database
 * is a decision made on purpose, not a script run by muscle memory.
 */
export function assertDisposableDatabase(action: string): void {
  if (DB_NAME !== PROTECTED_DB_NAME) return;

  if (process.env.I_REALLY_MEAN_IT === PROTECTED_DB_NAME) {
    console.warn(
      `\n⚠️  ${action} is running against the PROTECTED database "${PROTECTED_DB_NAME}" ` +
        `because I_REALLY_MEAN_IT=${PROTECTED_DB_NAME} was set.\n`
    );
    return;
  }

  console.error(
    `\n✋ Refusing to ${action}.\n\n` +
      `   Target database : "${DB_NAME}"  (the real data — the gatedecisions\n` +
      `                      collection is the evidence base for the results chapter)\n\n` +
      `   Run it against the test database instead:\n\n` +
      `       MONGODB_DB=tutormatch_test npm run seed\n` +
      `       MONGODB_DB=tutormatch_test npm run wipe\n\n` +
      `   Or use the ready-made scripts, which set it for you:\n\n` +
      `       npm run seed:test\n` +
      `       npm run wipe:test\n\n` +
      `   If you genuinely intend to destroy the real data, set\n` +
      `   I_REALLY_MEAN_IT=${PROTECTED_DB_NAME} as well.\n`
  );
  process.exit(1);
}

/** Print which database a script is about to work on, so it is never a surprise. */
export function announceDatabase(action: string): void {
  const label = DB_NAME === PROTECTED_DB_NAME ? `${DB_NAME} (REAL DATA)` : `${DB_NAME} (test)`;
  console.log(`${action} → database: ${label}`);
}
