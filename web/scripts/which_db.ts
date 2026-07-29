import "./_env";
import mongoose from "mongoose";
import { DB_NAME, PROTECTED_DB_NAME } from "./_guard";

/**
 * Report which database the current environment points at, and what is in it.
 *
 * Read-only. Exists so "am I on the real data or the test one?" is a question
 * with a one-command answer, rather than something inferred from whether the
 * page looks empty.
 *
 *   npm run db:which                          -> the real database
 *   MONGODB_DB=tutormatch_test npm run db:which -> the test one
 */
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db!;

  const isProtected = DB_NAME === PROTECTED_DB_NAME;
  console.log(`\nDatabase : ${DB_NAME}`);
  console.log(`Status   : ${isProtected ? "⚠️  REAL DATA — destructive scripts are blocked here" : "✅ test database — safe to wipe and re-seed"}`);

  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  if (names.length === 0) {
    console.log("\n(empty — no collections yet)\n");
  } else {
    console.log("\nCollections:");
    for (const name of names) {
      const n = await db.collection(name).countDocuments({});
      const flag = name === "gatedecisions" ? "   <- results-chapter evidence" : "";
      console.log(`  ${name.padEnd(18)} ${String(n).padStart(6)}${flag}`);
    }
    console.log("");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
