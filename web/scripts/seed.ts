import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { User } from "../src/models/User";
import { TuitionCentre } from "../src/models/TuitionCentre";
import { Review } from "../src/models/Review";
import { recalculateCentreRating } from "../src/lib/review-helpers";
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

    // All demo accounts are pre-verified so a fresh seed is immediately usable.
    // (The User schema defaults emailVerified to false, which blocks login.)
    const hash = (pw: string) => bcrypt.hash(pw, 10);

    // Preferences for the demo student, used by distance/subject recommendations.
    const studentProfile = {
      subjectsNeeded: ["Additional Math", "Physics"],
      preferredLocation: "Subang Jaya",
      maxPrice: 300,
      // Subang Jaya coordinates, used for distance-based recommendations.
      latitude: 3.0833,
      longitude: 101.5833,
    };

    // Showcase accounts advertised on the login page (password: password123).
    // These own the seeded demo data so the showcase dashboards are populated.
    const admin = await User.create({ name: "System Admin", email: "admin@tuition.com", passwordHash: await hash("password123"), role: "admin", emailVerified: true });
    const owner = await User.create({ name: "Apex Academy Owner", email: "owner@tuition.com", passwordHash: await hash("password123"), role: "owner", emailVerified: true });
    const student = await User.create({ name: "John Doe", email: "student@tuition.com", passwordHash: await hash("password123"), role: "student", emailVerified: true, ...studentProfile });

    // Legacy test accounts (password: password) — kept so older logins still work.
    await User.create({ name: "System Admin", email: "admin@test.com", passwordHash: await hash("password"), role: "admin", emailVerified: true });
    await User.create({ name: "Apex Academy Owner", email: "owner@test.com", passwordHash: await hash("password"), role: "owner", emailVerified: true });
    await User.create({ name: "John Doe", email: "student@test.com", passwordHash: await hash("password"), role: "student", emailVerified: true, ...studentProfile });

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
      // Zero, and left that way deliberately. This used to seed "4.9 from 48
      // reviews" — a figure invented for the fixture, which the directory then
      // displayed as though 48 people had rated the centre. Ratings are only
      // ever written from a real source now: Google Places (ratingSource:
      // "google") or reviews actually left on TutorMatch. The Wilson lower
      // bound is demonstrated on crawled businesses instead — Quantum Academy
      // (5.0 from 1) against Pusat Tuisyen Seri Amal (4.9 from 98).
      averageRating: 0,
      reviewCount: 0,
      // Petaling Jaya - close to the student and a strong subject match.
      latitude: 3.1073,
      longitude: 101.6067,
      location: { type: "Point", coordinates: [101.6067, 3.1073] },
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
      // Was "4.7 from 35 reviews". See the note on centre1.
      averageRating: 0,
      reviewCount: 0,
      // Subang Jaya - nearest, but weaker subject match for this student.
      latitude: 3.0438,
      longitude: 101.5808,
      location: { type: "Point", coordinates: [101.5808, 3.0438] },
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
      // Was "5.0 from 3 reviews", written to demonstrate that the Wilson
      // adjustment stops a newcomer with a perfect average from topping the
      // ranking. That demonstration now rests on crawled data rather than on a
      // fixture built to produce the result — see the note on centre1.
      averageRating: 0,
      reviewCount: 0,
      // Kuala Lumpur - farther from the student.
      latitude: 3.1579,
      longitude: 101.7120,
      location: { type: "Point", coordinates: [101.7120, 3.1579] },
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

    // Derive centre1's headline rating from the two reviews just created,
    // rather than stating a number alongside them. The fixture used to declare
    // "4.9 from 48 reviews" above these same two reviews; this makes the
    // headline and the Reviews tab agree by construction, and stamps
    // ratingSource so the page can attribute it.
    await recalculateCentreRating(centre1._id.toString());

    console.log("✅ Seeding completed successfully!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedData();
