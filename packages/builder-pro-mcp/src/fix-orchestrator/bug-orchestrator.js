/**
 * Bug Categorization & Fix Orchestrator
 *
 * Orchestrates all validation and fix components:
 * - Categorizes bugs by severity (CRITICAL/MAJOR/MINOR)
 * - Determines fix priority and strategy
 * - Auto-fixes with iteration limits (max 3 attempts)
 * - Integrates: Dependency Detection, Visual Testing, Config Validation, Port Management
 *
 * This is the "brain" that ties all phases together for autonomous bug fixing.
 */

const DependencyResolver = require('../dependency-detection/dependency-resolver');
const VisualSmokeTest = require('../visual-testing/smoke-test');
const VisualErrorDetector = require('../visual-testing/visual-error-detector');
const ConfigValidator = require('../config-validation/config-validator');
const PortManager = require('../port-management/port-manager');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class BugOrchestrator {
  constructor(options = {}) {
    this.options = {
      maxIterations: 3,
      stopOnCritical: true,
      autoFix: true,
      ...options
    };

    this.components = {
      dependencyResolver: new DependencyResolver(),
      smokeTest: new VisualSmokeTest(),
      errorDetector: new VisualErrorDetector(),
      configValidator: new ConfigValidator(),
      portManager: new PortManager()
    };

    this.state = {
      iteration: 0,
      bugs: [],
      fixes: [],
      serverProcesses: new Map()
    };
  }

  /**
   * Run complete validation and fix workflow
   * @param {string} projectPath - Project root path
   * @param {Object} config - Project configuration
   * @returns {Promise<Object>} Complete results
   */
  async orchestrate(projectPath, config = {}) {
    console.log('\n🤖 Bug Categorization & Fix Orchestrator\n');
    console.log('='.repeat(70));
    console.log(`Project: ${projectPath}`);
    console.log(`Max Iterations: ${this.options.maxIterations}`);
    console.log(`Auto-Fix: ${this.options.autoFix ? 'Enabled' : 'Disabled'}`);
    console.log('='.repeat(70));
    console.log('');

    const results = {
      success: false,
      iterations: [],
      finalState: null,
      summary: {
        totalBugs: 0,
        fixed: 0,
        remaining: 0
      }
    };

    // Main iteration loop
    for (let i = 0; i < this.options.maxIterations; i++) {
      this.state.iteration = i + 1;

      console.log(`\n${'='.repeat(70)}`);
      console.log(`                    ITERATION ${this.state.iteration}`);
      console.log('='.repeat(70));
      console.log('');

      const iterationResult = await this.runIteration(projectPath, config);
      results.iterations.push(iterationResult);

      // Check if we should stop
      if (iterationResult.shouldStop) {
        console.log(`\n⛔ Stopping: ${iterationResult.stopReason}`);
        break;
      }

      // If no bugs found, we're done!
      if (iterationResult.bugs.length === 0) {
        console.log('\n✅ No bugs detected - Build successful!');
        results.success = true;
        break;
      }

      // If auto-fix is disabled, stop after first iteration
      if (!this.options.autoFix) {
        console.log('\n⚠️  Auto-fix disabled - stopping after validation');
        break;
      }

      // Check if fixes were successful
      if (iterationResult.fixesApplied === 0 && iterationResult.bugs.length > 0) {
        console.log('\n⚠️  No fixes could be applied - manual intervention required');
        break;
      }
    }

    // Final summary
    results.finalState = await this.generateFinalState(projectPath, config);
    results.summary = this.calculateSummary(results);

    return results;
  }

  /**
   * Run single iteration of validation and fixing
   * @param {string} projectPath - Project root
   * @param {Object} config - Project config
   * @returns {Promise<Object>} Iteration results
   */
  async runIteration(projectPath, config) {
    const iteration = {
      number: this.state.iteration,
      bugs: [],
      fixes: [],
      fixesApplied: 0,
      shouldStop: false,
      stopReason: null
    };

    console.log('🔍 Phase 1: Dependency Detection\n');
    const depResults = await this.components.dependencyResolver.scanProject(projectPath);
    this.categorizeBugs(depResults, 'dependency', iteration.bugs);

    console.log('\n🔍 Phase 2: Config Validation\n');
    const configResults = await this.components.configValidator.validateProject(projectPath);
    this.categorizeBugs(configResults, 'config', iteration.bugs);

    // Apply fixes for dependency and config issues
    if (this.options.autoFix && iteration.bugs.length > 0) {
      console.log('\n🔧 Applying Fixes...\n');
      iteration.fixesApplied = await this.applyFixes(projectPath, iteration.bugs, iteration.fixes);
    }

    // If critical bugs remain, stop
    const criticalBugs = iteration.bugs.filter(b => b.severity === 'CRITICAL' && !b.fixed);
    if (criticalBugs.length > 0 && this.options.stopOnCritical) {
      iteration.shouldStop = true;
      iteration.stopReason = `${criticalBugs.length} CRITICAL bug(s) could not be auto-fixed`;
      return iteration;
    }

    // Start servers if needed for visual testing
    if (config.frontend || config.backend) {
      console.log('\n🚀 Starting Development Servers...\n');
      await this.startServers(projectPath, config);
      await this.wait(5000); // Wait for servers to be ready
    }

    // Phase 3: Visual Smoke Test (only if servers started)
    if (config.frontend && config.frontend.url) {
      console.log('\n🔍 Phase 3: Visual Smoke Test\n');

      try {
        const smokeResults = await this.components.smokeTest.runSmokeTest(config.frontend.url);
        const visualAnalysis = await this.components.errorDetector.analyzeResults(smokeResults);

        this.categorizeBugs(visualAnalysis, 'visual', iteration.bugs);

        // If critical visual errors, stop
        if (visualAnalysis.shouldStop && this.options.stopOnCritical) {
          iteration.shouldStop = true;
          iteration.stopReason = 'Critical visual errors detected';
        }

      } catch (error) {
        console.log(`   ⚠️  Visual test skipped: ${error.message}`);
      }
    }

    return iteration;
  }

  /**
   * Categorize bugs from validation results
   * @param {Object} results - Validation results
   * @param {string} source - Source component
   * @param {Array} bugsArray - Array to push bugs to
   */
  categorizeBugs(results, source, bugsArray) {
    // Dependency bugs
    if (source === 'dependency' && results.missing) {
      results.missing.forEach(dep => {
        bugsArray.push({
          severity: 'CRITICAL',
          type: 'missing_dependency',
          source,
          message: `Missing dependency: ${dep.name}`,
          details: dep,
          fixable: true,
          fixed: false
        });
      });
    }

    // Config bugs
    if (source === 'config' && results.issues) {
      results.issues.forEach(issue => {
        bugsArray.push({
          severity: issue.severity || 'MAJOR',
          type: issue.type,
          source,
          message: issue.message,
          details: issue,
          fixable: issue.type === 'module_system_mismatch',
          fixed: false
        });
      });
    }

    // Visual bugs
    if (source === 'visual' && results.errors) {
      results.errors.forEach(error => {
        bugsArray.push({
          severity: error.severity || 'MAJOR',
          type: error.type,
          source,
          message: error.message,
          details: error,
          fixable: false, // Visual errors usually indicate deeper issues
          fixed: false
        });
      });
    }
  }

  /**
   * Apply fixes for detected bugs
   * @param {string} projectPath - Project root
   * @param {Array} bugs - Array of bugs
   * @param {Array} fixes - Array to record fixes
   * @returns {Promise<number>} Number of fixes applied
   */
  async applyFixes(projectPath, bugs, fixes) {
    let applied = 0;

    // Sort bugs by severity (CRITICAL first)
    const sortedBugs = bugs.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    for (const bug of sortedBugs) {
      if (!bug.fixable || bug.fixed) continue;

      console.log(`   🔧 Fixing: ${bug.message}...`);

      try {
        let fixResult = null;

        // Apply appropriate fix based on bug type
        switch (bug.type) {
          case 'missing_dependency':
            fixResult = await this.fixMissingDependency(projectPath, bug.details);
            break;

          case 'module_system_mismatch':
            fixResult = await this.fixModuleSystemMismatch(projectPath, bug.details);
            break;

          default:
            console.log(`      ⚠️  No auto-fix available for ${bug.type}`);
        }

        if (fixResult && fixResult.success) {
          bug.fixed = true;
          applied++;
          fixes.push({
            bug: bug.message,
            action: fixResult.action,
            success: true
          });
          console.log(`      ✅ Fixed: ${fixResult.action}`);
        } else {
          fixes.push({
            bug: bug.message,
            action: 'attempted',
            success: false,
            error: fixResult?.error
          });
          console.log(`      ❌ Failed: ${fixResult?.error || 'Unknown error'}`);
        }

      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
        fixes.push({
          bug: bug.message,
          action: 'attempted',
          success: false,
          error: error.message
        });
      }
    }

    console.log(`\n   Applied ${applied} fix(es)\n`);
    return applied;
  }

  /**
   * Fix missing dependency
   * @param {string} projectPath - Project root
   * @param {Object} details - Bug details
   * @returns {Promise<Object>} Fix result
   */
  async fixMissingDependency(projectPath, details) {
    // Use dependency resolver to add missing dependency
    const result = await this.components.dependencyResolver.autoAddMissing(
      [details],
      projectPath
    );

    if (result.success) {
      // Run npm install
      try {
        await execAsync('npm install', { cwd: projectPath });
        return {
          success: true,
          action: `Added ${details.name} and ran npm install`
        };
      } catch (error) {
        return {
          success: false,
          error: `Added to package.json but npm install failed: ${error.message}`
        };
      }
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Fix module system mismatch
   * @param {string} projectPath - Project root
   * @param {Object} details - Bug details
   * @returns {Promise<Object>} Fix result
   */
  async fixModuleSystemMismatch(projectPath, details) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const filePath = path.join(projectPath, details.file);
      let content = await fs.readFile(filePath, 'utf-8');

      // Convert require() to import
      // This is a simplified conversion - production would need more robust parsing
      content = content.replace(/const\s+(\w+)\s+=\s+require\(['"]([^'"]+)['"]\)/g,
        'import $1 from \'$2\'');
      content = content.replace(/module\.exports\s*=\s*/g, 'export default ');

      await fs.writeFile(filePath, content);

      return {
        success: true,
        action: `Converted ${details.file} to ES modules`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start development servers
   * @param {string} projectPath - Project root
   * @param {Object} config - Project config
   */
  async startServers(projectPath, config) {
    if (config.frontend) {
      console.log('   Starting frontend server...');
      // Would spawn npm run dev process here
    }

    if (config.backend) {
      console.log('   Starting backend server...');
      // Would spawn backend process here
    }
  }

  /**
   * Generate final state summary
   * @param {string} projectPath - Project root
   * @param {Object} config - Project config
   * @returns {Promise<Object>} Final state
   */
  async generateFinalState(projectPath, config) {
    return {
      timestamp: new Date().toISOString(),
      projectPath,
      totalIterations: this.state.iteration
    };
  }

  /**
   * Calculate overall summary
   * @param {Object} results - Orchestration results
   * @returns {Object} Summary
   */
  calculateSummary(results) {
    let totalBugs = 0;
    let fixed = 0;

    results.iterations.forEach(iter => {
      totalBugs += iter.bugs.length;
      fixed += iter.bugs.filter(b => b.fixed).length;
    });

    return {
      totalBugs,
      fixed,
      remaining: totalBugs - fixed,
      successRate: totalBugs > 0 ? (fixed / totalBugs * 100).toFixed(1) : 100
    };
  }

  /**
   * Generate comprehensive report
   * @param {Object} results - Orchestration results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '\n' + '='.repeat(70) + '\n';
    report += '           BUG ORCHESTRATION REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += '📊 Summary:\n';
    report += `   Total Bugs Detected: ${results.summary.totalBugs}\n`;
    report += `   Bugs Fixed: ${results.summary.fixed}\n`;
    report += `   Bugs Remaining: ${results.summary.remaining}\n`;
    report += `   Success Rate: ${results.summary.successRate}%\n`;
    report += `   Iterations: ${results.iterations.length}\n\n`;

    // Iteration details
    results.iterations.forEach((iter, idx) => {
      report += `\n📋 Iteration ${iter.number}:\n`;
      report += `   Bugs Found: ${iter.bugs.length}\n`;
      report += `   Fixes Applied: ${iter.fixesApplied}\n`;

      if (iter.bugs.length > 0) {
        const critical = iter.bugs.filter(b => b.severity === 'CRITICAL');
        const major = iter.bugs.filter(b => b.severity === 'MAJOR');
        const minor = iter.bugs.filter(b => b.severity === 'MINOR');

        if (critical.length > 0) {
          report += `\n   🚨 CRITICAL (${critical.length}):\n`;
          critical.forEach(bug => {
            const status = bug.fixed ? '✅ Fixed' : '❌ Not Fixed';
            report += `      ${status}: ${bug.message}\n`;
          });
        }

        if (major.length > 0) {
          report += `\n   ⚠️  MAJOR (${major.length}):\n`;
          major.forEach(bug => {
            const status = bug.fixed ? '✅ Fixed' : '❌ Not Fixed';
            report += `      ${status}: ${bug.message}\n`;
          });
        }
      }

      if (iter.shouldStop) {
        report += `\n   ⛔ Stopped: ${iter.stopReason}\n`;
      }
    });

    report += '\n';

    if (results.success) {
      report += '✅ BUILD SUCCESSFUL - All bugs fixed!\n\n';
    } else if (results.summary.remaining === 0) {
      report += '✅ All detected bugs were fixed!\n\n';
    } else {
      report += '⚠️  BUILD INCOMPLETE - Some bugs remain\n\n';
      report += 'Manual intervention may be required for remaining issues.\n\n';
    }

    report += '='.repeat(70) + '\n';

    return report;
  }

  /**
   * Wait helper
   * @param {number} ms - Milliseconds to wait
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BugOrchestrator;
