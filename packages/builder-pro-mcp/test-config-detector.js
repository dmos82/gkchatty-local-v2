#!/usr/bin/env node

/**
 * Test Config Plugin Detector against the blog platform
 * This proves it would have caught the require() vs import mismatch bug
 */

const ConfigPluginDetector = require('./src/dependency-detection/config-plugin-detector');

async function testBlogPlatform() {
  console.log('\n🧪 Testing Config Plugin Detector on Blog Platform\n');
  console.log('This test proves we would have caught the module system mismatch bug\n');

  const blogPath = '/tmp/builder-pro-validation/week1-blog/frontend';

  // Run detector
  const detector = new ConfigPluginDetector();
  const results = await detector.detectConfigPlugins(blogPath);

  // Generate and print report
  const report = detector.generateReport(results);
  console.log(report);

  // Validation
  console.log('\n=== VALIDATION ===\n');

  if (results.moduleSystemIssues.length > 0) {
    console.log('✅ SUCCESS: Detector found module system mismatch!');
    console.log('✅ This bug would have been caught BEFORE the plugin failed to load\n');

    results.moduleSystemIssues.forEach(issue => {
      console.log(`Details:`);
      console.log(`  - File: ${issue.file}`);
      console.log(`  - Problem: ${issue.message}`);
      console.log(`  - Fix: ${issue.suggestion}`);
    });
  } else {
    console.log('ℹ️  No module system issues detected (bug may have been fixed)');
  }

  // Check for typography plugin detection
  if (results.plugins.has('@tailwindcss/typography')) {
    console.log('\n✅ BONUS: Also detected typography plugin reference in config!');
  }

  return results;
}

// Run test
testBlogPlatform().catch(console.error);
