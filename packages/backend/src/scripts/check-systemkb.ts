import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { SystemDocument } from '../models/SystemDocument';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function checkSystemKbKeys() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // Find sample system documents
    const systemDocs = await SystemDocument.find().limit(5).lean();

    console.log('SystemDocument Records:');
    systemDocs.forEach((doc, index) => {
      console.log(`\nDocument ${index + 1}:`);
      console.log('  Title:', doc.title);
      console.log('  fileKey:', doc.fileKey);
      console.log('  s3Key:', doc.s3Key);
      console.log('  s3Bucket:', doc.s3Bucket);
      console.log('  contentType:', doc.contentType);
    });

    // Check if specific document exists
    const specificDoc = await SystemDocument.findOne({ title: /ICBC.*Phone/i }).lean();
    if (specificDoc) {
      console.log('\nSpecific document "ICBC - Phone Procedure.pdf":');
      console.log('  fileKey:', specificDoc.fileKey);
      console.log('  s3Key:', specificDoc.s3Key);
      console.log('  s3Bucket:', specificDoc.s3Bucket);
    } else {
      console.log('\nDocument "ICBC - Phone Procedure.pdf" not found');
    }

    // Check another document that was mentioned
    const billingDoc = await SystemDocument.findOne({ title: /GK.*Billing/i }).lean();
    if (billingDoc) {
      console.log('\nSpecific document "GK - Billing Instructions.pdf":');
      console.log('  fileKey:', billingDoc.fileKey);
      console.log('  s3Key:', billingDoc.s3Key);
      console.log('  s3Bucket:', billingDoc.s3Bucket);
    } else {
      console.log('\nDocument "GK - Billing Instructions.pdf" not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkSystemKbKeys();
