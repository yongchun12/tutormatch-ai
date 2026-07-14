import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.useDb('test');
  const collection = db.collection('tuitioncentres');

  // Update all centres that do NOT have an ownerId (meaning they were scraped)
  // AND are currently 'pending', to be 'approved'
  const result = await collection.updateMany(
    { 
      $or: [
        { ownerId: { $exists: false } },
        { ownerId: null }
      ],
      status: 'pending' 
    },
    { $set: { status: 'approved' } }
  );

  console.log(`Matched ${result.matchedCount} scraped centres, updated ${result.modifiedCount} to approved.`);
  
  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch(console.error);
