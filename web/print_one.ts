import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.useDb('test');
  const collection = db.collection('tuitioncentres');

  const centre = await collection.findOne({ googlePlaceId: { $exists: true } });
  console.log(JSON.stringify(centre, null, 2));

  const all = await collection.find({}).toArray();
  const withPlaceId = all.filter(c => c.googlePlaceId);
  console.log(`Total: ${all.length}, With PlaceID: ${withPlaceId.length}`);

  await mongoose.disconnect();
}

run().catch(console.error);
