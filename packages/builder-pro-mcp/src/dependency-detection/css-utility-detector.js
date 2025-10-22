/**
 * CSS Utility Detector
 *
 * Detects Tailwind CSS utility classes (like @apply prose) in CSS files
 * and identifies required Tailwind plugins that need to be installed.
 *
 * This would have caught the missing @tailwindcss/typography bug in the blog platform.
 */

const postcss = require('postcss');
const fs = require('fs').promises;
const path = require('path');

class CSSUtilityDetector {
  constructor() {
    // Map of Tailwind utility patterns to required plugins
    this.pluginPatterns = new Map([
      // Typography plugin - CRITICAL (caught blog bug)
      ['prose', {
        plugin: '@tailwindcss/typography',
        pattern: /\bprose(-\w+)*\b/,
        examples: ['prose', 'prose-slate', 'prose-lg', 'prose-sm']
      }],

      // Forms plugin
      ['form-input', {
        plugin: '@tailwindcss/forms',
        pattern: /\bform-(input|select|checkbox|radio|textarea)\b/,
        examples: ['form-input', 'form-select', 'form-checkbox']
      }],

      // Aspect ratio plugin
      ['aspect-', {
        plugin: '@tailwindcss/aspect-ratio',
        pattern: /\baspect-(video|square|auto|\d+\/\d+)\b/,
        examples: ['aspect-video', 'aspect-square', 'aspect-16/9']
      }],

      // Line clamp plugin
      ['line-clamp-', {
        plugin: '@tailwindcss/line-clamp',
        pattern: /\bline-clamp-\d+\b/,
        examples: ['line-clamp-1', 'line-clamp-3', 'line-clamp-6']
      }],

      // Container queries plugin
      ['@container', {
        plugin: '@tailwindcss/container-queries',
        pattern: /@container/,
        examples: ['@container', '@container (min-width: 400px)']
      }]
    ]);
  }

  /**
   * Detect Tailwind utilities and required plugins in CSS files
   * @param {string[]} cssFiles - Array of CSS file paths
   * @returns {Promise<Object>} Detection results
   */
  async detectTailwindUtilities(cssFiles) {
    const utilities = new Set();
    const plugins = new Map();
    const detectionLog = [];

    for (const file of cssFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const fileResults = await this.analyzeCSSFile(content, file);

        // Merge utilities
        fileResults.utilities.forEach(u => utilities.add(u));

        // Merge plugins
        fileResults.plugins.forEach((meta, pluginName) => {
          if (!plugins.has(pluginName)) {
            plugins.set(pluginName, {
              usage: [],
              classes: new Set(),
              required: true
            });
          }

          plugins.get(pluginName).usage.push(file);
          meta.classes.forEach(c => plugins.get(pluginName).classes.add(c));
        });

        detectionLog.push({
          file,
          utilitiesFound: fileResults.utilities.size,
          pluginsDetected: Array.from(fileResults.plugins.keys())
        });

      } catch (error) {
        console.error(`Error analyzing CSS file ${file}:`, error.message);
        detectionLog.push({
          file,
          error: error.message
        });
      }
    }

    // Convert Sets to Arrays for serialization
    const pluginsResult = new Map();
    plugins.forEach((meta, name) => {
      pluginsResult.set(name, {
        usage: meta.usage,
        classes: Array.from(meta.classes),
        required: true
      });
    });

