const bcrypt = require('bcryptjs');

const plainPassword = 'TempPassword123!';
const hashFromDB = '$2b$12$MTSw6c6h3/kykMVrK182peLwBt1UmotOiPlG.H3p7NSNzUfOjBOGe';

console.log('Testing bcrypt password verification...');
console.log('Plain password:', plainPassword);
console.log('Hash from DB:', hashFromDB);

bcrypt.compare(plainPassword, hashFromDB, (err, result) => {
  if (err) {
    console.error('Error comparing:', err);
  } else {
    console.log('Password matches hash:', result);
  }
});

// Also test with sync version
const syncResult = bcrypt.compareSync(plainPassword, hashFromDB);
console.log('Sync comparison result:', syncResult);