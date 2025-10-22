/**
 * Visual Error Detector
 *
 * Analyzes screenshots and errors to detect visual failures.
 * Categorizes issues by severity and determines if execution should STOP.
 *
 * This would have caught the blog platform's blank page immediately.
 */

const fs = require('fs').promises;
const { PNG } = require('pngjs');

class VisualErrorDetector {
  constructor(options = {}) {
    this.options = {
      blankPageThreshold: 0.95, // 95% white/transparent = blank page
      minContentPixels: 1000,   // Minimum pixels of content to not be blank
      ...options
    };

    // Known error patterns from browser console
    this.criticalErrorPatterns = [
      // Vite/build errors
      /Failed to load resource.*500/i,
      /Internal Server Error/i,
      /\[vite\].*error/i,

      // CSS compilation errors
      /\[postcss\]/i,
      /CSS.*compilation.*failed/i,
      /Tailwind.*error/i,

      // JavaScript errors
      /Uncaught.*Error/i,
      /Cannot read.*undefined/i,
      /is not defined/i,

      // Module errors
      /Cannot find module/i,
      /Failed to resolve/i,
      /Module not found/i
    ];

    this.majorErrorPatterns = [
      /404.*Not Found/i,
      /CORS.*error/i,
      /Network.*error/i,
      /Refused to connect/i
    ];
  }

