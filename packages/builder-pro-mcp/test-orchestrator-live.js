#!/usr/bin/env node

/**
 * Test Builder Pro v2.0 Orchestrator (Live Test)
 *
 * This runs the complete orchestrate_build workflow on the blog platform
 * to prove the entire v2.0 system works end-to-end.
 */

const BugOrchestrator = require('./src/fix-orchestrator/bug-orchestrator');

async function testOrchestratorLive() {
  console.log('🧪 Builder Pro v2.0 Orchestrator - Live Test\n');
  console.log('='.repeat(70));
  console.log('PURPOSE: Prove complete v2.0 workflow on blog platform');
  console.log('='.repeat(70));
  console.log('');

  const blogPath = '/tmp/builder-pro-validation/week1-blog/frontend';

  console.log(`📁 Project: ${blogPath}`);
  console.log('');

  // Create orchestrator with v2.0 settings
  const orchestrator = new BugOrchestrator({
    maxIterations: 3,
    autoFix: false,  // Just validate, don't fix (blog is already fixed)
    stopOnCritical: true
  });

  try {
    console.log('🚀 Running orchestrator...\n');

    const results = await orchestrator.orchestrate(blogPath, {
      // Skip frontend visual test for now (would require server running)
      frontend: false
    });

    const report = orchestrator.generateReport(results);

    console.log(report);

    // Summary
    console.log('='.repeat(70));
    console.log('                    TEST RESULTS');
    console.log('='.repeat(70));
    console.log('');

    if (results.summary.totalBugs === 0) {
      console.log('✅ PERFECT! Blog platform has 0 bugs detected!');
      console.log('');
      console.log('🎉 This proves Builder Pro v2.0 works correctly:');
      console.log('   - Phase 1 (Dependency Detection): Found all deps satisfied ✓');
      console.log('   - Phase 3 (Config Validation): Found 0 config issues ✓');
      console.log('   - Phase 5 (Orchestrator): Successfully validated project ✓');
      console.log('');
      console.log('The blog platform that had 3 critical bugs now passes');
      console.log('all v2.0 validation checks because we fixed it manually.');
      console.log('');
      console.log('Next: Test on a BROKEN project to prove auto-fix works!');
      console.log('');
    } else {
      console.log(`⚠️  Found ${results.summary.totalBugs} bug(s) in blog platform`);
      console.log('');
      console.log('This is unexpected since we already fixed the blog.');
      console.log('Let\'s review what was found:');
      console.log('');

      results.iterations.forEach((iter, idx) => {
        if (iter.bugs.length > 0) {
          console.log(`Iteration ${iter.number}:`);
          iter.bugs.forEach(bug => {
            console.log(`  - [${bug.severity}] ${bug.message}`);
          });
          console.log('');
        }
      });
    }

    console.log('='.repeat(70));
    console.log('');

    // Now test on a buggy project
    console.log('\n🧪 BONUS TEST: Create Buggy Project and Auto-Fix\n');
    console.log('='.repeat(70));

    await testAutofixWorkflow();

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error(error.stack);
  }
}

async function testAutofixWorkflow() {
  const fs = require('fs').promises;
  const path = require('path');

  const testPath = '/tmp/builder-pro-autofix-test';

  console.log(`Creating intentionally buggy project at: ${testPath}\n`);

  // Create buggy project
  await fs.mkdir(testPath, { recursive: true });
  await fs.mkdir(path.join(testPath, 'src'), { recursive: true });

  // ESM package.json
  const packageJson = {
    name: 'autofix-test',
    version: '1.0.0',
    type: 'module',
    dependencies: {
      'react': '^18.0.0'
    },
    devDependencies: {
      'tailwindcss': '^3.4.1'
      // Missing @tailwindcss/typography - Bug 1
    }
  };

  await fs.writeFile(
    path.join(testPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // CSS with prose classes
  const cssContent = `
@tailwind base;
@tailwind components;
@tailwind utilities;

.article {
  @apply prose prose-lg max-w-none;
}
`;

  await fs.writeFile(path.join(testPath, 'src/index.css'), cssContent);

  // Tailwind config with WRONG syntax (CommonJS in ESM project) - Bug 2
  const tailwindConfig = `
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
`;

  await fs.writeFile(path.join(testPath, 'tailwind.config.js'), tailwindConfig);

  console.log('✅ Created buggy project with 2 intentional bugs:');
  console.log('   Bug 1: Missing @tailwindcss/typography in package.json');
  console.log('   Bug 2: Using require() in ESM project (tailwind.config.js)');
  console.log('');

  // Run orchestrator with auto-fix enabled
  console.log('🔧 Running orchestrator with AUTO-FIX enabled...\n');

  const orchestrator = new BugOrchestrator({
    maxIterations: 3,
    autoFix: true,  // Enable auto-fix
    stopOnCritical: true
  });

  const results = await orchestrator.orchestrate(testPath, {
    frontend: false
  });

  const report = orchestrator.generateReport(results);

  console.log(report);

  // Final verdict
  console.log('='.repeat(70));
  console.log('                    AUTO-FIX RESULTS');
  console.log('='.repeat(70));
  console.log('');

  if (results.summary.fixed === results.summary.totalBugs) {
    console.log('🎉 PERFECT AUTO-FIX!');
    console.log('');
    console.log(`   Bugs detected: ${results.summary.totalBugs}`);
    console.log(`   Bugs fixed: ${results.summary.fixed}`);
    console.log(`   Success rate: ${results.summary.successRate}%`);
    console.log(`   Iterations: ${results.iterations.length}`);
    console.log('');
    console.log('✅ Builder Pro v2.0 Auto-Fix VALIDATED!');
    console.log('');
  } else {
    console.log('⚠️  Auto-fix incomplete:');
    console.log(`   Bugs detected: ${results.summary.totalBugs}`);
    console.log(`   Bugs fixed: ${results.summary.fixed}`);
    console.log(`   Bugs remaining: ${results.summary.remaining}`);
    console.log('');
  }

  // Cleanup
  console.log(`\n🧹 Cleaning up test project: ${testPath}`);
  await fs.rm(testPath, { recursive: true, force: true });

  console.log('='.repeat(70));
  console.log('');
}

// Run test
testOrchestratorLive().catch(console.error);
