import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';

async function checkAttachmentFields() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not available');

    // Find messages with attachments
    const messages = await db.collection('directmessages').find({
      attachments: { $exists: true, $ne: [] }
    }).limit(3).toArray();

    console.log(`\n=== FULL ATTACHMENT DETAILS ===\n`);

    messages.forEach((msg, idx) => {
      console.log(`[${idx + 1}] Message ID: ${msg._id}`);
      console.log(`    Content: "${msg.content}"`);
      console.log(`    Attachments (FULL):`, JSON.stringify(msg.attachments, null, 4));
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkAttachmentFields();