    return {
      utilities: Array.from(utilities),
      plugins: pluginsResult,
      detectionLog,
      summary: {
        filesScanned: cssFiles.length,
        utilitiesFound: utilities.size,
        pluginsRequired: plugins.size
      }
    };
  }

  /**
   * Analyze a single CSS file
   * @param {string} content - CSS file content
   * @param {string} filePath - File path for logging
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeCSSFile(content, filePath) {
    const utilities = new Set();
    const plugins = new Map();

    try {
      // Parse CSS using PostCSS
      const root = postcss.parse(content, { from: filePath });

      // Walk through all @apply rules
      root.walkAtRules('apply', rule => {
        const classes = rule.params.split(/\s+/).filter(Boolean);

        classes.forEach(className => {
          utilities.add(className);

          // Check if this class requires a plugin
          for (const [key, config] of this.pluginPatterns) {
            if (config.pattern.test(className)) {
              if (!plugins.has(config.plugin)) {
                plugins.set(config.plugin, {
                  classes: new Set(),
                  detectedIn: filePath
                });
              }
              plugins.get(config.plugin).classes.add(className);
            }
          }
        });
      });

      // Also check for direct utility usage in className attributes (future enhancement)
      // This would catch: <div className="prose prose-slate">
      // For now, focusing on @apply directives which are most common source of the bug

    } catch (error) {
      console.error(`PostCSS parsing error in ${filePath}:`, error.message);
      // Try fallback regex-based detection if PostCSS fails
      return this.fallbackRegexDetection(content, filePath);
    }

    return { utilities, plugins };
  }

  /**
   * Fallback regex-based detection if PostCSS fails
   * @param {string} content - CSS content
   * @param {string} filePath - File path
   * @returns {Object} Detection results
   */
  fallbackRegexDetection(content, filePath) {
    const utilities = new Set();
    const plugins = new Map();

    // Find @apply directives with regex
    const applyRegex = /@apply\s+([^;]+);/g;
    let match;

    while ((match = applyRegex.exec(content)) !== null) {
      const classes = match[1].split(/\s+/).filter(Boolean);

      classes.forEach(className => {
        utilities.add(className);

        // Check for plugin requirements
        for (const [key, config] of this.pluginPatterns) {
          if (config.pattern.test(className)) {
            if (!plugins.has(config.plugin)) {
              plugins.set(config.plugin, {
                classes: new Set(),
                detectedIn: filePath
              });
            }
            plugins.get(config.plugin).classes.add(className);
          }
        }
      });
    }

    return { utilities, plugins };
  }

  /**
   * Generate a report of detection results
   * @param {Object} results - Detection results from detectTailwindUtilities
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '\n=== CSS Utility Detection Report ===\n\n';

    report += `Files Scanned: ${results.summary.filesScanned}\n`;
    report += `Utilities Found: ${results.summary.utilitiesFound}\n`;
    report += `Plugins Required: ${results.summary.pluginsRequired}\n\n`;

    if (results.plugins.size > 0) {
      report += '🔍 Required Tailwind Plugins:\n\n';

      results.plugins.forEach((meta, pluginName) => {
        report += `📦 ${pluginName}\n`;
        report += `   Used in: ${meta.usage.join(', ')}\n`;
        report += `   Classes: ${meta.classes.join(', ')}\n\n`;
      });

      report += '⚠️  CRITICAL: Add these plugins to package.json and tailwind.config.js\n';
      report += '\nExample installation:\n';
      results.plugins.forEach((meta, pluginName) => {
        report += `  npm install -D ${pluginName}\n`;
      });

      report += '\nExample config (tailwind.config.js):\n';
      report += 'import typography from \'@tailwindcss/typography\';\n\n';
      report += 'export default {\n';
      report += '  plugins: [\n';
      results.plugins.forEach((meta, pluginName) => {
        const varName = pluginName.split('/').pop();
        report += `    ${varName},\n`;
      });
      report += '  ],\n';
      report += '};\n';
    } else {
      report += '✅ No additional Tailwind plugins required\n';
    }

    report += '\n=== Detection Log ===\n\n';
    results.detectionLog.forEach(log => {
      if (log.error) {
        report += `❌ ${log.file}: ERROR - ${log.error}\n`;
      } else {
        report += `✅ ${log.file}: ${log.utilitiesFound} utilities, plugins: ${log.pluginsDetected.join(', ') || 'none'}\n`;
      }
    });

    return report;
  }
}

module.exports = CSSUtilityDetector;
