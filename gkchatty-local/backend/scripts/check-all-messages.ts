import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const CONVERSATION_ID = '6934e55ca3bc646ebee8ab73';

async function checkAllMessages() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not available');

    // Find ALL messages in this conversation
    const messages = await db.collection('directmessages').find({
      conversationId: new mongoose.Types.ObjectId(CONVERSATION_ID)
    }).sort({ createdAt: 1 }).toArray();

    console.log(`\n=== ALL MESSAGES IN CONVERSATION (${messages.length}) ===\n`);

    messages.forEach((msg, idx) => {
      const hasAttachments = msg.attachments && msg.attachments.length > 0;
      console.log(`[${idx + 1}] ID: ${msg._id}`);
      console.log(`    Sender: ${msg.senderUsername}`);
      console.log(`    Content: "${msg.content?.substring(0, 50) || 'EMPTY'}"`);
      console.log(`    Has Attachments: ${hasAttachments ? `YES (${msg.attachments.length})` : 'NO'}`);
      if (hasAttachments) {
        console.log(`    Attachments: ${JSON.stringify(msg.attachments.map((a: any) => ({ type: a.type, filename: a.filename })))}`);
      }
      console.log(`    Created: ${msg.createdAt}`);
      console.log('');
    });

    // Summary
    const withAttachments = messages.filter(m => m.attachments && m.attachments.length > 0);
    const withoutAttachments = messages.filter(m => !m.attachments || m.attachments.length === 0);
    console.log('=== SUMMARY ===');
    console.log(`Total messages: ${messages.length}`);
    console.log(`With attachments: ${withAttachments.length}`);
    console.log(`Without attachments: ${withoutAttachments.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkAllMessages();
