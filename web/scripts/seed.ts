import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { User } from "../src/models/User";
import { TuitionCentre } from "../src/models/TuitionCentre";
import { Review } from "../src/models/Review";
import bcrypt from "bcryptjs";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env.local");
  process.exit(1);
}

const seedData = async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    console.log("⏳ Clearing existing data...");
    await User.deleteMany({});
    await TuitionCentre.deleteMany({});
    await Review.deleteMany({});
    
    console.log("⏳ Seeding dummy Users...");
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash("password", salt);

    const admin = await User.create({ name: "System Admin", email: "admin@test.com", passwordHash, role: "admin" });
    const owner = await User.create({ name: "Apex Academy Owner", email: "owner@test.com", passwordHash, role: "owner" });
    const student = await User.create({
      name: "John Doe",
      email: "student@test.com",
      passwordHash,
      role: "student",
      subjectsNeeded: ["Additional Math", "Physics"],
      preferredLocation: "Subang Jaya",
      maxPrice: 300,
      // Subang Jaya coordinates, used for distance-based recommendations.
      latitude: 3.0833,
      longitude: 101.5833,
    });

    console.log("⏳ Seeding dummy Tuition Centres...");
    const centre1 = await TuitionCentre.create({
      ownerId: owner._id,
      name: "Apex Excellence Academy",
      description: "Premium tuition specializing in STEM subjects with a track record of 90% A* students.",
      address: "123 Jalan Utama",
      city: "Petaling Jaya",
      state: "Selangor",
      subjects: ["Additional Math", "Physics", "Chemistry"],
      priceRange: "RM 250/mo",
      teachingMode: "hybrid",
      status: "approved",
      averageRating: 4.9,
      reviewCount: 48,
      // Petaling Jaya - close to the student and a strong subject match.
      latitude: 3.1073,
      longitude: 101.6067,
    });

    const centre2 = await TuitionCentre.create({
      ownerId: owner._id,
      name: "Bright Sparks Learning",
      description: "Interactive and engaging classes focusing on secondary school core subjects.",
      address: "456 Jalan Subang",
      city: "Subang Jaya",
      state: "Selangor",
      subjects: ["English", "Mathematics", "Science"],
      priceRange: "RM 180/mo",
      teachingMode: "physical",
      status: "approved",
      averageRating: 4.7,
      reviewCount: 35,
      // Subang Jaya - nearest, but weaker subject match for this student.
      latitude: 3.0438,
      longitude: 101.5808,
    });

    const centre3 = await TuitionCentre.create({
      ownerId: owner._id,
      name: "Genius Hub Tuition",
      description: "Newly opened STEM centre with small group classes.",
      address: "88 Jalan Ampang",
      city: "Kuala Lumpur",
      state: "Kuala Lumpur",
      subjects: ["Additional Math", "Physics"],
      priceRange: "RM 300/mo",
      teachingMode: "physical",
      status: "approved",
      averageRating: 5.0,
      // Perfect subjects and a perfect average, but only 3 reviews - the
      // Wilson adjustment should stop this newcomer from topping the ranking.
      reviewCount: 3,
      // Kuala Lumpur - farther from the student.
      latitude: 3.1579,
      longitude: 101.7120,
    });

    console.log("⏳ Seeding dummy Reviews...");
    await Review.create({
      userId: student._id,
      centreId: centre1._id,
      rating: 5,
      comment: "Teacher was amazing, helped me pull up my Add Math grade from C to A- in just 3 months. The notes are very concise.",
      sentimentScore: "positive",
      confidence: 0.95
    });

    await Review.create({
      userId: student._id,
      centreId: centre1._id,
      rating: 3,
      comment: "Classes are okay, standard stuff. But the chairs are a bit uncomfortable for 2-hour sessions.",
      sentimentScore: "neutral",
      confidence: 0.75
    });

    console.log("✅ Seeding completed successfully!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedData();
