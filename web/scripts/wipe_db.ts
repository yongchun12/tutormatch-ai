import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const run = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("No MONGODB_URI");

  await mongoose.connect(MONGODB_URI);
  console.log("Connected. Wiping database...");
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  console.log("Database completely wiped!");
  process.exit(0);
};

run().catch(console.error);
