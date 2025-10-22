#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { ESLint } = require('eslint');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const { chromium } = require('playwright');
require('dotenv').config();

// Import Builder Pro v2.0 MCP Tools
const { tools: v2Tools, handlers: v2Handlers } = require('./src/mcp-tools');

const BUILDER_PRO_API = process.env.BUILDER_PRO_API || 'http://localhost:5001';

// Code Review Analyzer Class (preserved from Express version)
class CodeReviewAnalyzer {
  constructor() {
    this.eslint = new ESLint({
      overrideConfig: {
        env: {
          es2021: true,
          node: true,
          browser: true
        },
        parserOptions: {
          ecmaVersion: 2021,
          sourceType: 'module',
          ecmaFeatures: {
            jsx: true
          }
        },
        rules: {
          'no-unused-vars': 'warn',
          'no-console': 'warn',
          'prefer-const': 'warn',
          'no-var': 'error',
          'eqeqeq': 'warn',
          'curly': 'warn',
          'consistent-return': 'warn',
          'no-shadow': 'warn',
          'no-duplicate-imports': 'error',
          'no-unreachable': 'error',
          'no-debugger': 'error'
        }
      }
    });
  }

  async analyzeCode(code, filePath = 'unknown.js') {
    const issues = [];
    const suggestions = [];
    const securityIssues = [];

    // Run ESLint
    try {
      const results = await this.eslint.lintText(code, { filePath });
      if (results[0]) {
        results[0].messages.forEach(msg => {
          issues.push({
            type: msg.severity === 2 ? 'error' : 'warning',
            line: msg.line,
            column: msg.column,
            message: msg.message,
            rule: msg.ruleId
          });
        });
      }
    } catch (error) {
      console.error('ESLint error:', error);
    }

    // Security checks
    const securityPatterns = [
      { pattern: /eval\s*\(/, message: 'Avoid using eval() - security risk' },
      { pattern: /innerHTML\s*=/, message: 'Direct innerHTML assignment can lead to XSS' },
      { pattern: /document\.write\(/, message: 'Avoid document.write() - security and performance risk' },
      { pattern: /(password|secret|api_key|apikey|token)\s*=\s*["'][^"']+["']/i, message: 'Hardcoded credentials detected' },
      { pattern: /TODO|FIXME|HACK|XXX/, message: 'Found TODO/FIXME comment' },
      { pattern: /console\.(log|debug|info)/, message: 'Console statement should be removed in production' }
    ];

    securityPatterns.forEach(({ pattern, message }) => {
      const matches = code.match(new RegExp(pattern, 'g'));
      if (matches) {
        securityIssues.push({
          type: 'security',
          pattern: pattern.source,
          message,
          occurrences: matches.length
        });
      }
    });

    // Code quality suggestions
    if (code.length > 500 && !code.includes('function') && !code.includes('=>')) {
      suggestions.push('Consider breaking this code into smaller functions for better maintainability');
    }

    if ((code.match(/if\s*\(/g) || []).length > 5) {
      suggestions.push('High cyclomatic complexity detected. Consider refactoring to reduce nested conditions');
    }

    if (!code.includes('try') && code.includes('async')) {
      suggestions.push('Async code should include proper error handling with try-catch blocks');
    }

    return {
      issues,
      securityIssues,
      suggestions,
      stats: {
        lines: code.split('\n').length,
        characters: code.length,
        functions: (code.match(/function\s+\w+|=>\s*{/g) || []).length
      }
    };
  }

  async fetchRAGContext(query) {
    try {
      // This will query BUILDER-PRO's knowledge base via the public MCP endpoint
      const response = await axios.post(`${BUILDER_PRO_API}/api/search/mcp`, {
        query,
        knowledgeBaseTarget: 'system'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.data.searchResults || [];
    } catch (error) {
      console.error('RAG query failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  }

  async generateReview(analysis, ragContext) {
    const review = {
      summary: '',
      critical: [],
      warnings: [],
      suggestions: [],
      ragInsights: []
    };

    // Categorize issues
    analysis.issues.forEach(issue => {
      if (issue.type === 'error') {
        review.critical.push(issue);
      } else {
        review.warnings.push(issue);
      }
    });

    // Add security issues to critical
    analysis.securityIssues.forEach(issue => {
      review.critical.push({
        type: 'security',
        message: issue.message,
        occurrences: issue.occurrences
      });
    });

    // Add suggestions
    review.suggestions = analysis.suggestions;

    // Add RAG insights if available
    if (ragContext && ragContext.length > 0) {
      review.ragInsights = ragContext.map(doc => ({
        source: doc.fileName || doc.metadata?.source || 'Knowledge Base',
        relevance: doc.score || doc.relevance,
        insight: (doc.text || doc.content || '').substring(0, 200) + '...'
      }));
    }

    // Generate summary
    const criticalCount = review.critical.length;
    const warningCount = review.warnings.length;

    if (criticalCount === 0 && warningCount === 0) {
      review.summary = '✅ Code looks good! No critical issues found.';
    } else if (criticalCount > 0) {
      review.summary = `⚠️ Found ${criticalCount} critical issue(s) and ${warningCount} warning(s) that need attention.`;
    } else {
      review.summary = `📝 Found ${warningCount} warning(s) to consider.`;
    }

    return review;
  }
}

// Security Scanner Class
class SecurityScanner {
  async scan(code, filePath) {
    const vulnerabilities = [];

    const securityChecks = [
      // Injection vulnerabilities
      { pattern: /eval\s*\(/, severity: 'critical', type: 'Code Injection', message: 'eval() can execute arbitrary code' },
      { pattern: /new\s+Function\s*\(/, severity: 'critical', type: 'Code Injection', message: 'Function constructor can execute arbitrary code' },
      { pattern: /innerHTML\s*[+=]=/, severity: 'high', type: 'XSS', message: 'innerHTML can lead to XSS vulnerabilities' },
      { pattern: /document\.write/, severity: 'high', type: 'XSS', message: 'document.write can be exploited for XSS' },

      // SQL Injection risks
      { pattern: /query\s*\([`"'].*\${.*}.*[`"']\)/, severity: 'critical', type: 'SQL Injection', message: 'Potential SQL injection via template literals' },
      { pattern: /query\s*\(.*\+.*\)/, severity: 'high', type: 'SQL Injection', message: 'String concatenation in SQL queries' },

      // Credential exposure
      { pattern: /(password|pwd|passwd|secret|api[-_]?key|token|auth)\s*[:=]\s*["'][^"']+["']/i, severity: 'critical', type: 'Credential Exposure', message: 'Hardcoded credentials detected' },
      { pattern: /AWS_ACCESS_KEY|AWS_SECRET|GITHUB_TOKEN|API_KEY/i, severity: 'critical', type: 'Credential Exposure', message: 'Environment variable names suggest credentials' },

      // Path traversal
      { pattern: /\.\.\/|\.\.\\/, severity: 'medium', type: 'Path Traversal', message: 'Relative path traversal detected' },
      { pattern: /fs\.(readFile|writeFile|unlink).*\${/, severity: 'high', type: 'Path Traversal', message: 'Dynamic file operations could lead to path traversal' },

      // Insecure randomness
      { pattern: /Math\.random\(\).*(?:password|token|key|secret)/i, severity: 'high', type: 'Weak Cryptography', message: 'Math.random() is not cryptographically secure' },

      // Command injection
      { pattern: /exec\s*\(|spawn\s*\(/, severity: 'high', type: 'Command Injection', message: 'Shell command execution detected' },
      { pattern: /child_process/, severity: 'medium', type: 'Command Injection', message: 'Child process usage requires careful input validation' }
    ];

    // Run security checks
    securityChecks.forEach(check => {
      const regex = new RegExp(check.pattern, 'gm');
      let match;
      while ((match = regex.exec(code)) !== null) {
        const lineNumber = code.substring(0, match.index).split('\n').length;
        vulnerabilities.push({
          ...check,
          line: lineNumber,
          code: match[0].substring(0, 50)
        });
      }
    });

    // OWASP Top 10 compliance check
    const owaspCompliance = {
      injection: vulnerabilities.filter(v => v.type.includes('Injection')).length === 0,
      brokenAuth: vulnerabilities.filter(v => v.type === 'Credential Exposure').length === 0,
      xss: vulnerabilities.filter(v => v.type === 'XSS').length === 0,
      pathTraversal: vulnerabilities.filter(v => v.type === 'Path Traversal').length === 0
    };

    return {
      summary: vulnerabilities.length === 0 ? '✅ No security vulnerabilities detected' :
                `⚠️ Found ${vulnerabilities.length} potential security issue(s)`,
      vulnerabilities,
      owaspCompliance,
      recommendations: this.generateSecurityRecommendations(vulnerabilities),
      metadata: {
        timestamp: new Date().toISOString(),
        filePath: filePath || 'unknown',
        scanVersion: '1.0.0'
      }
    };
  }

  generateSecurityRecommendations(vulnerabilities) {
    const recommendations = [];
    const types = [...new Set(vulnerabilities.map(v => v.type))];

    const recommendationMap = {
      'Code Injection': 'Never use eval() or Function constructor with user input. Use safer alternatives like JSON.parse() for data.',
      'XSS': 'Use textContent instead of innerHTML, or sanitize HTML with a library like DOMPurify.',
      'SQL Injection': 'Always use parameterized queries or prepared statements. Never concatenate user input into SQL.',
      'Credential Exposure': 'Store credentials in environment variables and use a secrets management system.',
      'Path Traversal': 'Validate and sanitize file paths. Use path.join() and verify paths stay within intended directories.',
      'Weak Cryptography': 'Use crypto.randomBytes() or crypto.getRandomValues() for secure random values.',
      'Command Injection': 'Avoid shell commands when possible. If necessary, use parameterized commands and validate all inputs.'
    };

    types.forEach(type => {
      if (recommendationMap[type]) {
        recommendations.push(recommendationMap[type]);
      }
    });

    return recommendations;
  }
}

// Architecture Validator Class
class ArchitectureValidator {
  validate(code, filePath, projectType = 'node') {
    const violations = [];

    // Check for architectural patterns based on project type
    const patterns = {
      node: {
        'Separation of Concerns': {
          check: () => {
            const hasRouteLogic = /app\.(get|post|put|delete)/.test(code);
            const hasBusinessLogic = /async\s+function|class\s+\w+Service/.test(code);
            return !(hasRouteLogic && hasBusinessLogic && code.length > 200);
          },
          message: 'Routes and business logic should be in separate files'
        },
        'Error Handling': {
          check: () => /try\s*{\s*[\s\S]*?\s*}\s*catch/.test(code) || code.length < 100,
          message: 'Async operations should have proper error handling'
        },
        'Environment Variables': {
          check: () => !/process\.env\.\w+/.test(code) || /require\(['"]dotenv['"]\)/.test(code),
          message: 'Environment variables usage requires dotenv configuration'
        }
      },
      react: {
        'Component Structure': {
          check: () => {
            const hasMultipleComponents = (code.match(/function\s+[A-Z]\w+|const\s+[A-Z]\w+\s*=/g) || []).length <= 1;
            return hasMultipleComponents || code.length < 200;
          },
          message: 'Each file should contain a single React component'
        },
        'Hook Rules': {
          check: () => {
            const hasConditionalHook = /if\s*\([^)]*\)\s*{\s*use[A-Z]/;
            return !hasConditionalHook.test(code);
          },
          message: 'React Hooks must not be called conditionally'
        }
      },
      typescript: {
        'Type Safety': {
          check: () => !/any\s*[,;)}\]]/.test(code),
          message: 'Avoid using "any" type - use proper typing instead'
        },
        'Interface Definitions': {
          check: () => /interface\s+\w+|type\s+\w+\s*=/.test(code) || code.length < 100,
          message: 'Define interfaces for complex data structures'
        }
      }
    };

    const checksToRun = patterns[projectType] || patterns.node;

    Object.entries(checksToRun).forEach(([principle, { check, message }]) => {
      if (!check()) {
        violations.push({ principle, message });
      }
    });

    return {
      compliant: violations.length === 0,
      violations,
      recommendations: violations.length > 0 ?
        'Consider refactoring to align with architectural best practices' :
        'Architecture looks good!',
      metadata: {
        timestamp: new Date().toISOString(),
        filePath,
        projectType
      }
    };
  }
}

// Initialize the MCP server
async function main() {
  const analyzer = new CodeReviewAnalyzer();
  const securityScanner = new SecurityScanner();
  const architectureValidator = new ArchitectureValidator();

  const server = new Server(
    {
      name: 'builder-pro-mcp',
      version: '1.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Tool definitions
  const tools = [
    {
      name: 'review_code',
      description: 'Perform comprehensive code review with ESLint analysis, security checks, and optional RAG context',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to review'
          },
          filePath: {
            type: 'string',
            description: 'Path to the file being reviewed (optional)'
          },
          contextQuery: {
            type: 'string',
            description: 'Query for RAG context from knowledge base (optional)'
          }
        },
        required: ['code']
      }
    },
    {
      name: 'security_scan',
      description: 'Scan code for security vulnerabilities and OWASP compliance issues',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to scan for security issues'
          },
          filePath: {
            type: 'string',
            description: 'Path to the file being scanned (optional)'
          }
        },
        required: ['code']
      }
    },
    {
      name: 'validate_architecture',
      description: 'Validate code architecture against best practices for the specified project type',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to validate'
          },
          filePath: {
            type: 'string',
            description: 'Path to the file being validated (optional)'
          },
          projectType: {
            type: 'string',
            enum: ['node', 'react', 'typescript'],
            description: 'Type of project (default: node)'
          }
        },
        required: ['code']
      }
    },
    {
      name: 'read_file',
      description: 'Read a file from the file system and optionally review it',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute or relative path to the file to read'
          },
          autoReview: {
            type: 'boolean',
            description: 'Automatically run code review on the file (default: false)'
          }
        },
        required: ['filePath']
      }
    },
    {
      name: 'scan_directory',
      description: 'Scan a directory for files matching a pattern',
      inputSchema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory path to scan (default: current directory)'
          },
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files (e.g., "**/*.js", "src/**/*.ts")'
          },
          includeContent: {
            type: 'boolean',
            description: 'Include file contents in results (default: false)'
          }
        },
        required: ['pattern']
      }
    },
    {
      name: 'review_file',
      description: 'Read a file and perform comprehensive code review automatically',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to review'
          },
          contextQuery: {
            type: 'string',
            description: 'Optional RAG context query'
          }
        },
        required: ['filePath']
      }
    },
    {
      name: 'test_ui',
      description: 'Test a web application UI using Playwright - takes screenshots, clicks elements, verifies text',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to test (e.g., http://localhost:3000 or file:///path/to/index.html)'
          },
          actions: {
            type: 'array',
            description: 'Array of actions to perform: {type: "screenshot|click|type|wait", selector: "CSS selector", text: "text to type", timeout: 5000}',
            items: {
              type: 'object'
            }
          },
          screenshotPath: {
            type: 'string',
            description: 'Path to save screenshot (default: ui-test.png)'
          }
        },
        required: ['url']
      }
    },
    {
      name: 'auto_fix',
      description: 'Automatically fix code issues found by ESLint (format, add curly braces, fix imports, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to fix'
          },
          fixTypes: {
            type: 'array',
            description: 'Types of fixes to apply: "format", "curly", "semi", "quotes", "all" (default: all)',
            items: {
              type: 'string'
            }
          }
        },
        required: ['filePath']
      }
    },
    {
      name: 'write_file',
      description: 'Write content to a file (creates new file or overwrites existing)',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute or relative path to the file to write'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file'
          },
          createDirectories: {
            type: 'boolean',
            description: 'Create parent directories if they don\'t exist (default: true)'
          }
        },
        required: ['filePath', 'content']
      }
    },
    {
      name: 'edit_file',
      description: 'Edit an existing file by replacing text (exact string match)',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute or relative path to the file to edit'
          },
          oldString: {
            type: 'string',
            description: 'Text to replace (must match exactly)'
          },
          newString: {
            type: 'string',
            description: 'Replacement text'
          },
          replaceAll: {
            type: 'boolean',
            description: 'Replace all occurrences (default: false, only first match)'
          }
        },
        required: ['filePath', 'oldString', 'newString']
      }
    }
  ];

  // Merge v1 and v2 tools
  const allTools = [...tools, ...v2Tools];

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools
    };
  });

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'review_code': {
          const { code, filePath, contextQuery } = args;

          console.error(`[Review] Analyzing ${filePath || 'unnamed file'} (${code.length} chars)`);

          const analysis = await analyzer.analyzeCode(code, filePath);

          let ragContext = [];
          if (contextQuery) {
            console.error(`[Review] Fetching RAG context for: ${contextQuery}`);
            ragContext = await analyzer.fetchRAGContext(contextQuery);
          }

          const review = await analyzer.generateReview(analysis, ragContext);

          review.metadata = {
            timestamp: new Date().toISOString(),
            filePath: filePath || 'unknown',
            codeStats: analysis.stats,
            mcpVersion: '1.0.0'
          };

          console.error(`[Review] Completed - ${review.critical.length} critical, ${review.warnings.length} warnings`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(review, null, 2)
              }
            ]
          };
        }

        case 'security_scan': {
          const { code, filePath } = args;

          console.error(`[Security] Scanning ${filePath || 'unnamed file'}`);

          const scanResult = await securityScanner.scan(code, filePath);

          console.error(`[Security] Scan completed - ${scanResult.vulnerabilities.length} issues found`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(scanResult, null, 2)
              }
            ]
          };
        }

        case 'validate_architecture': {
          const { code, filePath, projectType = 'node' } = args;

          console.error(`[Architecture] Validating ${filePath || 'unnamed file'} as ${projectType} project`);

          const validationResult = architectureValidator.validate(code, filePath, projectType);

          console.error(`[Architecture] Validation completed - ${validationResult.violations.length} violations found`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(validationResult, null, 2)
              }
            ]
          };
        }

        case 'read_file': {
          const { filePath, autoReview = false } = args;

          console.error(`[Read File] Reading ${filePath}`);

          try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
            const content = await fs.readFile(fullPath, 'utf-8');

            console.error(`[Read File] Read ${content.length} characters from ${fullPath}`);

            const result = {
              filePath: fullPath,
              content,
              size: content.length,
              lines: content.split('\n').length
            };

            if (autoReview) {
              console.error(`[Read File] Auto-review enabled, analyzing...`);
              const analysis = await analyzer.analyzeCode(content, fullPath);
              const review = await analyzer.generateReview(analysis, []);
              result.review = review;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
          }
        }

        case 'scan_directory': {
          const { directory = process.cwd(), pattern, includeContent = false } = args;

          console.error(`[Scan Directory] Scanning ${directory} for pattern: ${pattern}`);

          try {
            const files = await glob(pattern, { cwd: directory, absolute: true });

            console.error(`[Scan Directory] Found ${files.length} files`);

            const results = await Promise.all(files.map(async (file) => {
              const stats = await fs.stat(file);
              const result = {
                path: file,
                relativePath: path.relative(directory, file),
                size: stats.size,
                modified: stats.mtime
              };

              if (includeContent) {
                try {
                  result.content = await fs.readFile(file, 'utf-8');
                } catch (err) {
                  result.contentError = err.message;
                }
              }

              return result;
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    directory,
                    pattern,
                    fileCount: results.length,
                    files: results
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new Error(`Failed to scan directory: ${error.message}`);
          }
        }

        case 'review_file': {
          const { filePath, contextQuery } = args;

          console.error(`[Review File] Reading and reviewing ${filePath}`);

          try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
            const code = await fs.readFile(fullPath, 'utf-8');

            console.error(`[Review File] Read ${code.length} characters, analyzing...`);

            const analysis = await analyzer.analyzeCode(code, fullPath);

            let ragContext = [];
            if (contextQuery) {
              console.error(`[Review File] Fetching RAG context for: ${contextQuery}`);
              ragContext = await analyzer.fetchRAGContext(contextQuery);
            }

            const review = await analyzer.generateReview(analysis, ragContext);

            review.metadata = {
              timestamp: new Date().toISOString(),
              filePath: fullPath,
              codeStats: analysis.stats,
              mcpVersion: '1.0.0'
            };

            console.error(`[Review File] Completed - ${review.critical.length} critical, ${review.warnings.length} warnings`);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(review, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new Error(`Failed to review file: ${error.message}`);
          }
        }

        case 'test_ui': {
          const { url, actions = [], screenshotPath = 'ui-test.png' } = args;

          console.error(`[UI Test] Testing ${url}`);

          let browser, page;
          try {
            browser = await chromium.launch({ headless: true });
            page = await browser.newPage();

            console.error(`[UI Test] Navigating to ${url}`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

            const results = [];

            // Execute actions
            for (const action of actions) {
              const { type, selector, text, timeout = 5000 } = action;

              switch (type) {
                case 'screenshot':
                  await page.screenshot({ path: screenshotPath, fullPage: true });
                  results.push({ action: 'screenshot', success: true, path: screenshotPath });
                  break;

                case 'click':
                  await page.click(selector, { timeout });
                  results.push({ action: 'click', selector, success: true });
                  break;

                case 'type':
                  await page.fill(selector, text, { timeout });
                  results.push({ action: 'type', selector, text, success: true });
                  break;

                case 'wait':
                  await page.waitForSelector(selector, { timeout });
                  results.push({ action: 'wait', selector, success: true });
                  break;

                case 'verify_text':
                  const content = await page.textContent(selector);
                  const matches = content && content.includes(text);
                  results.push({ action: 'verify_text', selector, expected: text, actual: content, success: matches });
                  break;

                default:
                  results.push({ action: type, success: false, error: 'Unknown action type' });
              }
            }

            // Always take a final screenshot
            await page.screenshot({ path: screenshotPath, fullPage: true });

            const pageTitle = await page.title();
            const pageUrl = page.url();

            await browser.close();

            console.error(`[UI Test] Completed - ${results.length} actions executed`);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    url: pageUrl,
                    title: pageTitle,
                    screenshot: screenshotPath,
                    actions: results,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            if (browser) await browser.close();
            throw new Error(`UI test failed: ${error.message}`);
          }
        }

        case 'auto_fix': {
          const { filePath, fixTypes = ['all'] } = args;

          console.error(`[Auto Fix] Fixing ${filePath}`);

          try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
            const code = await fs.readFile(fullPath, 'utf-8');

            // Run ESLint with --fix flag
            const eslintFix = new ESLint({ fix: true });
            const results = await eslintFix.lintText(code, { filePath: fullPath });

            if (results[0].output) {
              // ESLint made fixes
              await fs.writeFile(fullPath, results[0].output);

              const fixedIssues = results[0].fixableErrorCount + results[0].fixableWarningCount;

              console.error(`[Auto Fix] Fixed ${fixedIssues} issues in ${fullPath}`);

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      filePath: fullPath,
                      fixedIssues,
                      remainingErrors: results[0].errorCount,
                      remainingWarnings: results[0].warningCount,
                      timestamp: new Date().toISOString()
                    }, null, 2)
                  }
                ]
              };
            } else {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      filePath: fullPath,
                      fixedIssues: 0,
                      message: 'No auto-fixable issues found',
                      timestamp: new Date().toISOString()
                    }, null, 2)
                  }
                ]
              };
            }
          } catch (error) {
            throw new Error(`Failed to auto-fix file: ${error.message}`);
          }
        }

        case 'write_file': {
          const { filePath, content, createDirectories = true } = args;

          console.error(`[Write File] Writing to ${filePath}`);

          try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            // Create parent directories if needed
            if (createDirectories) {
              await fs.mkdir(path.dirname(fullPath), { recursive: true });
            }

            // Write the file
            await fs.writeFile(fullPath, content, 'utf-8');

            console.error(`[Write File] Successfully wrote ${content.length} bytes to ${fullPath}`);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    filePath: fullPath,
                    bytes: content.length,
                    lines: content.split('\n').length,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new Error(`Failed to write file: ${error.message}`);
          }
        }

        case 'edit_file': {
          const { filePath, oldString, newString, replaceAll = false } = args;

          console.error(`[Edit File] Editing ${filePath}`);

          try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            // Read current content
            const content = await fs.readFile(fullPath, 'utf-8');

            // Check if old string exists
            if (!content.includes(oldString)) {
              throw new Error(`String not found in file: "${oldString.substring(0, 50)}..."`);
            }

            // Perform replacement
            const newContent = replaceAll
              ? content.replaceAll(oldString, newString)
              : content.replace(oldString, newString);

            // Count changes
            const occurrences = replaceAll
              ? (content.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
              : 1;

            // Write back to file
            await fs.writeFile(fullPath, newContent, 'utf-8');

            console.error(`[Edit File] Replaced ${occurrences} occurrence(s) in ${fullPath}`);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    filePath: fullPath,
                    replacements: occurrences,
                    replaceAll,
                    bytesChanged: Math.abs(newContent.length - content.length),
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new Error(`Failed to edit file: ${error.message}`);
          }
        }

        // Builder Pro v2.0 Tools
        case 'detect_dependencies':
          return await v2Handlers.detect_dependencies(args);

        case 'run_visual_test':
          return await v2Handlers.run_visual_test(args);

        case 'validate_configs':
          return await v2Handlers.validate_configs(args);

        case 'manage_ports':
          return await v2Handlers.manage_ports(args);

        case 'orchestrate_build':
          return await v2Handlers.orchestrate_build(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[Error] Tool ${name} failed:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Tool execution failed: ${error.message}`,
              tool: name,
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ]
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`
╔══════════════════════════════════════════════════════╗
║           BUILDER-PRO MCP Server v2.0.0              ║
║                                                      ║
║  Status: MCP Protocol Ready                          ║
║  Transport: stdio                                    ║
║  API: ${BUILDER_PRO_API.padEnd(29)}║
║                                                      ║
║  Available Tools:                                    ║
║  - review_code              - Code review            ║
║  - security_scan            - Security analysis      ║
║  - validate_architecture    - Architecture check     ║
║  - read_file / scan_dir     - File operations        ║
║  - write_file / edit_file   - ✨ NEW: File writing   ║
║  - auto_fix / test_ui       - Automation             ║
╚══════════════════════════════════════════════════════╝
  `);
}

// Run the server
main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});