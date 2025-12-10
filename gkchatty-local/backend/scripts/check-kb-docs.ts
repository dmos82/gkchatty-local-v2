import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const SystemKbDocument = mongoose.model('SystemKbDocument', new mongoose.Schema({}, { strict: false }));
  const UserDocument = mongoose.model('UserDocument', new mongoose.Schema({}, { strict: false }));

  const systemDocs = await SystemKbDocument.find({}).select('originalFileName mimeType').limit(30);
  const userDocs = await UserDocument.find({}).select('originalFileName mimeType userId').limit(30);

  const systemTotal = await SystemKbDocument.countDocuments();
  const userTotal = await UserDocument.countDocuments();

  console.log('\n=== SYSTEM KB DOCUMENTS ===');
  console.log(`Total: ${systemTotal}`);
  systemDocs.forEach((d: any) => console.log(`  - ${d.originalFileName} (${d.mimeType})`));

  console.log('\n=== USER DOCUMENTS ===');
  console.log(`Total: ${userTotal}`);
  userDocs.forEach((d: any) => console.log(`  - ${d.originalFileName} (${d.mimeType})`));

  console.log('\n=== SUMMARY ===');
  console.log(`System KB: ${systemTotal} documents`);
  console.log(`User Docs: ${userTotal} documents`);
  console.log(`Total: ${systemTotal + userTotal} documents`);

  await mongoose.disconnect();
}

main().catch(console.error);
