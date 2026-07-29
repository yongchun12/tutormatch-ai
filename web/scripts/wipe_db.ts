import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { assertDisposableDatabase, announceDatabase, DB_NAME } from "./_guard";

dotenv.config({ path: ".env.local" });

/**
 * Drops the selected database.
 *
 * This used to drop whatever MONGODB_URI pointed at, with no prompt and no
 * check — which meant one mistyped npm script would have destroyed the
 * gatedecisions collection permanently. It now refuses to run against the
 * protected database; see scripts/_guard.ts.
 */
const run = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("No MONGODB_URI");

  announceDatabase("wipe_db");
  assertDisposableDatabase("drop the database");

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected. Dropping "${DB_NAME}"...`);
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  console.log(`Database "${DB_NAME}" dropped.`);
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
