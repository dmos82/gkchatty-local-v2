const mongoose = require('mongoose');
require('dotenv').config();

const documentSchema = new mongoose.Schema({}, { strict: false, collection: 'documents' });
const Document = mongoose.model('Document', documentSchema);

async function checkDocs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const docs = await Document.find({ uploadedBy: { $exists: true } }).limit(10);
    console.log('\nDocuments in database:');
    console.log('Total count:', await Document.countDocuments({ uploadedBy: { $exists: true } }));
    
    docs.forEach(doc => {
      console.log('\n---');
      console.log('ID:', doc._id);
      console.log('Filename:', doc.originalFileName);
      console.log('User ID:', doc.uploadedBy);
      console.log('Source Type:', doc.sourceType);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkDocs();
