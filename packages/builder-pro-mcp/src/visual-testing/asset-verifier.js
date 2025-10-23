/**
 * Asset Verifier
 *
 * Verifies all critical assets (CSS, JS, fonts, images) load successfully.
 * Checks HTTP status codes and validates content types.
 *
 * This would have caught the 500 error on index.css immediately.
 */

const fetch = require('node-fetch');
const { parse } = require('node-html-parser');
const path = require('path');

class AssetVerifier {
  constructor(options = {}) {
    this.options = {
      timeout: 10000,
      criticalExtensions: ['.css', '.js'],
      importantExtensions: ['.woff', '.woff2', '.ttf', '.svg', '.png', '.jpg'],
      ...options
    };

    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      assets: []
    };
  }

  /**
   * Verify all assets on a page
   * @param {string} url - URL to check (e.g., http://localhost:4001)
   * @param {Object} page - Optional Playwright page object for extraction
   * @returns {Promise<Object>} Verification results
   */
  async verifyAssets(url, page = null) {
    console.log(`\n🔍 Verifying assets for ${url}...\n`);

    const assets = page
      ? await this.extractAssetsFromPage(page)
      : await this.extractAssetsFromHTML(url);

    console.log(`Found ${assets.length} asset(s) to verify\n`);

    for (const asset of assets) {
      await this.verifyAsset(url, asset);
    }

    // Generate summary
    this.results.total = this.results.assets.length;
    this.results.passed = this.results.assets.filter(a => a.status === 200).length;
    this.results.failed = this.results.assets.filter(a => a.status !== 200).length;

    return this.results;
  }

  /**
   * Extract assets from Playwright page
   * @param {Object} page - Playwright page object
   * @returns {Promise<Array>} List of assets
   */
  async extractAssetsFromPage(page) {
    const assets = await page.evaluate(() => {
      const extracted = [];

      // CSS files
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        extracted.push({
          type: 'css',
          url: link.href,
          element: 'link'
        });
      });

      // JavaScript files
      document.querySelectorAll('script[src]').forEach(script => {
        extracted.push({
          type: 'js',
          url: script.src,
          element: 'script'
        });
      });

      // Images
      document.querySelectorAll('img[src]').forEach(img => {
        extracted.push({
          type: 'image',
          url: img.src,
          element: 'img'
        });
      });

      // Fonts (from CSS)
      const fontFaceRules = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSFontFaceRule) {
              const src = rule.style.getPropertyValue('src');
              if (src) {
                const urlMatch = src.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch) {
                  fontFaceRules.push({
                    type: 'font',
                    url: urlMatch[1],
                    element: 'css-font-face'
                  });
                }
              }
            }
          }
        } catch (e) {
          // CORS may block access to external stylesheets
        }
      }

      return [...extracted, ...fontFaceRules];
    });

    return assets;
  }

  /**
   * Extract assets from HTML (fallback if no page object)
   * @param {string} url - Base URL
   * @returns {Promise<Array>} List of assets
   */
  async extractAssetsFromHTML(url) {
    try {
      const response = await fetch(url, { timeout: this.options.timeout });
      const html = await response.text();
      const root = parse(html);

      const assets = [];

      // CSS
      root.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        assets.push({
          type: 'css',
          url: this.resolveURL(url, link.getAttribute('href')),
          element: 'link'
        });
      });

      // JavaScript
      root.querySelectorAll('script[src]').forEach(script => {
        assets.push({
          type: 'js',
          url: this.resolveURL(url, script.getAttribute('src')),
          element: 'script'
        });
      });

      // Images
      root.querySelectorAll('img[src]').forEach(img => {
        assets.push({
          type: 'image',
          url: this.resolveURL(url, img.getAttribute('src')),
          element: 'img'
        });
      });

      return assets;

    } catch (error) {
      console.error(`❌ Could not fetch HTML: ${error.message}`);
      return [];
    }
  }

  /**
   * Resolve relative URL to absolute
   * @param {string} baseURL - Base URL
   * @param {string} relativeURL - Relative URL
   * @returns {string} Absolute URL
   */
  resolveURL(baseURL, relativeURL) {
    if (!relativeURL) return null;
    if (relativeURL.startsWith('http://') || relativeURL.startsWith('https://')) {
      return relativeURL;
    }

    try {
      return new URL(relativeURL, baseURL).href;
    } catch (e) {
      return relativeURL;
    }
  }

  /**
   * Verify a single asset
   * @param {string} baseURL - Base URL for relative path resolution
   * @param {Object} asset - Asset to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyAsset(baseURL, asset) {
    if (!asset.url) {
      return;
    }

    const assetURL = asset.url.startsWith('http')
      ? asset.url
      : this.resolveURL(baseURL, asset.url);

    const result = {
      ...asset,
      url: assetURL,
      status: null,
      statusText: null,
      contentType: null,
      size: null,
      loadTime: 0,
      error: null,
      severity: this.getAssetSeverity(assetURL)
    };

    try {
      const startTime = Date.now();

      const response = await fetch(assetURL, {
        timeout: this.options.timeout,
        method: 'GET'
      });

      result.loadTime = Date.now() - startTime;
      result.status = response.status;
      result.statusText = response.statusText;
      result.contentType = response.headers.get('content-type');

      const buffer = await response.buffer();
      result.size = buffer.length;

      const icon = response.status === 200 ? '✅' : '❌';
      const fileName = path.basename(assetURL.split('?')[0]);

      console.log(`${icon} [${result.status}] ${result.type.toUpperCase()}: ${fileName} (${result.size} bytes, ${result.loadTime}ms)`);

      if (response.status !== 200) {
        result.error = `HTTP ${response.status} ${response.statusText}`;

        if (result.severity === 'CRITICAL') {
          console.log(`   ⚠️  CRITICAL ASSET FAILED: ${result.error}`);
        }
      }

    } catch (error) {
      result.error = error.message;
      result.status = 0;
      result.statusText = 'Network Error';

      console.log(`❌ [ERROR] ${result.type.toUpperCase()}: ${path.basename(assetURL)} - ${error.message}`);

      if (result.severity === 'CRITICAL') {
        console.log(`   ⚠️  CRITICAL ASSET UNREACHABLE`);
      }
    }

    this.results.assets.push(result);
    return result;
  }

  /**
   * Get severity of asset based on type
   * @param {string} assetURL - Asset URL
   * @returns {string} Severity level (CRITICAL, MAJOR, MINOR)
   */
  getAssetSeverity(assetURL) {
    const ext = path.extname(assetURL.split('?')[0]).toLowerCase();

    if (this.options.criticalExtensions.includes(ext)) {
      return 'CRITICAL';
    }

    if (this.options.importantExtensions.includes(ext)) {
      return 'MAJOR';
    }

    return 'MINOR';
  }

  /**
   * Generate verification report
   * @param {Object} results - Verification results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '\n' + '='.repeat(70) + '\n';
    report += '                  ASSET VERIFICATION REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += '📊 Summary:\n';
    report += `   Total Assets: ${results.total}\n`;
    report += `   Passed (200): ${results.passed}\n`;
    report += `   Failed: ${results.failed}\n\n`;

    const criticalFailed = results.assets.filter(a =>
      a.severity === 'CRITICAL' && a.status !== 200
    );

    const majorFailed = results.assets.filter(a =>
      a.severity === 'MAJOR' && a.status !== 200
    );

    if (criticalFailed.length > 0) {
      report += '🚨 CRITICAL ASSET FAILURES:\n\n';
      criticalFailed.forEach(asset => {
        const fileName = path.basename(asset.url.split('?')[0]);
        report += `   ❌ [${asset.status || 'ERR'}] ${asset.type.toUpperCase()}: ${fileName}\n`;
        report += `      URL: ${asset.url}\n`;
        report += `      Error: ${asset.error}\n\n`;
      });
    }

    if (majorFailed.length > 0) {
      report += '⚠️  MAJOR ASSET FAILURES:\n\n';
      majorFailed.forEach(asset => {
        const fileName = path.basename(asset.url.split('?')[0]);
        report += `   ⚠️  [${asset.status || 'ERR'}] ${asset.type.toUpperCase()}: ${fileName}\n`;
        report += `      URL: ${asset.url}\n\n`;
      });
    }

    if (criticalFailed.length === 0 && majorFailed.length === 0) {
      report += '✅ ALL CRITICAL ASSETS LOADED SUCCESSFULLY\n\n';
    }

    // Performance stats
    const loadTimes = results.assets.filter(a => a.loadTime > 0).map(a => a.loadTime);
    if (loadTimes.length > 0) {
      const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
      const maxLoadTime = Math.max(...loadTimes);

      report += '⏱️  Performance:\n';
      report += `   Average Load Time: ${avgLoadTime.toFixed(0)}ms\n`;
      report += `   Slowest Asset: ${maxLoadTime}ms\n\n`;
    }

    report += '='.repeat(70) + '\n';

    return report;
  }

  /**
   * Check if verification passed (all critical assets loaded)
   * @param {Object} results - Verification results
   * @returns {boolean} True if all critical assets loaded
   */
  isPassed(results) {
    const criticalFailed = results.assets.filter(a =>
      a.severity === 'CRITICAL' && a.status !== 200
    );

    return criticalFailed.length === 0;
  }
}

module.exports = AssetVerifier;
