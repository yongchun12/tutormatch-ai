import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { User } from "../src/models/User";
import bcrypt from "bcryptjs";
import { assertDisposableDatabase, announceDatabase, DB_NAME } from "./_guard";

dotenv.config({ path: ".env.local" });

const run = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("No MONGODB_URI");

  // Deletes every user account, including any real owner/admin logins.
  announceDatabase("seed_users");
  assertDisposableDatabase("delete all user accounts");

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected (database: ${DB_NAME}).`);

  // Pre-verify every demo account (the User schema defaults emailVerified to
  // false, which blocks login) so a fresh seed is immediately usable.
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  const studentProfile = {
    subjectsNeeded: ["Additional Math", "Physics"],
    preferredLocation: "Subang Jaya",
    maxPrice: 300,
    latitude: 3.0833,
    longitude: 101.5833,
  };

  await User.deleteMany({});

  // Showcase accounts advertised on the login page (password: password123).
  await User.create({ name: "System Admin", email: "admin@tuition.com", passwordHash: await hash("password123"), role: "admin", emailVerified: true });
  await User.create({ name: "Apex Academy Owner", email: "owner@tuition.com", passwordHash: await hash("password123"), role: "owner", emailVerified: true });
  await User.create({ name: "John Doe", email: "student@tuition.com", passwordHash: await hash("password123"), role: "student", emailVerified: true, ...studentProfile });

  // Legacy test accounts (password: password) — kept so older logins still work.
  await User.create({ name: "System Admin", email: "admin@test.com", passwordHash: await hash("password"), role: "admin", emailVerified: true });
  await User.create({ name: "Apex Academy Owner", email: "owner@test.com", passwordHash: await hash("password"), role: "owner", emailVerified: true });
  await User.create({ name: "John Doe", email: "student@test.com", passwordHash: await hash("password"), role: "student", emailVerified: true, ...studentProfile });

  console.log("Users created!");
  process.exit(0);
};

run().catch(console.error);
