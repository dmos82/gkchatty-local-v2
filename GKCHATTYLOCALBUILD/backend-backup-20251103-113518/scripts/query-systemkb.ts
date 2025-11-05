import 'dotenv/config';
import mongoose from 'mongoose';

async function queryDocument() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Get all documents from systemkbdocuments collection
    console.log('\nAll documents in systemkbdocuments collection:');
    const docs = await db.collection('systemkbdocuments').find({}).toArray();

    if (docs.length === 0) {
      console.log('No documents found in collection');
    } else {
      docs.forEach(doc => {
        console.log('\nDocument:');
        console.log('ID:', doc._id.toString());
        console.log('Filename:', doc.filename);
        console.log('S3 Key:', doc.s3Key);
        console.log('File URL:', doc.fileUrl);
        console.log('Text Content Length:', doc.textContent?.length || 0);
        console.log('Created:', doc.createdAt);
      });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

queryDocument();
