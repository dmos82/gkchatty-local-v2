/**
 * Visual Smoke Test
 *
 * Captures screenshots and console/page errors to detect visual failures
 * BEFORE running expensive E2E tests.
 *
 * This would have caught the blog platform's blank page bug immediately.
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class VisualSmokeTest {
  constructor(options = {}) {
    this.options = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      screenshotDir: '/tmp/builder-pro-screenshots',
      ...options
    };
  }

  /**
   * Run complete visual smoke test
   * @param {string} url - URL to test (e.g., http://localhost:4001)
   * @returns {Promise<Object>} Test results
   */
  async runSmokeTest(url) {
    console.log(`\n🔍 Running Visual Smoke Test on ${url}\n`);

    const results = {
      url,
      timestamp: new Date().toISOString(),
      passed: false,
      screenshot: null,
      consoleErrors: [],
      pageErrors: [],
      responseStatus: null,
      loadTime: 0,
      visualErrors: [],
      assetFailures: []
    };

    let browser;
    let page;

    try {
      // Ensure screenshot directory exists
      await fs.mkdir(this.options.screenshotDir, { recursive: true });

      // Launch browser
      browser = await chromium.launch({
        headless: this.options.headless
      });

      const context = await browser.newContext({
        viewport: this.options.viewport
      });

      page = await context.newPage();

      // Capture console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          results.consoleErrors.push({
            text: msg.text(),
            location: msg.location()
          });
        }
      });

      // Capture page errors (uncaught exceptions)
      page.on('pageerror', error => {
        results.pageErrors.push({
          message: error.message,
          stack: error.stack
        });
      });

      // Capture failed asset loads
      page.on('response', response => {
        const status = response.status();
        const url = response.url();

        // Check for failed CSS/JS assets
        if ((url.endsWith('.css') || url.endsWith('.js') || url.endsWith('.tsx') || url.endsWith('.ts')) && status !== 200) {
          results.assetFailures.push({
            url,
            status,
            statusText: response.statusText()
          });
        }
      });

      // Navigate and measure load time
      const startTime = Date.now();

      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout
      });

      results.loadTime = Date.now() - startTime;
      results.responseStatus = response.status();

      console.log(`✅ Page loaded: HTTP ${response.status()} (${results.loadTime}ms)`);

      // Wait a bit for any delayed errors
      await page.waitForTimeout(2000);

      // Capture screenshot
      const screenshotFilename = `smoke-test-${Date.now()}.png`;
      results.screenshot = path.join(this.options.screenshotDir, screenshotFilename);

      await page.screenshot({
        path: results.screenshot,
        fullPage: true
      });

      console.log(`📸 Screenshot saved: ${results.screenshot}`);

      // Log errors found
      if (results.consoleErrors.length > 0) {
        console.log(`\n⚠️  Console Errors: ${results.consoleErrors.length}`);
        results.consoleErrors.slice(0, 3).forEach(err => {
          console.log(`   - ${err.text.substring(0, 100)}`);
        });
      }

      if (results.pageErrors.length > 0) {
        console.log(`\n❌ Page Errors: ${results.pageErrors.length}`);
        results.pageErrors.slice(0, 3).forEach(err => {
          console.log(`   - ${err.message.substring(0, 100)}`);
        });
      }

      if (results.assetFailures.length > 0) {
        console.log(`\n❌ Asset Failures: ${results.assetFailures.length}`);
        results.assetFailures.forEach(asset => {
          console.log(`   - ${asset.status} ${path.basename(asset.url)}`);
        });
      }

      // Mark as passed if no errors
      results.passed = results.consoleErrors.length === 0 &&
                       results.pageErrors.length === 0 &&
                       results.assetFailures.length === 0 &&
                       results.responseStatus === 200;

      if (results.passed) {
        console.log('\n✅ Visual smoke test PASSED - No errors detected\n');
      } else {
        console.log('\n⚠️  Visual smoke test found issues - See details above\n');
      }

    } catch (error) {
      console.error(`\n❌ Smoke test failed: ${error.message}\n`);

      results.passed = false;
      results.visualErrors.push({
        severity: 'CRITICAL',
        type: 'navigation_failure',
        message: error.message,
        action: 'STOP'
      });

    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }

    return results;
  }

  /**
   * Run smoke test on multiple pages
   * @param {string[]} urls - Array of URLs to test
   * @returns {Promise<Object>} Combined results
   */
  async runMultiPageSmokeTest(urls) {
    const results = {
      urls: urls.length,
      passed: 0,
      failed: 0,
      pages: []
    };

    for (const url of urls) {
      const pageResult = await this.runSmokeTest(url);
      results.pages.push(pageResult);

      if (pageResult.passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Generate HTML report from smoke test results
   * @param {Object} results - Smoke test results
   * @returns {string} HTML report
   */
  generateHTMLReport(results) {
    const statusIcon = results.passed ? '✅' : '❌';
    const statusText = results.passed ? 'PASSED' : 'FAILED';
    const statusColor = results.passed ? '#22c55e' : '#ef4444';

    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Visual Smoke Test Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 40px auto; padding: 0 20px; }
    .header { background: ${statusColor}; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .status { font-size: 32px; font-weight: bold; }
    .section { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .error { background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 8px 0; }
    .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin: 8px 0; }
    .screenshot { max-width: 100%; border: 2px solid #e5e7eb; border-radius: 4px; }
    code { background: #1f2937; color: #f9fafb; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="status">${statusIcon} Visual Smoke Test ${statusText}</div>
    <div>URL: ${results.url}</div>
    <div>Timestamp: ${results.timestamp}</div>
    <div>Load Time: ${results.loadTime}ms</div>
    <div>HTTP Status: ${results.responseStatus}</div>
  </div>

  ${results.screenshot ? `
  <div class="section">
    <h2>📸 Screenshot</h2>
    <img src="file://${results.screenshot}" class="screenshot" alt="Screenshot">
  </div>
  ` : ''}

  ${results.consoleErrors.length > 0 ? `
  <div class="section">
    <h2>⚠️  Console Errors (${results.consoleErrors.length})</h2>
    ${results.consoleErrors.map(err => `
      <div class="error">
        <div><strong>Error:</strong> <code>${this.escapeHtml(err.text)}</code></div>
        ${err.location ? `<div><small>Location: ${err.location.url}:${err.location.lineNumber}</small></div>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${results.pageErrors.length > 0 ? `
  <div class="section">
    <h2>❌ Page Errors (${results.pageErrors.length})</h2>
    ${results.pageErrors.map(err => `
      <div class="error">
        <div><strong>Message:</strong> ${this.escapeHtml(err.message)}</div>
        ${err.stack ? `<details><summary>Stack Trace</summary><pre>${this.escapeHtml(err.stack)}</pre></details>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${results.assetFailures.length > 0 ? `
  <div class="section">
    <h2>❌ Failed Assets (${results.assetFailures.length})</h2>
    ${results.assetFailures.map(asset => `
      <div class="error">
        <div><strong>${asset.status} ${asset.statusText}:</strong> ${this.escapeHtml(asset.url)}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${results.passed ? `
  <div class="section">
    <div class="success">
      <h2>✅ All Checks Passed</h2>
      <ul>
        <li>HTTP ${results.responseStatus} response</li>
        <li>No console errors</li>
        <li>No page errors</li>
        <li>All assets loaded successfully</li>
      </ul>
    </div>
  </div>
  ` : ''}

</body>
</html>
    `;

    return html;
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Save HTML report to file
   * @param {Object} results - Smoke test results
   * @param {string} outputPath - Path to save report
   * @returns {Promise<string>} Path to saved report
   */
  async saveHTMLReport(results, outputPath) {
    const html = this.generateHTMLReport(results);
    await fs.writeFile(outputPath, html);
    return outputPath;
  }
}

module.exports = VisualSmokeTest;
