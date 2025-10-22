/**
 * Dependency Resolver
 *
 * Resolves detected dependencies against package.json and auto-adds missing ones.
 * This is the orchestrator that ties together CSS and Config detectors.
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const CSSUtilityDetector = require('./css-utility-detector');
const ConfigPluginDetector = require('./config-plugin-detector');

class DependencyResolver {
  constructor() {
    this.cssDetector = new CSSUtilityDetector();
    this.configDetector = new ConfigPluginDetector();
  }

  /**
   * Scan entire project for missing dependencies
   * @param {string} projectPath - Root path of the project
   * @returns {Promise<Object>} Complete dependency analysis
   */
  async scanProject(projectPath) {
    console.log('🔍 Scanning project for dependencies...\n');

    const results = {
      css: null,
      config: null,
      missing: [],
      satisfied: [],
      conflicts: [],
      autoFixable: [],
      summary: {
        totalDependencies: 0,
        missingCount: 0,
        satisfiedCount: 0,
        conflictCount: 0,
        autoFixableCount: 0
      }
    };

    // 1. Scan CSS files
    console.log('📝 Scanning CSS files for @apply directives...');
    const cssFiles = await glob('**/*.css', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true
    });

    if (cssFiles.length > 0) {
      results.css = await this.cssDetector.detectTailwindUtilities(cssFiles);
      console.log(`   Found ${results.css.plugins.size} Tailwind plugin(s)\n`);
    } else {
      console.log('   No CSS files found\n');
    }

    // 2. Scan config files
    console.log('⚙️  Scanning config files for plugin references...');
    results.config = await this.configDetector.detectConfigPlugins(projectPath);
    console.log(`   Found ${results.config.plugins.size} plugin(s) in configs\n`);

    // 3. Read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    let packageJson = {};

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (error) {
      console.error('❌ Could not read package.json:', error.message);
      return results;
    }

    // 4. Resolve dependencies
    console.log('🔎 Cross-referencing detected dependencies with package.json...\n');

    const allDeps = this.mergeDetectedDependencies(results.css, results.config);

    for (const [depName, meta] of allDeps) {
      const installed = this.isInstalled(depName, packageJson);

      if (!installed) {
        const missingDep = {
          name: depName,
          usage: meta.usage,
          detectedBy: meta.detectedBy,
          type: 'devDependencies', // Most CSS/build plugins are dev deps
          recommendedVersion: this.getRecommendedVersion(depName),
          autoFixable: true
        };

        results.missing.push(missingDep);
        results.autoFixable.push(missingDep);

        console.log(`❌ MISSING: ${depName}`);
        console.log(`   Used in: ${meta.usage.join(', ')}`);
        console.log(`   Detected by: ${meta.detectedBy}`);
        console.log(`   Will add: ${depName}@${missingDep.recommendedVersion}\n`);
      } else {
        const satisfiedDep = {
          name: depName,
          usage: meta.usage,
          detectedBy: meta.detectedBy
        };
        results.satisfied.push(satisfiedDep);
        console.log(`✅ Installed: ${depName}`);
      }
    }

    // Update summary
    results.summary.totalDependencies = allDeps.size;
    results.summary.missingCount = results.missing.length;
    results.summary.satisfiedCount = results.satisfied.length;
    results.summary.autoFixableCount = results.autoFixable.length;

    return results;
  }

  /**
   * Merge dependencies detected by CSS and Config scanners
   * @param {Object} cssResults - Results from CSS detector
   * @param {Object} configResults - Results from Config detector
   * @returns {Map} Merged dependencies
   */
  mergeDetectedDependencies(cssResults, configResults) {
    const merged = new Map();

    // Add CSS-detected plugins
    if (cssResults && cssResults.plugins) {
      cssResults.plugins.forEach((meta, name) => {
        merged.set(name, {
          usage: meta.usage || [],
          detectedBy: 'CSS @apply scanner'
        });
      });
    }

    // Add config-detected plugins
    if (configResults && configResults.plugins) {
      configResults.plugins.forEach((meta, name) => {
        if (merged.has(name)) {
          // Already detected by CSS scanner, add config usage
          merged.get(name).usage.push(...meta.configs.map(c => `config: ${c}`));
          merged.get(name).detectedBy += ' + Config scanner';
        } else {
          merged.set(name, {
            usage: meta.configs.map(c => `config: ${c}`),
            detectedBy: 'Config scanner'
          });
        }
      });
    }

    return merged;
  }

  /**
   * Check if a dependency is installed
   * @param {string} depName - Dependency name
   * @param {Object} packageJson - Parsed package.json
   * @returns {boolean} True if installed
   */
  isInstalled(depName, packageJson) {
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    return !!(deps[depName] || devDeps[depName]);
  }

  /**
   * Get recommended version for a dependency
   * @param {string} depName - Dependency name
   * @returns {string} Version string (e.g., "^0.5.0")
   */
  getRecommendedVersion(depName) {
    // Known version mappings for common packages
    const knownVersions = {
      '@tailwindcss/typography': '^0.5.19',
      '@tailwindcss/forms': '^0.5.9',
      '@tailwindcss/aspect-ratio': '^0.4.2',
      '@tailwindcss/line-clamp': '^0.4.4',
      '@tailwindcss/container-queries': '^0.1.1',
      'postcss': '^8.4.35',
      'autoprefixer': '^10.4.20',
      'tailwindcss': '^3.4.1'
    };

    return knownVersions[depName] || 'latest';
  }

  /**
   * Auto-add missing dependencies to package.json
   * @param {Array} missingDeps - Array of missing dependency objects
   * @param {string} projectPath - Root path of the project
   * @returns {Promise<Object>} Update results
   */
  async autoAddMissing(missingDeps, projectPath) {
    console.log('\n🔧 Auto-adding missing dependencies to package.json...\n');

    const packageJsonPath = path.join(projectPath, 'package.json');
    let packageJson;

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (error) {
      return {
        success: false,
        error: `Could not read package.json: ${error.message}`
      };
    }

    const added = [];

    for (const dep of missingDeps) {
      if (!packageJson[dep.type]) {
        packageJson[dep.type] = {};
      }

      packageJson[dep.type][dep.name] = dep.recommendedVersion;
      added.push(dep);

      console.log(`✅ Added ${dep.name}@${dep.recommendedVersion} to ${dep.type}`);
    }

    // Write updated package.json
    try {
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2) + '\n'
      );

      console.log(`\n📝 Updated ${packageJsonPath}`);
      console.log(`\n⚠️  Run 'npm install' to install the new dependencies\n`);

      return {
        success: true,
        added,
        packageJsonPath
      };

    } catch (error) {
      return {
        success: false,
        error: `Could not write package.json: ${error.message}`
      };
    }
  }

  /**
   * Generate comprehensive report
   * @param {Object} scanResults - Results from scanProject
   * @returns {string} Formatted report
   */
  generateReport(scanResults) {
    let report = '\n' + '='.repeat(70) + '\n';
    report += '                  DEPENDENCY SCAN REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += '📊 Summary:\n';
    report += `   Total Dependencies Detected: ${scanResults.summary.totalDependencies}\n`;
    report += `   Missing Dependencies: ${scanResults.summary.missingCount}\n`;
    report += `   Auto-Fixable: ${scanResults.summary.autoFixableCount}\n\n`;

    if (scanResults.missing.length > 0) {
      report += '❌ MISSING DEPENDENCIES:\n\n';

      scanResults.missing.forEach((dep, index) => {
        report += `${index + 1}. ${dep.name}@${dep.recommendedVersion}\n`;
        report += `   Used in: ${dep.usage.join(', ')}\n`;
        report += `   Detected by: ${dep.detectedBy}\n`;
        report += `   Type: ${dep.type}\n\n`;
      });

      report += '🔧 RECOMMENDED ACTIONS:\n\n';
      report += '1. Auto-add missing dependencies:\n';
      report += '   (This will update package.json)\n\n';

      report += '2. Then run:\n';
      report += '   npm install\n\n';

      report += '3. Verify all plugins are configured:\n';
      if (scanResults.css && scanResults.css.plugins.size > 0) {
        report += '   Update tailwind.config.js with:\n\n';
        scanResults.css.plugins.forEach((meta, pluginName) => {
          const varName = pluginName.split('/').pop();
          report += `   import ${varName} from '${pluginName}';\n`;
        });
        report += '\n   export default {\n';
        report += '     plugins: [\n';
        scanResults.css.plugins.forEach((meta, pluginName) => {
          const varName = pluginName.split('/').pop();
          report += `       ${varName},\n`;
        });
        report += '     ],\n';
        report += '   };\n\n';
      }

    } else {
      report += '✅ NO MISSING DEPENDENCIES FOUND\n\n';
      report += 'All detected dependencies are already installed in package.json.\n\n';
    }

    // Include module system issues if any
    if (scanResults.config && scanResults.config.moduleSystemIssues.length > 0) {
      report += '⚠️  MODULE SYSTEM ISSUES:\n\n';
      scanResults.config.moduleSystemIssues.forEach(issue => {
        report += `❌ ${issue.file}\n`;
        report += `   ${issue.message}\n`;
        report += `   Fix: ${issue.suggestion}\n\n`;
      });
    }

    report += '='.repeat(70) + '\n';

    return report;
  }
}

module.exports = DependencyResolver;
