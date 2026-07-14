import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.useDb('test');
  const collection = db.collection('tuitioncentres');

  const all = await collection.find({}).toArray();
  console.log(`Total centres: ${all.length}`);
  
  const pending = all.filter(c => c.status === 'pending');
  console.log(`Pending centres: ${pending.length}`);
  
  const cities = new Set(all.map(c => c.city));
  console.log(`Cities:`, Array.from(cities));
  
  const states = new Set(all.map(c => c.state));
  console.log(`States:`, Array.from(states));
  
  await mongoose.disconnect();
}

run().catch(console.error);
