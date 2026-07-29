import * as dotenv from "dotenv";

/**
 * Loads .env.local for standalone scripts, as a side effect of being imported.
 *
 * Import this FIRST, before anything that reads process.env. Next.js loads
 * .env.local itself, but `tsx scripts/foo.ts` does not — and a script that calls
 * dotenv.config() below its own import list has already run those imports by the
 * time the variables exist. That ordering bug made `MONGODB_DB` invisible to the
 * safety guard, which then read the default database name ("test", the real
 * data) no matter what the caller asked for.
 */
dotenv.config({ path: ".env.local" });
