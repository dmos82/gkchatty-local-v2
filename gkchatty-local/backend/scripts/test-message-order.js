const http = require('http');

async function main() {
  // Login
  const loginRes = await fetch('http://localhost:4001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev', password: 'dev123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Login:', loginData.success ? 'SUCCESS' : 'FAILED');

  // Get messages
  const msgRes = await fetch(
    'http://localhost:4001/api/conversations/6934e55ca3bc646ebee8ab73/messages',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const msgData = await msgRes.json();
  const messages = msgData.messages || [];

  console.log(`\nTotal messages: ${messages.length}`);
  console.log('\n=== FIRST 5 MESSAGES (should be OLDEST) ===');
  messages.slice(0, 5).forEach((m, i) => {
    const att = m.attachments?.length || 0;
    console.log(`${i + 1}. ${m.content?.substring(0, 35)}... (attachments: ${att})`);
  });

  console.log('\n=== LAST 5 MESSAGES (should be NEWEST with attachments) ===');
  messages.slice(-5).forEach((m, i) => {
    const att = m.attachments?.length || 0;
    console.log(
      `${messages.length - 4 + i}. ${m.content?.substring(0, 35)}... (attachments: ${att})`
    );
  });
}

main().catch(console.error);
