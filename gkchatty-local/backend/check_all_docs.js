const mongoose = require('mongoose');
require('dotenv').config();

const documentSchema = new mongoose.Schema({}, { strict: false, collection: 'documents' });
const Document = mongoose.model('Document', documentSchema);

async function checkDocs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const totalDocs = await Document.countDocuments({});
    console.log('\nTotal documents in collection:', totalDocs);
    
    const docs = await Document.find({}).limit(10);
    
    docs.forEach(doc => {
      console.log('\n---');
      console.log('ID:', doc._id);
      console.log('Filename:', doc.originalFileName);
      console.log('uploadedBy:', doc.uploadedBy);
      console.log('userId:', doc.userId);
      console.log('sourceType:', doc.sourceType);
      console.log('All fields:', Object.keys(doc.toObject()));
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkDocs();
