async function main() {
  // Login
  const loginRes = await fetch('http://localhost:4001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev', password: 'dev123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Login success:', loginData.success);
  console.log('User ID:', loginData.user?._id);

  // Get messages - full response
  const msgRes = await fetch(
    'http://localhost:4001/api/conversations/6934e55ca3bc646ebee8ab73/messages',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const msgData = await msgRes.json();
  console.log('\nFull API Response:');
  console.log(JSON.stringify(msgData, null, 2).substring(0, 2000));
}

main().catch(console.error);
