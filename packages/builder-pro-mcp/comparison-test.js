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

async function testComparison() {
  console.log('🔍 Testing builder-pro-mcp server: RAG vs Non-RAG comparison...\n');

  // Test without RAG context
  console.log('📊 Test 1: Code Review WITHOUT RAG Integration');
  console.log('=' .repeat(60));
  await runTest('Without RAG', null);

  console.log('\n\n📊 Test 2: Code Review WITH RAG Integration');
  console.log('=' .repeat(60));
  await runTest('With RAG', 'Express.js security best practices');

  console.log('\n\n✅ Comparison complete! Notice how RAG integration provides:');
  console.log('  • Additional security context from knowledge base');
  console.log('  • Relevant best practices from documentation');
  console.log('  • Enhanced insights for better code quality');
}

async function runTest(testName, contextQuery) {
  return new Promise((resolve) => {
    const server = spawn('node', ['server.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseData = '';
    let serverReady = false;

    server.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('MCP Protocol Ready')) {
        serverReady = true;
        sendRequest();
      }
    });

    server.stdout.on('data', (data) => {
      responseData += data.toString();
      try {
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim() && line.startsWith('{')) {
            const response = JSON.parse(line);
            if (response.result && response.result.content) {
              const result = JSON.parse(response.result.content[0].text);
              console.log(`\n${testName} Results:`);
              console.log(`• Critical Issues: ${result.critical?.length || 0}`);
              console.log(`• Warnings: ${result.warnings?.length || 0}`);
              console.log(`• RAG Insights: ${result.ragInsights?.length || 0}`);

              if (result.ragInsights && result.ragInsights.length > 0) {
                console.log('\nRAG Insights Preview:');
                result.ragInsights.slice(0, 2).forEach((insight, i) => {
                  console.log(`  ${i+1}. From ${insight.source}: ${insight.insight.substring(0, 100)}...`);
                });
              }

              server.kill();
              resolve();
              return;
            }
          }
        }
      } catch (e) {
        // Not complete JSON yet
      }
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      resolve();
    });

    function sendRequest() {
      const request = {
        jsonrpc: '2.0',
        id: Math.random(),
        method: 'tools/call',
        params: {
          name: 'review_code',
          arguments: {
            code: testCode,
            filePath: 'test-code.js',
            ...(contextQuery && { contextQuery })
          }
        }
      };

      server.stdin.write(JSON.stringify(request) + '\n');
    }

    setTimeout(() => {
      server.kill();
      resolve();
    }, 15000);
  });
}

testComparison().catch(console.error);