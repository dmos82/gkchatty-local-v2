const mongoose = require('mongoose');
const { TenantKnowledgeBase } = require('./src/models/TenantKnowledgeBase');
const { UserKBAccess } = require('./src/models/UserKBAccess');

async function testTenantKBCreation() {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI ||
      'mongodb+srv://davidmorinmusic:woolaway@cluster0gkchatty-dev-cl.fehrzkw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0gkchatty-dev-cluster';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Test creating a tenant KB
    const testKB = new TenantKnowledgeBase({
      name: 'Test KB',
      description: 'Test description',
      accessType: 'restricted',
      allowedRoles: [],
      allowedUsers: [],
      color: '#FF0000',
      shortName: 'TEST',
      createdBy: new mongoose.Types.ObjectId(), // Mock admin ID
      lastModifiedBy: new mongoose.Types.ObjectId(),
    });

    await testKB.save();
    console.log('Tenant KB created successfully:', testKB);

    // Clean up
    await TenantKnowledgeBase.deleteOne({ _id: testKB._id });
    console.log('Test KB deleted');

    await mongoose.connection.close();
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

testTenantKBCreation();
