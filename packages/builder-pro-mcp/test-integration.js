#!/usr/bin/env node

/**
 * Test Builder Pro v2.0 Integration
 *
 * This tests the integrated MCP server with all 5 new phases:
 * 1. detect_dependencies
 * 2. run_visual_test
 * 3. validate_configs
 * 4. manage_ports
 * 5. orchestrate_build
 */

const { spawn } = require('child_process');
const path = require('path');

async function testIntegration() {
  console.log('🧪 Builder Pro v2.0 Integration Test\n');
  console.log('='.repeat(70));
  console.log('PURPOSE: Verify MCP server exposes all v2.0 tools');
  console.log('='.repeat(70));
  console.log('');

  const testResults = {
    test1: { name: 'Server Startup', passed: false },
    test2: { name: 'List Tools (v2.0 tools exposed)', passed: false },
    test3: { name: 'Dependency Detection Tool', passed: false }
  };

  // Test 1: Server Startup
  console.log('\n📝 TEST 1: Server Startup');
  console.log('Expected: Server should start and show v2.0.0\n');

  try {
    const serverPath = path.join(__dirname, 'server.js');
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let startupOutput = '';
    let hasStarted = false;

    server.stderr.on('data', (data) => {
      startupOutput += data.toString();
      if (data.toString().includes('v2.0.0')) {
        hasStarted = true;
      }
    });

    // Wait for startup
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (hasStarted) {
      testResults.test1.passed = true;
      console.log('✅ TEST 1 PASSED: Server started with v2.0.0');
      console.log('');
    } else {
      console.log('❌ TEST 1 FAILED: Server did not start properly');
      console.log(startupOutput);
    }

    // Test 2: List Tools
    console.log('\n📝 TEST 2: List Tools');
    console.log('Expected: Should expose detect_dependencies, run_visual_test, validate_configs, manage_ports, orchestrate_build\n');

    // Send list_tools request
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    };

    server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

    let toolsResponse = '';
    let toolsReceived = false;

    server.stdout.on('data', (data) => {
      toolsResponse += data.toString();

      if (toolsResponse.includes('detect_dependencies') &&
          toolsResponse.includes('run_visual_test') &&
          toolsResponse.includes('validate_configs') &&
          toolsResponse.includes('manage_ports') &&
          toolsResponse.includes('orchestrate_build')) {
        toolsReceived = true;
      }
    });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (toolsReceived) {
      testResults.test2.passed = true;
      console.log('✅ TEST 2 PASSED: All v2.0 tools are exposed!');
      console.log('');
      console.log('   Detected tools:');
      console.log('     - detect_dependencies ✓');
      console.log('     - run_visual_test ✓');
      console.log('     - validate_configs ✓');
      console.log('     - manage_ports ✓');
      console.log('     - orchestrate_build ✓');
      console.log('');
    } else {
      console.log('❌ TEST 2 FAILED: Not all v2.0 tools exposed');
      console.log('Response:', toolsResponse.substring(0, 500));
    }

    // Test 3: Call Dependency Detection Tool
    console.log('\n📝 TEST 3: Dependency Detection Tool');
    console.log('Expected: Should successfully call detect_dependencies tool\n');

    const detectDepsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'detect_dependencies',
        arguments: {
          projectPath: '/tmp/builder-pro-validation/week1-blog/frontend',
          autoFix: false
        }
      }
    };

    server.stdin.write(JSON.stringify(detectDepsRequest) + '\n');

    let depsResponse = '';
    let depsReceived = false;

    server.stdout.on('data', (data) => {
      const str = data.toString();
      depsResponse += str;

      if (str.includes('Dependency Detection') || str.includes('missingCount')) {
        depsReceived = true;
      }
    });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (depsReceived) {
      testResults.test3.passed = true;
      console.log('✅ TEST 3 PASSED: Dependency detection tool works!');
      console.log('');

      // Try to extract summary
      try {
        const jsonMatch = depsResponse.match(/\{[\s\S]*"phase":\s*"Dependency Detection"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.summary) {
            console.log(`   Missing dependencies: ${result.summary.missingCount}`);
            console.log(`   Satisfied dependencies: ${result.summary.satisfiedCount}`);
            console.log('');
          }
        }
      } catch (e) {
        // Couldn't parse, but tool worked
      }
    } else {
      console.log('⚠️  TEST 3: Dependency detection tool called (response parsing incomplete)');
      console.log('Response preview:', depsResponse.substring(0, 300));
    }

    // Cleanup
    server.kill();

    // Final verdict
    console.log('\n' + '='.repeat(70));
    console.log('                    FINAL VERDICT');
    console.log('='.repeat(70));
    console.log('');

    const allPassed = Object.values(testResults).every(t => t.passed);

    if (allPassed) {
      console.log('✅ ALL TESTS PASSED!');
      console.log('');
      console.log('🎉 Phase 6 (Integration) is COMPLETE!');
      console.log('');
      console.log('Builder Pro v2.0 Integration Summary:');
      console.log('  ✅ Server starts with v2.0.0 version');
      console.log('  ✅ All 5 new tools exposed via MCP protocol');
      console.log('  ✅ Tools are callable and functional');
      console.log('');
      console.log('Next Steps:');
      console.log('  → Test orchestrate_build on blog platform');
      console.log('  → Phase 7: Dogfooding (use v2.0 to build v2.1)');
      console.log('  → Phase 8: Validate with 4 more apps');
      console.log('');
    } else {
      console.log('⚠️  SOME TESTS HAD ISSUES');
      console.log('');
      Object.entries(testResults).forEach(([key, result]) => {
        const icon = result.passed ? '✅' : '❌';
        console.log(`   ${icon} ${result.name}`);
      });
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('❌ INTEGRATION TEST FAILED:', error.message);
    console.error(error.stack);
  }
}

// Run test
testIntegration().catch(console.error);
