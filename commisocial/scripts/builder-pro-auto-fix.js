#!/usr/bin/env node

/**
 * Builder Pro MCP Auto-Fix Integration
 *
 * This script integrates with Builder Pro MCP to automatically fix issues
 * found during smoke testing.
 *
 * Workflow:
 * 1. Receive error report from smoke tests
 * 2. Analyze errors and categorize by severity
 * 3. Call appropriate Builder Pro MCP tools
 * 4. Return fix status
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class BuilderProAutoFix {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.fixLog = [];
  }

  async analyzeErrors(errors) {
    console.log(`\n🔍 Analyzing ${errors.length} errors...`);

    const categorized = {
      serverErrors: [],
      clientErrors: [],
      routeErrors: [],
      typeErrors: [],
      unknown: []
    };

    errors.forEach(error => {
      const msg = error.errors[0]?.message || '';

      if (msg.includes('500') || msg.includes('Internal Server Error')) {
        categorized.serverErrors.push(error);
      } else if (msg.includes('Event handlers cannot be passed')) {
        categorized.clientErrors.push(error);
      } else if (msg.includes('404') || msg.includes('ERR_ABORTED')) {
        categorized.routeErrors.push(error);
      } else if (msg.includes('Type error') || msg.includes('TypeScript')) {
        categorized.typeErrors.push(error);
      } else {
        categorized.unknown.push(error);
      }
    });

    console.log(`\n   📊 Error Breakdown:`);
    console.log(`      Server Errors: ${categorized.serverErrors.length}`);
    console.log(`      Client Component Errors: ${categorized.clientErrors.length}`);
    console.log(`      Route Errors: ${categorized.routeErrors.length}`);
    console.log(`      Type Errors: ${categorized.typeErrors.length}`);
    console.log(`      Unknown: ${categorized.unknown.length}`);

    return categorized;
  }

  async fixClientComponentError(error) {
    console.log(`\n🔧 Fixing: ${error.step} - Client Component Error`);

    // Find the file that needs 'use client'
    const urlPath = error.url.replace(/^\//, '');
    const possiblePaths = [
      path.join(this.projectPath, 'app', urlPath, 'page.tsx'),
      path.join(this.projectPath, 'app', urlPath, 'page.ts')
    ];

    for (const filePath of possiblePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf8');

        if (!content.startsWith("'use client'") && !content.startsWith('"use client"')) {
          console.log(`   📝 Adding 'use client' to: ${filePath}`);

          const newContent = `'use client'\n\n${content}`;
          await fs.writeFile(filePath, newContent);

          this.fixLog.push({
            type: 'client-component',
            file: filePath,
            action: "Added 'use client' directive",
            success: true
          });

          return { success: true, file: filePath };
        }
      } catch (err) {
        // File not found, try next
      }
    }

    return { success: false, reason: 'File not found' };
  }

  async fixServerError(error) {
    console.log(`\n🔧 Fixing: ${error.step} - Server Error (500)`);

    // Use Builder Pro MCP to review and fix the file
    const urlPath = error.url.replace(/^\//, '');
    const filePath = path.join(this.projectPath, 'app', urlPath, 'page.tsx');

    console.log(`   📋 Reviewing file: ${filePath}`);

    // TODO: Call Builder Pro MCP review_file
    // For now, log the issue
    this.fixLog.push({
      type: 'server-error',
      file: filePath,
      action: 'Needs manual review',
      success: false,
      reason: 'Builder Pro MCP integration pending'
    });

    return { success: false, reason: 'Manual review required' };
  }

  async fixRouteError(error) {
    console.log(`\n🔧 Fixing: ${error.step} - Route Error (404/ERR_ABORTED)`);

    // Check if route file exists
    const urlPath = error.url.replace(/^\//, '');
    const filePath = path.join(this.projectPath, 'app', urlPath, 'page.tsx');

    try {
      await fs.access(filePath);
      console.log(`   ✅ Route file exists, error might be runtime issue`);
      return await this.fixServerError(error);
    } catch {
      console.log(`   ❌ Route file missing: ${filePath}`);

      this.fixLog.push({
        type: 'route-error',
        file: filePath,
        action: 'File missing - needs creation',
        success: false
      });

      return { success: false, reason: 'Route file missing' };
    }
  }

  async applyFixes(categorizedErrors) {
    console.log(`\n🔧 Applying Fixes...`);

    const results = {
      fixed: 0,
      failed: 0,
      skipped: 0
    };

    // Fix client component errors (easiest)
    for (const error of categorizedErrors.clientErrors) {
      const result = await this.fixClientComponentError(error);
      if (result.success) {
        results.fixed++;
      } else {
        results.failed++;
      }
    }

    // Fix server errors (requires review)
    for (const error of categorizedErrors.serverErrors) {
      const result = await this.fixServerError(error);
      if (result.success) {
        results.fixed++;
      } else {
        results.skipped++;
      }
    }

    // Fix route errors
    for (const error of categorizedErrors.routeErrors) {
      const result = await this.fixRouteError(error);
      if (result.success) {
        results.fixed++;
      } else {
        results.skipped++;
      }
    }

    return results;
  }

  async rebuild() {
    console.log(`\n🔨 Rebuilding project...`);

    try {
      // Clean .next folder
      const nextDir = path.join(this.projectPath, '.next');
      await execAsync(`rm -rf "${nextDir}"`);
      console.log(`   ✅ Cleaned .next folder`);

      // Note: Don't rebuild here, let the dev server hot-reload
      console.log(`   ✅ Dev server will hot-reload changes`);

      return { success: true };
    } catch (error) {
      console.error(`   ❌ Rebuild failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  printSummary() {
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 AUTO-FIX SUMMARY`);
    console.log(`${'='.repeat(60)}`);

    console.log(`\nFixes Applied:`);
    this.fixLog.forEach((fix, idx) => {
      const status = fix.success ? '✅' : '❌';
      console.log(`  ${idx + 1}. ${status} ${fix.type}: ${fix.action}`);
      console.log(`      File: ${fix.file}`);
      if (fix.reason) {
        console.log(`      Reason: ${fix.reason}`);
      }
    });

    const successful = this.fixLog.filter(f => f.success).length;
    const failed = this.fixLog.filter(f => !f.success).length;

    console.log(`\nResults:`);
    console.log(`  ✅ Fixed: ${successful}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📊 Success Rate: ${this.fixLog.length > 0 ? (successful / this.fixLog.length * 100).toFixed(1) : 0}%`);
    console.log(``);
  }
}

// CLI
async function main() {
  const errorReportPath = process.argv[2];

  if (!errorReportPath) {
    console.error('Usage: node builder-pro-auto-fix.js <error-report.json>');
    process.exit(1);
  }

  const errorReport = JSON.parse(await fs.readFile(errorReportPath, 'utf8'));
  const projectPath = path.resolve(__dirname, '..');

  const fixer = new BuilderProAutoFix(projectPath);
  const categorized = await fixer.analyzeErrors(errorReport.errors);
  const results = await fixer.applyFixes(categorized);

  console.log(`\n📊 Fix Results:`);
  console.log(`   Fixed: ${results.fixed}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Skipped: ${results.skipped}`);

  if (results.fixed > 0) {
    await fixer.rebuild();
  }

  fixer.printSummary();

  // Save fix log
  const fixLogPath = path.join(__dirname, '../docs/validation', `fix-log-${Date.now()}.json`);
  await fs.writeFile(fixLogPath, JSON.stringify(fixer.fixLog, null, 2));
  console.log(`Fix log saved: ${fixLogPath}\n`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { BuilderProAutoFix };
