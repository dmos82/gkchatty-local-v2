#!/usr/bin/env node

/**
 * Test CSS Utility Detector against the blog platform
 * This proves it would have caught the missing @tailwindcss/typography bug
 */

const CSSUtilityDetector = require('./src/dependency-detection/css-utility-detector');
const { glob } = require('glob');
const path = require('path');

async function testBlogPlatform() {
  console.log('\n🧪 Testing CSS Utility Detector on Blog Platform\n');
  console.log('This test proves we would have caught the missing @tailwindcss/typography bug\n');

  const blogPath = '/tmp/builder-pro-validation/week1-blog/frontend';

  // Find all CSS files
  const cssFiles = await glob('**/*.css', {
    cwd: blogPath,
    ignore: ['node_modules/**', 'dist/**'],
    absolute: true
  });

  console.log(`Found ${cssFiles.length} CSS file(s):\n`);
  cssFiles.forEach(f => console.log(`  - ${path.relative(blogPath, f)}`));
  console.log('');

  // Run detector
  const detector = new CSSUtilityDetector();
  const results = await detector.detectTailwindUtilities(cssFiles);

  // Generate and print report
  const report = detector.generateReport(results);
  console.log(report);

  // Validation
  console.log('\n=== VALIDATION ===\n');

  if (results.plugins.has('@tailwindcss/typography')) {
    console.log('✅ SUCCESS: Detector found missing @tailwindcss/typography plugin!');
    console.log('✅ This bug would have been caught BEFORE deployment\n');

    const typographyMeta = results.plugins.get('@tailwindcss/typography');
    console.log('Details:');
    console.log(`  - Files using prose classes: ${typographyMeta.usage.join(', ')}`);
    console.log(`  - Classes detected: ${typographyMeta.classes.join(', ')}`);
  } else {
    console.log('❌ FAILURE: Did not detect missing typography plugin');
  }

  return results;
}

// Run test
testBlogPlatform().catch(console.error);
