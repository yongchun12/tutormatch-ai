const mongoose = require('mongoose');
const uri = "mongodb+srv://yongchun:Jyc070137@tuition-centre-director.exva0lh.mongodb.net/?appName=Tuition-Centre-Directory";

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const centres = await db.collection('tuitioncentres').find({ status: 'approved' }).toArray();
  const leads = await db.collection('studentleads').find({}).toArray();
  console.log("Approved Centres:", centres.length);
  console.log("Total Leads:", leads.length);
  if (leads.length > 0) {
    console.log("Latest Lead:", leads[leads.length - 1]);
  }
  process.exit(0);
}
run();
