const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend/.env' });

const SystemFolderSchema = new mongoose.Schema({
  name: String,
  parentId: String,
  path: String,
  permissions: {
    type: {
      type: String,
      enum: ['all', 'admin', 'specific-users'],
      default: 'admin'
    },
    allowedUsers: [String]
  }
});

const SystemFolder = mongoose.model('SystemFolder', SystemFolderSchema);

async function checkFolderPermissions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    const folderId = '691bc8f3c6c21172409d8ab0';
    console.log(`🔍 Looking for folder: ${folderId}\n`);

    const folder = await SystemFolder.findById(folderId);

    if (folder) {
      console.log(`✅ FOUND FOLDER:`);
      console.log(`   Name: ${folder.name}`);
      console.log(`   ID: ${folder._id}`);
      console.log(`   Parent ID: ${folder.parentId || '(root)'}`);
      console.log(`   Path: ${folder.path}`);
      console.log(`   Permissions:`, JSON.stringify(folder.permissions, null, 2));
    } else {
      console.log(`❌ FOLDER NOT FOUND: ${folderId}`);
      console.log('\n📊 All system folders:');
      const allFolders = await SystemFolder.find({});
      allFolders.forEach(f => {
        console.log(`   - ${f.name} (${f._id}) - Permissions: ${f.permissions?.type || 'none'}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  }
}

checkFolderPermissions();
