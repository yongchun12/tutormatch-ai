import dbConnect from "../src/lib/db";
import { TuitionCentre } from "../src/models/TuitionCentre";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
    try {
        console.log("Connecting to database...");
        await dbConnect();
        
        console.log("Approving all pending tuition centres...");
        const result = await TuitionCentre.updateMany(
            { status: "pending" },
            { $set: { status: "approved" } }
        );
        
        console.log(`Successfully approved ${result.modifiedCount} tuition centres!`);
        process.exit(0);
    } catch (error) {
        console.error("Failed to approve centres:", error);
        process.exit(1);
    }
}

main();
