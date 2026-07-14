import mongoose from "mongoose";
import { TuitionCentre } from "../src/models/TuitionCentre";

async function run() {
  await mongoose.connect("mongodb://localhost:27017/tuition-directory");
  const centres = await TuitionCentre.find().sort({_id: -1}).limit(5).lean();
  console.log(centres.map(c => ({ id: c._id, name: c.name, rating: c.averageRating, reviewCount: c.reviewCount, contactNumber: c.contactNumber })));
  process.exit(0);
}
run();
