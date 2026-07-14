import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.useDb('test');
  const collection = db.collection('tuitioncentres');

  const mockCentre = {
    name: "Penang Math Academy",
    description: "Specialized in intensive mathematics for Penang students.",
    address: "123 Jalan Penang, Georgetown",
    city: "Georgetown",
    state: "Pulau Pinang",
    subjects: ["Mathematics", "Additional Mathematics"],
    priceRange: "RM 150 - 300/mo",
    teachingMode: "hybrid",
    status: "approved",
    averageRating: 4.8,
    reviewCount: 42,
    latitude: 5.4141,
    longitude: 100.3288,
    location: {
      type: "Point",
      coordinates: [100.3288, 5.4141]
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await collection.insertOne(mockCentre);
  console.log('Inserted mock Penang centre successfully.');
  
  await mongoose.disconnect();
}

run().catch(console.error);
