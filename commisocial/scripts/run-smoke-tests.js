#!/usr/bin/env node

/**
 * Generic Smoke Test Runner with Auto-Fix Loop
 *
 * This script:
 * 1. Runs smoke tests from config
 * 2. Reports errors to Builder Pro MCP
 * 3. Builder Pro fixes issues
 * 4. Re-runs tests
 * 5. Repeats until all pass (max 3 iterations)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Load test configuration
const configPath = path.join(__dirname, '../tests/smoke-test-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const RUNNER_CONFIG = {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  maxIterations: 3,
  headless: process.env.CI === 'true',
  screenshotDir: path.join(__dirname, '../docs/screenshots/smoke-tests'),
  reportDir: path.join(__dirname, '../docs/validation'),
  autoFix: process.env.AUTO_FIX !== 'false', // Default true
};

// Ensure directories exist
[RUNNER_CONFIG.screenshotDir, RUNNER_CONFIG.reportDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class SmokeTestRunner {
  constructor(suiteName, suiteConfig) {
    this.suiteName = suiteName;
    this.suiteConfig = suiteConfig;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.results = {
      passed: [],
      failed: [],
      errors: []
    };
  }

  async setup() {
    console.log(`\n📋 Setting up test suite: ${this.suiteConfig.name}`);

    this.browser = await chromium.launch({
      headless: RUNNER_CONFIG.headless,
      slowMo: 100
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    this.page = await this.context.newPage();

    // Track console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.results.errors.push({
          type: 'console',
          message: msg.text(),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Track page errors
    this.page.on('pageerror', err => {
      this.results.errors.push({
        type: 'page',
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
    });
  }

  async runStep(step, stepIndex) {
    console.log(`\n  📌 Step ${stepIndex + 1}: ${step.name}`);

    const stepResult = {
      name: step.name,
      url: step.url,
      passed: true,
      errors: [],
      screenshot: null
    };

    try {
      // Navigate if URL provided
      if (step.url) {
        await this.page.goto(RUNNER_CONFIG.baseURL + step.url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
      }

      // Execute actions
      if (step.actions) {
        for (const action of step.actions) {
          await this.executeAction(action);
        }
      }

      // Take screenshot
      const screenshotPath = path.join(
        RUNNER_CONFIG.screenshotDir,
        `${this.suiteName}-${stepIndex + 1}-${step.name.replace(/\s+/g, '-')}.png`
      );
      await this.page.screenshot({ path: screenshotPath });
      stepResult.screenshot = screenshotPath;

      // Run assertions
      if (step.assertions) {
        for (const assertion of step.assertions) {
          await this.runAssertion(assertion, stepResult);
        }
      }

      console.log(`     ✅ PASS`);
      this.results.passed.push(stepResult);

    } catch (error) {
      console.log(`     ❌ FAIL: ${error.message}`);
      stepResult.passed = false;
      stepResult.errors.push({
        message: error.message,
        stack: error.stack
      });
      this.results.failed.push(stepResult);

      // Error screenshot
      const errorScreenshot = path.join(
        RUNNER_CONFIG.screenshotDir,
        `ERROR-${this.suiteName}-${stepIndex + 1}-${step.name.replace(/\s+/g, '-')}.png`
      );
      await this.page.screenshot({ path: errorScreenshot }).catch(() => {});
      stepResult.screenshot = errorScreenshot;
    }

    return stepResult;
  }

  async executeAction(action) {
    const value = this.interpolate(action.value);

    switch (action.type) {
      case 'fill':
        await this.page.fill(action.selector, value);
        break;
      case 'click':
        await this.page.click(action.selector);
        break;
      case 'waitForNavigation':
        await this.page.waitForURL(new RegExp(action.expect), { timeout: 10000 });
        break;
      case 'wait':
        await this.page.waitForTimeout(action.duration || 1000);
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async runAssertion(assertion, stepResult) {
    switch (assertion.type) {
      case 'url':
        const currentURL = this.page.url();
        if (assertion.equals && !currentURL.endsWith(assertion.equals)) {
          throw new Error(`URL mismatch: expected ${assertion.equals}, got ${currentURL}`);
        }
        if (assertion.contains && !new RegExp(assertion.contains).test(currentURL)) {
          throw new Error(`URL doesn't match pattern: ${assertion.contains}`);
        }
        break;

      case 'selector':
        if (assertion.exists) {
          const count = await this.page.locator(assertion.exists).count();
          if (count === 0) {
            throw new Error(`Selector not found: ${assertion.exists}`);
          }
        }
        if (assertion.count) {
          const count = await this.page.locator(assertion.count).count();
          if (assertion.min && count < assertion.min) {
            throw new Error(`Expected at least ${assertion.min} elements, found ${count}`);
          }
          if (assertion.max && count > assertion.max) {
            throw new Error(`Expected at most ${assertion.max} elements, found ${count}`);
          }
        }
        break;

      case 'noErrors':
        if (this.results.errors.length > 0) {
          const recentErrors = this.results.errors.slice(-3);
          throw new Error(`Console/page errors detected: ${recentErrors.map(e => e.message).join(', ')}`);
        }
        break;

      default:
        throw new Error(`Unknown assertion type: ${assertion.type}`);
    }
  }

  interpolate(value) {
    if (!value || typeof value !== 'string') return value;

    // Replace {{timestamp}}
    value = value.replace(/\{\{timestamp\}\}/g, Date.now());

    // Replace {{credentials.email}}
    if (this.suiteConfig.credentials) {
      value = value.replace(/\{\{credentials\.email\}\}/g, this.suiteConfig.credentials.email);
      value = value.replace(/\{\{credentials\.password\}\}/g, this.suiteConfig.credentials.password);
    }

    return value;
  }

  async run() {
    await this.setup();

    console.log(`   Running ${this.suiteConfig.steps.length} steps...\n`);

    for (let i = 0; i < this.suiteConfig.steps.length; i++) {
      await this.runStep(this.suiteConfig.steps[i], i);
    }

    await this.teardown();
    return this.results;
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  generateReport() {
    const total = this.results.passed.length + this.results.failed.length;
    const passRate = total > 0 ? (this.results.passed.length / total * 100).toFixed(1) : 0;

    return {
      suite: this.suiteName,
      name: this.suiteConfig.name,
      total,
      passed: this.results.passed.length,
      failed: this.results.failed.length,
      passRate: `${passRate}%`,
      errors: this.results.failed.map(step => ({
        step: step.name,
        url: step.url,
        errors: step.errors,
        screenshot: step.screenshot
      }))
    };
  }
}

// Main runner with auto-fix loop
async function runWithAutoFix(suiteName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 SMOKE TEST RUNNER - ${suiteName.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nConfiguration:`);
  console.log(`  Base URL: ${RUNNER_CONFIG.baseURL}`);
  console.log(`  Max Iterations: ${RUNNER_CONFIG.maxIterations}`);
  console.log(`  Auto-fix: ${RUNNER_CONFIG.autoFix}`);
  console.log(`  Headless: ${RUNNER_CONFIG.headless}`);

  const suiteConfig = config.testSuites[suiteName];
  if (!suiteConfig) {
    console.error(`\n❌ Test suite "${suiteName}" not found in config`);
    process.exit(1);
  }

  const allReports = [];
  let iteration = 1;
  let allPassed = false;

  while (iteration <= RUNNER_CONFIG.maxIterations && !allPassed) {
    console.log(`\n\n${'─'.repeat(60)}`);
    console.log(`📊 ITERATION ${iteration}/${RUNNER_CONFIG.maxIterations}`);
    console.log(`${'─'.repeat(60)}`);

    const runner = new SmokeTestRunner(suiteName, suiteConfig);
    await runner.run();
    const report = runner.generateReport();
    allReports.push({ iteration, ...report });

    // Print iteration summary
    console.log(`\n\n📋 Iteration ${iteration} Summary:`);
    console.log(`  ✅ Passed: ${report.passed}/${report.total}`);
    console.log(`  ❌ Failed: ${report.failed}/${report.total}`);
    console.log(`  📊 Pass Rate: ${report.passRate}`);

    if (report.failed === 0) {
      allPassed = true;
      console.log(`\n🎉 All tests passed!`);
      break;
    }

    // If auto-fix enabled and not last iteration
    if (RUNNER_CONFIG.autoFix && iteration < RUNNER_CONFIG.maxIterations) {
      console.log(`\n\n🔧 AUTO-FIX MODE: Analyzing failures...`);

      // TODO: Call Builder Pro MCP to fix issues
      console.log(`   Issues found:`);
      report.errors.forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error.step}: ${error.errors[0]?.message}`);
      });

      console.log(`\n   ⚠️  Manual fix required for now`);
      console.log(`   Future: Will call Builder Pro MCP auto-fix here`);

      // For now, break on first failure
      break;
    }

    iteration++;
  }

  // Final report
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`📊 FINAL REPORT`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nTest Suite: ${suiteConfig.name}`);
  console.log(`Iterations: ${iteration}/${RUNNER_CONFIG.maxIterations}`);
  console.log(`Final Status: ${allPassed ? '✅ ALL PASSED' : '❌ FAILURES REMAIN'}`);

  console.log(`\nIteration Breakdown:`);
  allReports.forEach(report => {
    console.log(`  Iteration ${report.iteration}: ${report.passed}/${report.total} passed (${report.passRate})`);
  });

  if (!allPassed && allReports.length > 0) {
    const lastReport = allReports[allReports.length - 1];
    console.log(`\nRemaining Failures:`);
    lastReport.errors.forEach((error, idx) => {
      console.log(`  ${idx + 1}. ${error.step}`);
      error.errors.forEach(err => {
        console.log(`     ${err.message}`);
      });
      console.log(`     Screenshot: ${error.screenshot}`);
    });
  }

  console.log(`\nScreenshots: ${RUNNER_CONFIG.screenshotDir}`);
  console.log(``);

  // Save report
  const reportPath = path.join(
    RUNNER_CONFIG.reportDir,
    `smoke-test-${suiteName}-${Date.now()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify({ allReports, config: RUNNER_CONFIG }, null, 2));
  console.log(`Report saved: ${reportPath}\n`);

  process.exit(allPassed ? 0 : 1);
}

// CLI
const suiteName = process.argv[2] || 'admin-full';
runWithAutoFix(suiteName);
