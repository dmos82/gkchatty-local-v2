#!/usr/bin/env node

const { spawn } = require('child_process');

// Test code from test-code.js
const testCode = `const express = require('express');
const app = express();

// Security issues
const password = "hardcoded123"; // Hardcoded credential
app.get('/user', (req, res) => {
  const userId = req.query.id;
  const html = \`<div>\${userId}</div>\`;
  res.send(html); // XSS vulnerability
});

// Code quality issues
var name = "test"; // Should use const/let
console.log("Debug info"); // Console statement

// Architecture issues - mixing routes with business logic
app.post('/process', async (req, res) => {
  // No error handling
  const data = await processData(req.body);
  const result = calculateResult(data);
  res.json(result);
});

async function processData(data) {
  return data.map(item => item.value);
}

function calculateResult(data) {
  return data.reduce((sum, val) => sum + val, 0);
}

app.listen(3000);`;

async function testReviewCode() {
  console.log('🚀 Testing builder-pro-mcp server review_code tool with RAG integration...\n');

  // Start the MCP server
  const server = spawn('node', ['server.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverReady = false;
  let responseData = '';

  // Handle server stderr (logging)
  server.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('Server Log:', output);
    if (output.includes('MCP Protocol Ready')) {
      serverReady = true;
      sendRequest();
    }
  });

  // Handle server stdout (MCP protocol responses)
  server.stdout.on('data', (data) => {
    responseData += data.toString();
    // Look for complete JSON responses
    try {
      const lines = responseData.split('\n');
      for (const line of lines) {
        if (line.trim() && line.startsWith('{')) {
          const response = JSON.parse(line);
          if (response.result && response.result.content) {
            console.log('\n📊 Code Review Results with RAG Integration:');
            console.log('=' .repeat(60));
            response.result.content.forEach(content => {
              if (content.type === 'text') {
                console.log(content.text);
              }
            });
            process.exit(0);
          }
        }
      }
    } catch (e) {
      // Not a complete JSON response yet
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  function sendRequest() {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'review_code',
        arguments: {
          code: testCode,
          filePath: 'test-code.js',
          contextQuery: 'Express.js security best practices'
        }
      }
    };

    console.log('📤 Sending review_code request with contextQuery: "Express.js security best practices"\n');
    server.stdin.write(JSON.stringify(request) + '\n');
  }

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('❌ Test timed out');
    server.kill();
    process.exit(1);
  }, 30000);
}

testReviewCode().catch(console.error);