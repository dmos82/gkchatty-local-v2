const mongoose = require('mongoose');

async function checkUser() {
  try {
    await mongoose.connect('mongodb://localhost:27017/gkchatty');
    
    const UserSchema = new mongoose.Schema({
      username: String,
      role: String,
      email: String,
      password: String
    }, { collection: 'users' });
    
    const User = mongoose.models.User || mongoose.model('User', UserSchema);
    
    const devUser = await User.findOne({ username: 'dev' });
    
    if (devUser) {
      console.log('Found user: dev');
      console.log('Current role:', devUser.role);
      console.log('Is Admin:', devUser.role === 'admin');
      
      if (devUser.role !== 'admin') {
        console.log('\nUpdating dev user to admin role...');
        devUser.role = 'admin';
        await devUser.save();
        console.log('✅ User "dev" has been granted admin privileges!');
      } else {
        console.log('✅ User "dev" already has admin privileges!');
      }
    } else {
      console.log('User "dev" not found. Creating admin user...');
      
      // Create dev user with admin role
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('dev123', 10);
      
      const newUser = new User({
        username: 'dev',
        email: 'dev@localhost',
        password: hashedPassword,
        role: 'admin'
      });
      
      await newUser.save();
      console.log('✅ Created new admin user "dev"!');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkUser();