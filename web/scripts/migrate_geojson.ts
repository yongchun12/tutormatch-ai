import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { TuitionCentre } from "../src/models/TuitionCentre";

dotenv.config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env.local");
  process.exit(1);
}

const migrate = async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const centres = await TuitionCentre.find({});
    console.log(`Found ${centres.length} centres. Checking for required migration...`);

    let updatedCount = 0;
    for (const centre of centres) {
      if (centre.latitude != null && centre.longitude != null) {
        if (!centre.location || !centre.location.coordinates || centre.location.coordinates.length === 0) {
          centre.location = {
            type: "Point",
            coordinates: [centre.longitude, centre.latitude],
          };
          await centre.save();
          updatedCount++;
        }
      }
    }

    console.log(`✅ Migration completed. Updated ${updatedCount} centres with GeoJSON location.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

migrate();
