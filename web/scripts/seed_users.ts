import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { User } from "../src/models/User";
import bcrypt from "bcryptjs";

dotenv.config({ path: ".env.local" });

const run = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("No MONGODB_URI");

  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");
  
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("password", salt);

  await User.deleteMany({});
  await User.create({ name: "System Admin", email: "admin@test.com", passwordHash, role: "admin" });
  await User.create({ name: "Apex Academy Owner", email: "owner@test.com", passwordHash, role: "owner" });
  await User.create({
    name: "John Doe",
    email: "student@test.com",
    passwordHash,
    role: "student",
    subjectsNeeded: ["Additional Math", "Physics"],
    preferredLocation: "Subang Jaya",
    maxPrice: 300,
    latitude: 3.0833,
    longitude: 101.5833,
  });
  console.log("Users created!");
  process.exit(0);
};

run().catch(console.error);
