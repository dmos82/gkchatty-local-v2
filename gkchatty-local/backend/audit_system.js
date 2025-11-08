const mongoose = require('mongoose');
const { Pinecone } = require('@pinecone-database/pinecone');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Define schemas
const documentSchema = new mongoose.Schema({}, { strict: false, collection: 'documents' });
const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const Document = mongoose.model('Document', documentSchema);
const User = mongoose.model('User', userSchema);

async function audit() {
  const report = {
    timestamp: new Date().toISOString(),
    git_commit: null,
    mongodb: {},
    pinecone: {},
    file_storage: {},
    issues: []
  };

  try {
    // Git info
    const { execSync } = require('child_process');
    report.git_commit = execSync('git rev-parse HEAD').toString().trim();
    report.git_branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

    console.log('='.repeat(80));
    console.log('GKCHATTY SYSTEM AUDIT');
    console.log('='.repeat(80));
    console.log('Timestamp:', report.timestamp);
    console.log('Git Commit:', report.git_commit);
    console.log('Git Branch:', report.git_branch);
    console.log('');

    // MongoDB Audit
    console.log('--- MONGODB AUDIT ---');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Count documents
    const totalDocs = await Document.countDocuments({});
    const userDocs = await Document.countDocuments({ sourceType: 'user' });
    const systemDocs = await Document.countDocuments({ sourceType: 'system' });

    report.mongodb = {
      total_documents: totalDocs,
      user_documents: userDocs,
      system_documents: systemDocs,
      collections: []
    };

    console.log('Total documents:', totalDocs);
    console.log('User documents:', userDocs);
    console.log('System documents:', systemDocs);

    if (totalDocs > 0) {
      console.log('\nSample documents:');
      const samples = await Document.find({}).limit(5);
      samples.forEach((doc, i) => {
        const userId = doc.uploadedBy || doc.userId || 'unknown';
        console.log(`  ${i+1}. ${doc.originalFileName} (sourceType: ${doc.sourceType}, user: ${userId})`);
      });
    }

    // Count users
    const totalUsers = await User.countDocuments({});
    report.mongodb.total_users = totalUsers;
    console.log('\nTotal users:', totalUsers);

    if (totalUsers > 0) {
      const users = await User.find({}, { username: 1, role: 1 }).limit(10);
      console.log('Users:');
      users.forEach(u => {
        console.log(`  - ${u.username} (${u.role})`);
      });
    }

    // Check all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    report.mongodb.collections = collections.map(c => c.name);
    console.log('\nAll collections:', collections.length);
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`  - ${col.name}: ${count} documents`);
    }

    // Pinecone Audit
    console.log('\n--- PINECONE AUDIT ---');
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

    console.log('Index name:', process.env.PINECONE_INDEX_NAME);

    // Get index stats
    const stats = await index.describeIndexStats();
    report.pinecone = {
      total_vectors: stats.totalRecordCount,
      dimension: stats.dimension,
      namespaces: stats.namespaces || {}
    };

    console.log('Total vectors:', stats.totalRecordCount);
    console.log('Dimension:', stats.dimension);
    console.log('Namespaces:');

    if (stats.namespaces) {
      for (const [ns, data] of Object.entries(stats.namespaces)) {
        console.log(`  - ${ns}: ${data.recordCount} vectors`);
      }
    }

    // File Storage Audit
    console.log('\n--- FILE STORAGE AUDIT ---');
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
    report.file_storage.upload_dir = uploadDir;
    report.file_storage.exists = fs.existsSync(uploadDir);

    console.log('Upload directory:', uploadDir);
    console.log('Directory exists:', report.file_storage.exists);

    if (report.file_storage.exists) {
      const files = fs.readdirSync(uploadDir);
      report.file_storage.file_count = files.length;
      console.log('Files in upload directory:', files.length);

      if (files.length > 0) {
        console.log('Sample files:');
        files.slice(0, 10).forEach((file, i) => {
          const filePath = path.join(uploadDir, file);
          const stats = fs.statSync(filePath);
          console.log(`  ${i+1}. ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        });
      }
    }

    // Data Consistency Check
    console.log('\n--- DATA CONSISTENCY CHECK ---');

    // Check if Pinecone vectors have corresponding MongoDB documents
    if (stats.totalRecordCount > 0 && totalDocs === 0) {
      report.issues.push('CRITICAL: Pinecone has vectors but MongoDB has no documents (ghost embeddings)');
      console.log('⚠️  ISSUE: Ghost embeddings detected (Pinecone has data, MongoDB empty)');
    }

    if (stats.totalRecordCount === 0 && totalDocs > 0) {
      report.issues.push('WARNING: MongoDB has documents but Pinecone has no vectors (missing embeddings)');
      console.log('⚠️  ISSUE: Documents not embedded (MongoDB has data, Pinecone empty)');
    }

    // Summary
    console.log('\n--- SUMMARY ---');
    if (report.issues.length === 0) {
      console.log('✓ No issues detected');
    } else {
      console.log('⚠️  Issues detected:', report.issues.length);
      report.issues.forEach((issue, i) => {
        console.log(`  ${i+1}. ${issue}`);
      });
    }

    // Write report to file
    const reportPath = path.join(__dirname, 'audit_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('\n✓ Full audit report saved to:', reportPath);

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Audit failed:', error);
    report.issues.push(`Audit error: ${error.message}`);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

audit();
