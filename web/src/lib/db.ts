import mongoose from 'mongoose';

/**
 * Which database on the cluster to use.
 *
 * The connection string has an empty database path, so the driver falls back to
 * "test" — that is where the real data lives, including the gatedecisions
 * collection that backs the results chapter and cannot be regenerated (the gate
 * rules changed between crawls, so a re-crawl would not reproduce it).
 *
 * Setting MONGODB_DB switches every connection to a different database on the
 * same cluster, which is how testing against empty data is done without any risk
 * to the real one. `npm run dev:test` sets it; plain `npm run dev` does not.
 *
 * `dbName` takes precedence over whatever path the URI carries, so the URI never
 * has to be edited — no chance of mangling the credentials in it by hand.
 *
 * Read on every call rather than captured once at import. Next.js populates
 * .env.local before any module runs, but a standalone script loads it with
 * dotenv *after* its imports have already been evaluated — so a module-level
 * constant here resolved before .env.local existed, and silently fell back to
 * "test". That is the protected database: the safety guard would have been
 * comparing against the wrong name in exactly the case it exists to catch.
 */
export function getDbName(): string {
  return process.env.MONGODB_DB?.trim() || 'test';
}

/** The database holding the real, irreplaceable data. Destructive tooling refuses to touch it. */
export const PROTECTED_DB_NAME = 'test';

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Checked here rather than at import, so that importing this module for
    // DB_NAME alone does not require a live configuration.
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error(
        'Please define the MONGODB_URI environment variable inside .env.local'
      );
    }

    const opts = {
      bufferCommands: false,
      dbName: getDbName(),
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
