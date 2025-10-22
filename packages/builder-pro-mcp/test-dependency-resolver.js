#!/usr/bin/env node

/**
 * Test Dependency Resolver - Complete Integration Test
 *
 * This simulates the blog platform bug:
 * 1. Code generated with prose classes
 * 2. Typography plugin NOT in package.json
 * 3. Resolver detects and auto-fixes
 */

const DependencyResolver = require('./src/dependency-detection/dependency-resolver');
const fs = require('fs').promises;
const path = require('path');

async function createTestProject() {
  const testPath = '/tmp/dep-resolver-test';

  // Create test project structure
  await fs.mkdir(testPath, { recursive: true });
  await fs.mkdir(path.join(testPath, 'src'), { recursive: true });

  // Create CSS file with prose classes (like blog platform had)
  const cssContent = `
@tailwind base;
@tailwind components;
@tailwind utilities;

.markdown {
  @apply prose prose-slate max-w-none;
}

.markdown h1 {
  @apply text-3xl font-bold mt-6 mb-4;
}
`;

  await fs.writeFile(path.join(testPath, 'src/index.css'), cssContent);

  // Create tailwind.config.js with typography import (but NOT in package.json!)
  const tailwindConfig = `
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  plugins: [
    typography,
  ],
};
`;

  await fs.writeFile(path.join(testPath, 'tailwind.config.js'), tailwindConfig);

  // Create package.json WITHOUT typography plugin (simulating the bug)
  const packageJson = {
    name: 'test-blog',
    version: '1.0.0',
    type: 'module',
    dependencies: {
      'react': '^18.0.0'
    },
    devDependencies: {
      'tailwindcss': '^3.4.1',
      'postcss': '^8.4.35',
      'autoprefixer': '^10.4.20',
      'vite': '^5.0.0'
      // NOTE: @tailwindcss/typography is MISSING - this is the bug!
    }
  };

  await fs.writeFile(
    path.join(testPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  return testPath;
}

async function testDependencyResolver() {
  console.log('🧪 Dependency Resolver Integration Test\n');
  console.log('='.repeat(70));
  console.log('SIMULATING BUILDER PRO BUG:');
  console.log('- Generated code uses @apply prose');
  console.log('- tailwind.config.js imports typography plugin');
  console.log('- package.json MISSING @tailwindcss/typography');
  console.log('- Result: Blank page (CSS compilation fails)');
  console.log('='.repeat(70));
  console.log('');

  // Create test project
  const testPath = await createTestProject();
  console.log(`✅ Created test project at: ${testPath}\n`);

  // Run resolver
  const resolver = new DependencyResolver();
  const scanResults = await resolver.scanProject(testPath);

  // Generate report
  const report = resolver.generateReport(scanResults);
  console.log(report);

  // Validate
  console.log('='.repeat(70));
  console.log('                      VALIDATION');
  console.log('='.repeat(70));
  console.log('');

  if (scanResults.missing.length > 0) {
    const hasTypography = scanResults.missing.some(
      dep => dep.name === '@tailwindcss/typography'
    );

    if (hasTypography) {
      console.log('✅ SUCCESS: Resolver detected missing typography plugin!');
      console.log('✅ This is EXACTLY the bug that broke the blog platform\n');

      // Test auto-fix
      console.log('📝 Testing auto-fix functionality...\n');
      const fixResult = await resolver.autoAddMissing(scanResults.missing, testPath);

      if (fixResult.success) {
        console.log('✅ Auto-fix successful!');
        console.log(`✅ Updated: ${fixResult.packageJsonPath}\n`);

        // Verify the fix
        const updatedPackageJson = JSON.parse(
          await fs.readFile(path.join(testPath, 'package.json'), 'utf-8')
        );

        if (updatedPackageJson.devDependencies['@tailwindcss/typography']) {
          console.log('✅ VERIFIED: Typography plugin added to package.json');
          console.log(`   Version: ${updatedPackageJson.devDependencies['@tailwindcss/typography']}\n`);

          console.log('='.repeat(70));
          console.log('                   TEST RESULT: PASS ✅');
          console.log('='.repeat(70));
          console.log('');
          console.log('🎉 Dependency Resolver would have PREVENTED the blog bug!');
          console.log('');
          console.log('What would have happened:');
          console.log('  1. Builder Pro generates code with prose classes');
          console.log('  2. Dependency Resolver scans project');
          console.log('  3. Detects missing @tailwindcss/typography');
          console.log('  4. Auto-adds to package.json');
          console.log('  5. User runs npm install');
          console.log('  6. Frontend works on first try! ✅');
          console.log('');

        } else {
          console.log('❌ FAILED: Typography plugin not found in updated package.json');
        }

      } else {
        console.log(`❌ Auto-fix failed: ${fixResult.error}`);
      }

    } else {
      console.log('❌ FAILED: Did not detect typography plugin');
    }

  } else {
    console.log('❌ FAILED: No missing dependencies detected');
  }

  // Cleanup
  console.log(`\n🧹 Cleaning up test project: ${testPath}`);
  await fs.rm(testPath, { recursive: true, force: true });
}

// Run test
testDependencyResolver().catch(console.error);
