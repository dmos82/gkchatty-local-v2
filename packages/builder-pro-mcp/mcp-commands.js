#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const MCP_SERVER = process.env.MCP_SERVER_URL || 'http://localhost:5002';

/**
 * Custom Commands for Claude Code Integration
 * These commands can be invoked from Claude Code to interact with the MCP server
 */

class MCPCommands {
  constructor() {
    this.server = MCP_SERVER;
  }

  /**
   * Review a single file
   */
  async reviewFile(filePath) {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const response = await axios.post(`${this.server}/review`, {
        code,
        filePath,
        contextQuery: `Review ${path.basename(filePath)} for code quality and best practices`
      });

      this.formatReview(response.data);
    } catch (error) {
      console.error('Review failed:', error.message);
    }
  }

  /**
   * Security scan a file
   */
  async scanFile(filePath) {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const response = await axios.post(`${this.server}/security-scan`, {
        code,
        filePath
      });

      this.formatSecurityScan(response.data);
    } catch (error) {
      console.error('Security scan failed:', error.message);
    }
  }

  /**
   * Validate architecture patterns
   */
  async validateArchitecture(filePath, projectType = 'node') {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const response = await axios.post(`${this.server}/validate-architecture`, {
        code,
        filePath,
        projectType
      });

      this.formatArchitectureValidation(response.data);
    } catch (error) {
      console.error('Architecture validation failed:', error.message);
    }
  }

  /**
   * Review entire directory
   */
  async reviewDirectory(dirPath, pattern = '*.js') {
    try {
      const files = await this.findFiles(dirPath, pattern);
      console.log(`\n📂 Reviewing ${files.length} files in ${dirPath}\n`);

      for (const file of files) {
        console.log(`\n──────────────────────────────────────`);
        console.log(`📄 ${file}`);
        console.log(`──────────────────────────────────────\n`);
        await this.reviewFile(file);
      }
    } catch (error) {
      console.error('Directory review failed:', error.message);
    }
  }

  /**
   * Format and display review results
   */
  formatReview(review) {
    console.log(`\n${review.summary}\n`);

    if (review.critical.length > 0) {
      console.log('🔴 CRITICAL ISSUES:');
      review.critical.forEach(issue => {
        console.log(`   • ${issue.message}${issue.line ? ` (line ${issue.line})` : ''}`);
      });
      console.log();
    }

    if (review.warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      review.warnings.forEach(warning => {
        console.log(`   • [${warning.rule}] ${warning.message} (line ${warning.line})`);
      });
      console.log();
    }

    if (review.suggestions.length > 0) {
      console.log('💡 SUGGESTIONS:');
      review.suggestions.forEach(suggestion => {
        console.log(`   • ${suggestion}`);
      });
      console.log();
    }

    if (review.ragInsights && review.ragInsights.length > 0) {
      console.log('📚 KNOWLEDGE BASE INSIGHTS:');
      review.ragInsights.forEach(insight => {
        console.log(`   • [${insight.source}] ${insight.insight}`);
      });
      console.log();
    }
  }

  /**
   * Format and display security scan results
   */
  formatSecurityScan(scan) {
    console.log(`\n${scan.summary}\n`);

    if (scan.vulnerabilities.length > 0) {
      console.log('🛡️ SECURITY VULNERABILITIES:');
      const grouped = {};
      scan.vulnerabilities.forEach(vuln => {
        if (!grouped[vuln.type]) grouped[vuln.type] = [];
        grouped[vuln.type].push(vuln);
      });

      Object.entries(grouped).forEach(([type, vulns]) => {
        console.log(`\n  ${type}:`);
        vulns.forEach(v => {
          console.log(`    • [${v.severity.toUpperCase()}] ${v.message} (line ${v.line})`);
        });
      });
      console.log();
    }

    if (scan.recommendations.length > 0) {
      console.log('✅ RECOMMENDATIONS:');
      scan.recommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });
      console.log();
    }

    console.log('🔍 OWASP COMPLIANCE:');
    Object.entries(scan.owaspCompliance).forEach(([category, compliant]) => {
      console.log(`   • ${category}: ${compliant ? '✅' : '❌'}`);
    });
  }

  /**
   * Format architecture validation results
   */
  formatArchitectureValidation(validation) {
    console.log(`\n${validation.compliant ? '✅ Architecture is compliant!' : '❌ Architecture violations found'}\n`);

    if (validation.violations.length > 0) {
      console.log('VIOLATIONS:');
      validation.violations.forEach(v => {
        console.log(`   • ${v.principle}: ${v.message}`);
      });
      console.log();
    }

    if (validation.recommendations) {
      console.log(`RECOMMENDATION: ${validation.recommendations}`);
    }
  }

  /**
   * Find files matching pattern
   */
  async findFiles(dir, pattern) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await this.findFiles(fullPath, pattern));
      } else if (entry.isFile() && this.matchPattern(entry.name, pattern)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Simple pattern matching
   */
  matchPattern(filename, pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return regex.test(filename);
  }
}

// CLI Interface
async function main() {
  const [,, command, ...args] = process.argv;
  const mcp = new MCPCommands();

  switch (command) {
    case 'review':
      if (!args[0]) {
        console.error('Usage: mcp-commands review <file-path>');
        process.exit(1);
      }
      await mcp.reviewFile(args[0]);
      break;

    case 'scan':
      if (!args[0]) {
        console.error('Usage: mcp-commands scan <file-path>');
        process.exit(1);
      }
      await mcp.scanFile(args[0]);
      break;

    case 'validate':
      if (!args[0]) {
        console.error('Usage: mcp-commands validate <file-path> [project-type]');
        process.exit(1);
      }
      await mcp.validateArchitecture(args[0], args[1]);
      break;

    case 'review-dir':
      if (!args[0]) {
        console.error('Usage: mcp-commands review-dir <directory> [pattern]');
        process.exit(1);
      }
      await mcp.reviewDirectory(args[0], args[1] || '*.js');
      break;

    case 'health':
      try {
        const response = await axios.get(`${MCP_SERVER}/health`);
        console.log('✅ MCP Server is healthy:', response.data);
      } catch (error) {
        console.error('❌ MCP Server is not responding');
      }
      break;

    default:
      console.log(`
╔══════════════════════════════════════════════════════╗
║          BUILDER-PRO MCP Commands                    ║
╚══════════════════════════════════════════════════════╝

Available commands:

  review <file>           - Review a single file for code quality
  scan <file>            - Security scan a file for vulnerabilities
  validate <file> [type] - Validate architecture patterns
  review-dir <dir> [pat] - Review all matching files in directory
  health                 - Check MCP server health

Examples:
  mcp-commands review src/index.js
  mcp-commands scan src/auth.js
  mcp-commands validate src/server.js node
  mcp-commands review-dir ./src "*.ts"
  mcp-commands health

Environment:
  MCP_SERVER_URL: ${MCP_SERVER}
      `);
  }
}

// Export for programmatic use
module.exports = MCPCommands;

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}