import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import * as documentProcessor from '../utils/documentProcessor';
import { generateEmbeddings } from '../utils/openaiHelper';
import { upsertSystemDocument } from '../utils/pineconeService';
import fs from 'fs';
import path from 'path';

async function createSystemKbRecord() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // File details
    const filename = '1747104327095-ICBC - Renewal Checklist.pdf';
    const s3Key = `system_docs/${filename}`;
    const filePath = path.join(process.cwd(), '.local_uploads', 'system_docs', filename);

    // Read the file
    console.log('Reading file from:', filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileUrl = `file://${filePath}`;

    // Extract text from PDF
    console.log('Extracting text from PDF...');
    const extractedText = await documentProcessor.extractTextFromPdf(fileBuffer);
    console.log('Text extracted, length:', extractedText.length);

    // Create embeddings
    console.log('Creating embeddings...');
    const embeddings = await generateEmbeddings([extractedText]);
    console.log('Embeddings created');

    // Create MongoDB record
    console.log('Creating MongoDB record...');
    const documentRecord = await SystemKbDocument.create({
      filename,
      s3Key,
      fileUrl,
      textContent: extractedText,
      fileSize,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Get the document ID as a string
    const documentId = (documentRecord as any)._id.toString();
    console.log('MongoDB record created with ID:', documentId);

    // Save to Pinecone
    console.log('Saving to Pinecone...');
    await upsertSystemDocument(documentId, embeddings[0], extractedText);
    console.log('Saved to Pinecone');

    await mongoose.disconnect();
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createSystemKbRecord();
