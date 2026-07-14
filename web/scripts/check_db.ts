import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.useDb('test');
  const collection = db.collection('tuitioncentres');

  const all = await collection.find({ status: 'approved' }).toArray();
  const pg = all.filter(c => 
    (c.city && c.city.toLowerCase().includes('pinang')) || 
    (c.state && c.state.toLowerCase().includes('pinang')) ||
    (c.address && c.address.toLowerCase().includes('pinang'))
  );
  
  console.log(JSON.stringify(pg, null, 2));
  await mongoose.disconnect();
}

run().catch(console.error);
