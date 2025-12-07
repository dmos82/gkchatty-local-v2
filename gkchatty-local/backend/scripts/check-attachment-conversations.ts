import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';

async function checkAttachmentConversations() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not available');

    // Find all messages with attachments
    const messagesWithAttachments = await db.collection('directmessages').find({
      attachments: { $exists: true, $ne: [] }
    }).toArray();

    console.log(`\n=== MESSAGES WITH ATTACHMENTS (${messagesWithAttachments.length}) ===\n`);

    // Group by conversation
    const byConversation = new Map<string, any[]>();
    messagesWithAttachments.forEach(msg => {
      const convId = msg.conversationId?.toString() || 'unknown';
      if (!byConversation.has(convId)) {
        byConversation.set(convId, []);
      }
      byConversation.get(convId)!.push(msg);
    });

    // Get conversation details
    for (const [convId, messages] of byConversation) {
      const conversation = await db.collection('conversations').findOne({
        _id: new mongoose.Types.ObjectId(convId)
      });

      console.log(`\nConversation: ${convId}`);
      console.log(`  Participants: ${conversation?.participantUsernames?.join(', ') || 'unknown'}`);
      console.log(`  Messages with attachments: ${messages.length}`);

      messages.forEach(msg => {
        console.log(`    - Message ID: ${msg._id}`);
        console.log(`      Content: "${msg.content?.substring(0, 50)}..."`);
        console.log(`      Sender: ${msg.senderUsername}`);
        console.log(`      Attachments: ${msg.attachments.length}`);
        msg.attachments.forEach((att: any, idx: number) => {
          console.log(`        [${idx}] type: "${att.type}", filename: "${att.filename}"`);
        });
      });
    }

    // Also list all conversations with their IDs
    console.log('\n\n=== ALL CONVERSATIONS ===\n');
    const allConversations = await db.collection('conversations').find({}).toArray();
    allConversations.forEach(conv => {
      console.log(`  ${conv._id} - ${conv.participantUsernames?.join(' <-> ')}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkAttachmentConversations();
