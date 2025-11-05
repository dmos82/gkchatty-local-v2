const http = require('http');

async function getToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin' });
    const options = {
      hostname: 'localhost', port: 6001, path: '/api/auth/login',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(JSON.parse(body).token));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function createUser(token) {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const data = JSON.stringify({
      username: `testuser${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: 'Test123!',
      role: 'user'
    });
    const options = {
      hostname: 'localhost', port: 6001, path: '/api/admin/users',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
        resolve(JSON.parse(body));
      });
    });
    req.on('error', (e) => console.error('Error:', e));
    req.write(data);
    req.end();
  });
}

getToken().then(createUser).catch(console.error);
