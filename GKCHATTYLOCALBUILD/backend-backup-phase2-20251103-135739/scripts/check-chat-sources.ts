import 'dotenv/config';
import mongoose from 'mongoose';

// The document ID to check from the logs: 6831f00e17870675709e25b3
const documentIdToCheck = process.argv[2] || '6831f00e17870675709e25b3';

// Define basic interface types for the script
interface Source {
  documentId: string;
  fileName?: string;
  type?: string;
  [key: string]: any; // Allow for other properties
}

interface Message {
  role: string;
  content: string;
  sources?: Source[];
  [key: string]: any; // Allow for other properties
}

interface Chat {
  _id: string;
  chatName?: string;
  createdAt: Date;
  messages: Message[];
  [key: string]: any; // Allow for other properties
}

async function checkChatSources() {
  try {
    console.log(`[Check] Looking for document ID: ${documentIdToCheck} in chat sources`);

    // Connect to MongoDB
    console.log('[Check] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    const dbName = mongoose.connection.db?.databaseName;
    console.log('[Check] Connected to database:', dbName);

    // Get direct DB connection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database connection');
    }

    // Check Chats collection
    console.log('\n--- Checking Chats collection for document references ---');
    const chatsCollection = db.collection('chats');

    // Find chats that reference this document in their messages.sources array
    const chatWithRefs = (await chatsCollection
      .find({
        'messages.sources.documentId': documentIdToCheck,
      })
      .toArray()) as Chat[];

    console.log(
      `[Check] Found ${chatWithRefs.length} chats referencing document ID: ${documentIdToCheck}`
    );

    if (chatWithRefs.length > 0) {
      // For each chat, extract the specific messages that reference the document
      for (const chat of chatWithRefs) {
        console.log(`\nChat ID: ${chat._id}`);
        console.log(`Chat Name: ${chat.chatName || 'Unnamed chat'}`);
        console.log(`Created: ${new Date(chat.createdAt).toLocaleString()}`);

        // Find messages with the document reference
        const messagesWithRef = chat.messages.filter(
          (msg: Message) =>
            msg.sources && msg.sources.some((src: Source) => src.documentId === documentIdToCheck)
        );

        console.log(`Messages referencing document: ${messagesWithRef.length}`);

        // Print details of the first message containing the reference
        if (messagesWithRef.length > 0) {
          const firstRefMsg = messagesWithRef[0];
          console.log('\nFirst message with reference:');
          console.log(`Role: ${firstRefMsg.role}`);
          console.log(`Content: ${firstRefMsg.content.substring(0, 100)}...`);

          // Get source details
          const sources =
            firstRefMsg.sources?.filter((src: Source) => src.documentId === documentIdToCheck) ||
            [];
          console.log('\nSource details:');
          for (const source of sources) {
            console.log(JSON.stringify(source, null, 2));
          }
        }
      }
    } else {
      console.log(`[Check] No chat messages reference document ID: ${documentIdToCheck}`);
    }

    // Now let's check if the document is in the DB
    console.log('\n--- Checking if document exists in SystemKbDocument collection ---');
    const systemKbCollection = db.collection('systemkbdocuments');
    const systemKbDoc = await systemKbCollection.findOne({
      _id: new mongoose.Types.ObjectId(documentIdToCheck),
    });

    console.log(
      '[Check] Document found in SystemKbDocument collection:',
      systemKbDoc ? 'YES' : 'NO'
    );

    if (systemKbDoc) {
      console.log(
        '[Check] Document filename:',
        systemKbDoc.filename || systemKbDoc.originalFileName
      );
      console.log('[Check] Document s3Key:', systemKbDoc.s3Key);
    }

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n[Check] Disconnected from MongoDB');
  } catch (error) {
    console.error('[Check] Error:', error);
    process.exit(1);
  }
}

checkChatSources();