  /**
   * Analyze smoke test results for visual errors
   * @param {Object} smokeTestResults - Results from VisualSmokeTest
   * @returns {Promise<Object>} Error analysis with severity
   */
  async analyzeResults(smokeTestResults) {
    console.log('\n🔬 Analyzing visual test results...\n');

    const analysis = {
      severity: 'PASS',
      errors: [],
      shouldStop: false,
      summary: {
        critical: 0,
        major: 0,
        minor: 0
      }
    };

    // 1. Check for blank page
    if (smokeTestResults.screenshot) {
      const blankPageResult = await this.detectBlankPage(smokeTestResults.screenshot);

      if (blankPageResult.isBlank) {
        const error = {
          severity: 'CRITICAL',
          type: 'blank_page',
          message: 'Frontend displays blank page - no content rendered',
          details: blankPageResult,
          action: 'STOP',
          suggestion: 'Check browser console for CSS/JS compilation errors'
        };

        analysis.errors.push(error);
        analysis.severity = 'CRITICAL';
        analysis.shouldStop = true;
        analysis.summary.critical++;

        console.log('❌ CRITICAL: Blank page detected!');
        console.log(`   Whiteness: ${(blankPageResult.whiteness * 100).toFixed(1)}%`);
        console.log(`   Content pixels: ${blankPageResult.contentPixels}`);
      } else {
        console.log('✅ Page has visible content');
      }
    }

    // 2. Analyze console errors
    if (smokeTestResults.consoleErrors && smokeTestResults.consoleErrors.length > 0) {
      console.log(`\n⚠️  Analyzing ${smokeTestResults.consoleErrors.length} console error(s)...`);

      smokeTestResults.consoleErrors.forEach(consoleError => {
        const categorized = this.categorizeError(consoleError.text);

        analysis.errors.push({
          severity: categorized.severity,
          type: 'console_error',
          message: consoleError.text,
          location: consoleError.location,
          action: categorized.action,
          suggestion: categorized.suggestion
        });

        analysis.summary[categorized.severity.toLowerCase()]++;

        if (categorized.severity === 'CRITICAL') {
          analysis.severity = 'CRITICAL';
          analysis.shouldStop = true;
          console.log(`   ❌ CRITICAL: ${consoleError.text.substring(0, 80)}...`);
        } else if (categorized.severity === 'MAJOR' && analysis.severity !== 'CRITICAL') {
          analysis.severity = 'MAJOR';
          console.log(`   ⚠️  MAJOR: ${consoleError.text.substring(0, 80)}...`);
        }
      });
    }

    // 3. Analyze page errors (uncaught exceptions)
    if (smokeTestResults.pageErrors && smokeTestResults.pageErrors.length > 0) {
      console.log(`\n❌ Analyzing ${smokeTestResults.pageErrors.length} page error(s)...`);

      smokeTestResults.pageErrors.forEach(pageError => {
        const error = {
          severity: 'CRITICAL',
          type: 'uncaught_exception',
          message: pageError.message,
          stack: pageError.stack,
          action: 'STOP',
          suggestion: 'Fix JavaScript runtime error before continuing'
        };

        analysis.errors.push(error);
        analysis.severity = 'CRITICAL';
        analysis.shouldStop = true;
        analysis.summary.critical++;

        console.log(`   ❌ CRITICAL: ${pageError.message.substring(0, 80)}...`);
      });
    }

    // 4. Analyze asset failures
    if (smokeTestResults.assetFailures && smokeTestResults.assetFailures.length > 0) {
      console.log(`\n⚠️  Analyzing ${smokeTestResults.assetFailures.length} asset failure(s)...`);

      smokeTestResults.assetFailures.forEach(asset => {
        const isCritical = asset.url.endsWith('.css') || asset.url.endsWith('.js');
        const severity = isCritical ? 'CRITICAL' : 'MAJOR';

        const error = {
          severity,
          type: 'asset_load_failure',
          message: `${asset.status} ${asset.statusText}: ${asset.url}`,
          action: isCritical ? 'STOP' : 'WARN',
          suggestion: asset.status === 404
            ? 'Check if asset path is correct in HTML/config'
            : 'Check server logs for compilation errors'
        };

        analysis.errors.push(error);
        analysis.summary[severity.toLowerCase()]++;

        if (severity === 'CRITICAL') {
          analysis.severity = 'CRITICAL';
          analysis.shouldStop = true;
          console.log(`   ❌ CRITICAL: ${asset.status} ${asset.url.split('/').pop()}`);
        }
      });
    }

    // 5. Check HTTP response status
    if (smokeTestResults.responseStatus && smokeTestResults.responseStatus !== 200) {
      const error = {
        severity: 'CRITICAL',
        type: 'http_error',
        message: `HTTP ${smokeTestResults.responseStatus} response`,
        action: 'STOP',
        suggestion: 'Check server is running and accessible'
      };

      analysis.errors.push(error);
      analysis.severity = 'CRITICAL';
      analysis.shouldStop = true;
      analysis.summary.critical++;

      console.log(`   ❌ CRITICAL: HTTP ${smokeTestResults.responseStatus}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('                  VISUAL ERROR ANALYSIS');
    console.log('='.repeat(70));
    console.log(`\nOverall Severity: ${analysis.severity}`);
    console.log(`Should Stop: ${analysis.shouldStop ? 'YES ⛔' : 'NO ✅'}`);
    console.log(`\nErrors Found:`);
    console.log(`  Critical: ${analysis.summary.critical}`);
    console.log(`  Major: ${analysis.summary.major}`);
    console.log(`  Minor: ${analysis.summary.minor}`);
    console.log('');

    return analysis;
  }

  /**
   * Detect if screenshot shows a blank page
   * @param {string} screenshotPath - Path to screenshot
   * @returns {Promise<Object>} Blank page analysis
   */
  async detectBlankPage(screenshotPath) {
    try {
      const data = await fs.readFile(screenshotPath);
      const png = PNG.sync.read(data);

      let whitePixels = 0;
      let totalPixels = png.width * png.height;
      let contentPixels = 0;

      // Analyze pixels
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const idx = (png.width * y + x) << 2;

          const r = png.data[idx];
          const g = png.data[idx + 1];
          const b = png.data[idx + 2];
          const a = png.data[idx + 3];

          // Consider pixel "white" if RGB close to 255 or transparent
          const isWhite = (r > 250 && g > 250 && b > 250) || a < 10;

          if (isWhite) {
            whitePixels++;
          } else {
            contentPixels++;
          }
        }
      }

      const whiteness = whitePixels / totalPixels;
      const isBlank = whiteness > this.options.blankPageThreshold ||
                      contentPixels < this.options.minContentPixels;

      return {
        isBlank,
        whiteness,
        contentPixels,
        totalPixels,
        dimensions: { width: png.width, height: png.height }
      };

    } catch (error) {
      console.error('⚠️  Could not analyze screenshot:', error.message);
      return {
        isBlank: false,
        whiteness: 0,
        contentPixels: 0,
        totalPixels: 0,
        error: error.message
      };
    }
  }

  /**
   * Categorize error by severity based on patterns
   * @param {string} errorText - Error message text
   * @returns {Object} Categorization result
   */
  categorizeError(errorText) {
    // Check critical patterns
    for (const pattern of this.criticalErrorPatterns) {
      if (pattern.test(errorText)) {
        return {
          severity: 'CRITICAL',
          action: 'STOP',
          suggestion: this.getSuggestionForPattern(pattern, errorText)
        };
      }
    }

    // Check major patterns
    for (const pattern of this.majorErrorPatterns) {
      if (pattern.test(errorText)) {
        return {
          severity: 'MAJOR',
          action: 'WARN',
          suggestion: this.getSuggestionForPattern(pattern, errorText)
        };
      }
    }

    // Default to minor
    return {
      severity: 'MINOR',
      action: 'LOG',
      suggestion: 'Review error and fix if necessary'
    };
  }

  /**
   * Get fix suggestion based on error pattern
   * @param {RegExp} pattern - Matched pattern
   * @param {string} errorText - Full error text
   * @returns {string} Fix suggestion
   */
  getSuggestionForPattern(pattern, errorText) {
    const suggestions = {
      '/\\[postcss\\]/i': 'Check PostCSS/Tailwind config and ensure all plugins are installed',
      '/Failed to load resource.*500/i': 'Check server logs for compilation errors',
      '/Cannot find module/i': 'Run npm install to ensure all dependencies are installed',
      '/Module not found/i': 'Check import paths and ensure dependency is in package.json',
      '/404.*Not Found/i': 'Check asset path is correct',
      '/CORS.*error/i': 'Configure CORS headers on server'
    };

    for (const [patternStr, suggestion] of Object.entries(suggestions)) {
      if (pattern.toString() === patternStr) {
        return suggestion;
      }
    }

    // Try to extract package name for module errors
    if (pattern.test('module') || pattern.test('resolve')) {
      const match = errorText.match(/['"`]([^'"`]+)['"`]/);
      if (match) {
        return `Install missing dependency: npm install ${match[1]}`;
      }
    }

    return 'Review error message and fix underlying issue';
  }

  /**
   * Generate detailed error report
   * @param {Object} analysis - Error analysis results
   * @returns {string} Formatted report
   */
  generateReport(analysis) {
    let report = '\n' + '='.repeat(70) + '\n';
    report += '                  VISUAL ERROR REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += `Overall Status: ${analysis.severity}\n`;
    report += `Action: ${analysis.shouldStop ? '⛔ STOP EXECUTION' : '✅ Continue'}\n\n`;

    report += '📊 Error Summary:\n';
    report += `   Critical: ${analysis.summary.critical}\n`;
    report += `   Major: ${analysis.summary.major}\n`;
    report += `   Minor: ${analysis.summary.minor}\n\n`;

    if (analysis.errors.length > 0) {
      report += '❌ ERRORS DETECTED:\n\n';

      // Group by severity
      const critical = analysis.errors.filter(e => e.severity === 'CRITICAL');
      const major = analysis.errors.filter(e => e.severity === 'MAJOR');
      const minor = analysis.errors.filter(e => e.severity === 'MINOR');

      if (critical.length > 0) {
        report += '🚨 CRITICAL ERRORS (Must Fix Before Continuing):\n\n';
        critical.forEach((err, idx) => {
          report += `${idx + 1}. [${err.type.toUpperCase()}] ${err.message}\n`;
          report += `   Action: ${err.action}\n`;
          report += `   Fix: ${err.suggestion}\n\n`;
        });
      }

      if (major.length > 0) {
        report += '⚠️  MAJOR ERRORS (Should Fix Soon):\n\n';
        major.forEach((err, idx) => {
          report += `${idx + 1}. [${err.type.toUpperCase()}] ${err.message}\n`;
          report += `   Fix: ${err.suggestion}\n\n`;
        });
      }

      if (minor.length > 0) {
        report += 'ℹ️  MINOR ISSUES (Review When Convenient):\n\n';
        minor.forEach((err, idx) => {
          report += `${idx + 1}. [${err.type.toUpperCase()}] ${err.message}\n\n`;
        });
      }

    } else {
      report += '✅ NO ERRORS DETECTED\n\n';
      report += 'Visual smoke test passed successfully!\n\n';
    }

    report += '='.repeat(70) + '\n';

    return report;
  }
}

module.exports = VisualErrorDetector;
