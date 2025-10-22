/**
 * Config Plugin Detector
 *
 * Detects plugins referenced in config files (like tailwind.config.js)
 * and validates they're installed in package.json.
 *
 * Also detects module system mismatches (CJS vs ESM) that break plugin loading.
 * This would have caught the require() vs import bug in the blog platform.
 */

const fs = require('fs').promises;
const path = require('path');
const { parse: babelParse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

class ConfigPluginDetector {
  constructor() {
    // Common config files that may reference plugins
    this.configPatterns = [
      'tailwind.config.js',
      'tailwind.config.cjs',
      'tailwind.config.mjs',
      'postcss.config.js',
      'postcss.config.cjs',
      'vite.config.js',
      'vite.config.ts',
      'webpack.config.js',
      'next.config.js'
    ];
  }

  /**
   * Detect plugins referenced in config files
   * @param {string} projectPath - Root path of the project
   * @returns {Promise<Object>} Detection results
   */
  async detectConfigPlugins(projectPath) {
    const results = {
      plugins: new Map(),
      moduleSystemIssues: [],
      configFiles: [],
      summary: {
        filesScanned: 0,
        pluginsFound: 0,
        issuesFound: 0
      }
    };

    // Read package.json to determine project type
    const packageJsonPath = path.join(projectPath, 'package.json');
    let packageJson = {};
    let projectIsESM = false;

    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(packageJsonContent);
      projectIsESM = packageJson.type === 'module';
    } catch (error) {
      console.warn('Could not read package.json:', error.message);
    }

    // Scan for config files
    for (const pattern of this.configPatterns) {
      const configPath = path.join(projectPath, pattern);

      try {
        await fs.access(configPath);
        const analysis = await this.analyzeConfigFile(configPath, projectIsESM, packageJson);

        results.configFiles.push({
          file: pattern,
          ...analysis
        });

        // Merge plugins
        analysis.plugins.forEach((meta, pluginName) => {
          if (!results.plugins.has(pluginName)) {
            results.plugins.set(pluginName, {
              configs: [],
              installed: false,
              moduleSystemIssue: false
            });
          }

          results.plugins.get(pluginName).configs.push(pattern);
          results.plugins.get(pluginName).installed = meta.installed;

          if (meta.moduleSystemIssue) {
            results.plugins.get(pluginName).moduleSystemIssue = true;
          }
        });

        // Collect module system issues
        if (analysis.moduleSystemIssue) {
          results.moduleSystemIssues.push({
            file: pattern,
            ...analysis.moduleSystemIssue
          });
        }

        results.summary.filesScanned++;

      } catch (error) {
        // File doesn't exist, skip
      }
    }

    results.summary.pluginsFound = results.plugins.size;
    results.summary.issuesFound = results.moduleSystemIssues.length;

    return results;
  }

  /**
   * Analyze a single config file
   * @param {string} configPath - Path to config file
   * @param {boolean} projectIsESM - Whether project uses ES modules
   * @param {Object} packageJson - Parsed package.json
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeConfigFile(configPath, projectIsESM, packageJson) {
    const plugins = new Map();
    let moduleSystemIssue = null;

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const ext = path.extname(configPath);

      // Determine file module system
      let fileIsESM = projectIsESM;
      if (ext === '.mjs') fileIsESM = true;
      if (ext === '.cjs') fileIsESM = false;

      // Detect syntax used in file
      const hasCJSSyntax = this.detectCJSSyntax(content);
      const hasESMSyntax = this.detectESMSyntax(content);

      // Check for module system mismatch
      if (ext === '.js') {
        if (projectIsESM && hasCJSSyntax && !hasESMSyntax) {
          moduleSystemIssue = {
            severity: 'MAJOR',
            type: 'module_system_mismatch',
            message: `ESM project but ${path.basename(configPath)} uses CommonJS syntax`,
            projectType: 'ESM',
            fileType: 'CommonJS',
            suggestion: 'Convert require() to import and module.exports to export default'
          };
        } else if (!projectIsESM && hasESMSyntax && !hasCJSSyntax) {
          moduleSystemIssue = {
            severity: 'MAJOR',
            type: 'module_system_mismatch',
            message: `CommonJS project but ${path.basename(configPath)} uses ES module syntax`,
            projectType: 'CommonJS',
            fileType: 'ESM',
            suggestion: 'Convert import to require() and export to module.exports, or add "type": "module" to package.json'
          };
        }
      }

      // Parse AST to find plugin references
      try {
        const ast = babelParse(content, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx']
        });

        // Extract plugin references
        const extractedPlugins = this.extractPluginsFromAST(ast, content);

        extractedPlugins.forEach(pluginName => {
          const installed = this.isPluginInstalled(pluginName, packageJson);

          plugins.set(pluginName, {
            installed,
            moduleSystemIssue: moduleSystemIssue !== null
          });
        });

      } catch (parseError) {
        // AST parsing failed, try regex fallback
        const fallbackPlugins = this.extractPluginsFallback(content);

        fallbackPlugins.forEach(pluginName => {
          const installed = this.isPluginInstalled(pluginName, packageJson);

          plugins.set(pluginName, {
            installed,
            moduleSystemIssue: moduleSystemIssue !== null
          });
        });
      }

    } catch (error) {
      console.error(`Error analyzing ${configPath}:`, error.message);
    }

    return {
      plugins,
      moduleSystemIssue
    };
  }

  /**
   * Detect CommonJS syntax in content
   * @param {string} content - File content
   * @returns {boolean} True if CJS syntax found
   */
  detectCJSSyntax(content) {
    const cjsPatterns = [
      /require\s*\(/,
      /module\.exports\s*=/,
      /exports\.\w+\s*=/
    ];

    return cjsPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect ES module syntax in content
   * @param {string} content - File content
   * @returns {boolean} True if ESM syntax found
   */
  detectESMSyntax(content) {
    const esmPatterns = [
      /import\s+.*\s+from\s+['"`]/,
      /import\s*\(/,  // dynamic import
      /export\s+(default|const|function|class)/
    ];

    return esmPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Extract plugin names from AST
   * @param {Object} ast - Babel AST
   * @param {string} content - Original content for context
   * @returns {Set<string>} Plugin names
   */
  extractPluginsFromAST(ast, content) {
    const plugins = new Set();

    traverse(ast, {
      // Handle: import typography from '@tailwindcss/typography'
      ImportDeclaration(path) {
        const source = path.node.source.value;
        if (this.isPluginPackage(source)) {
          plugins.add(source);
        }
      },

      // Handle: require('@tailwindcss/typography')
      CallExpression(path) {
        if (path.node.callee.name === 'require') {
          const arg = path.node.arguments[0];
          if (arg && arg.type === 'StringLiteral') {
            const source = arg.value;
            if (this.isPluginPackage(source)) {
              plugins.add(source);
            }
          }
        }
      }
    });

    return plugins;
  }

  /**
   * Fallback regex-based plugin extraction
   * @param {string} content - File content
   * @returns {Set<string>} Plugin names
   */
  extractPluginsFallback(content) {
    const plugins = new Set();

    // Match require('@tailwindcss/typography')
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let match;

    while ((match = requireRegex.exec(content)) !== null) {
      const moduleName = match[1];
      if (this.isPluginPackage(moduleName)) {
        plugins.add(moduleName);
      }
    }

    // Match import from '@tailwindcss/typography'
    const importRegex = /import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g;

    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1];
      if (this.isPluginPackage(moduleName)) {
        plugins.add(moduleName);
      }
    }

    return plugins;
  }

  /**
   * Check if a module name looks like a plugin package
   * @param {string} name - Module name
   * @returns {boolean} True if it's a plugin
   */
  isPluginPackage(name) {
    // Common plugin patterns
    const pluginPatterns = [
      /^@tailwindcss\//,
      /^@postcss-plugins\//,
      /^postcss-/,
      /^autoprefixer$/,
      /^tailwindcss$/,
      /-plugin$/
    ];

    return pluginPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Check if a plugin is installed in package.json
   * @param {string} pluginName - Plugin package name
   * @param {Object} packageJson - Parsed package.json
   * @returns {boolean} True if installed
   */
  isPluginInstalled(pluginName, packageJson) {
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    return !!(dependencies[pluginName] || devDependencies[pluginName]);
  }

  /**
   * Generate report of detection results
   * @param {Object} results - Detection results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '\n=== Config Plugin Detection Report ===\n\n';

    report += `Config Files Scanned: ${results.summary.filesScanned}\n`;
    report += `Plugins Found: ${results.summary.pluginsFound}\n`;
    report += `Module System Issues: ${results.summary.issuesFound}\n\n`;

    // Report module system issues
    if (results.moduleSystemIssues.length > 0) {
      report += '⚠️  CRITICAL: Module System Mismatches Detected\n\n';

      results.moduleSystemIssues.forEach(issue => {
        report += `📁 ${issue.file}\n`;
        report += `   Severity: ${issue.severity}\n`;
        report += `   Problem: ${issue.message}\n`;
        report += `   Project Type: ${issue.projectType}\n`;
        report += `   File Uses: ${issue.fileType}\n`;
        report += `   Fix: ${issue.suggestion}\n\n`;
      });
    }

    // Report plugins
    if (results.plugins.size > 0) {
      report += '🔍 Plugins Referenced in Config Files:\n\n';

      results.plugins.forEach((meta, pluginName) => {
        const status = meta.installed ? '✅' : '❌';
        const moduleIssue = meta.moduleSystemIssue ? '⚠️ MODULE ISSUE' : '';

        report += `${status} ${pluginName} ${moduleIssue}\n`;
        report += `   Used in: ${meta.configs.join(', ')}\n`;
        report += `   Installed: ${meta.installed ? 'Yes' : 'NO - ADD TO PACKAGE.JSON'}\n\n`;
      });

      // List missing plugins
      const missing = Array.from(results.plugins.entries())
        .filter(([name, meta]) => !meta.installed);

      if (missing.length > 0) {
        report += '❌ Missing Plugins (need to install):\n\n';
        missing.forEach(([name, meta]) => {
          report += `  npm install -D ${name}\n`;
        });
        report += '\n';
      }
    }

    // Config files analyzed
    if (results.configFiles.length > 0) {
      report += '=== Config Files Analyzed ===\n\n';
      results.configFiles.forEach(file => {
        const pluginCount = file.plugins.size;
        const issue = file.moduleSystemIssue ? '⚠️ MODULE ISSUE' : '✅';
        report += `${issue} ${file.file}: ${pluginCount} plugin(s)\n`;
      });
    }

    return report;
  }
}

module.exports = ConfigPluginDetector;
