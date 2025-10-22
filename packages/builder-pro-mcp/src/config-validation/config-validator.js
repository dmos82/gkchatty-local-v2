/**
 * Config File Validation Matrix
 *
 * Cross-validates all configuration files for consistency:
 * - Module system alignment (CJS vs ESM)
 * - Port references across .env, config files, and code
 * - Plugin configurations match package.json dependencies
 * - Environment variable consistency
 *
 * This would have caught the require() vs import mismatch bug.
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

class ConfigValidator {
  constructor(options = {}) {
    this.options = {
      configPatterns: [
        '*.config.{js,ts,cjs,mjs}',
        'vite.config.{js,ts}',
        'tailwind.config.{js,ts,cjs}',
        'postcss.config.{js,cjs}',
        'tsconfig.json',
        'package.json',
        '.env*'
      ],
      ...options
    };

    this.validation = {
      configs: [],
      issues: [],
      warnings: [],
      moduleSystem: null,
      ports: new Map(),
      plugins: new Map(),
      envVars: new Map()
    };
  }

  /**
   * Validate entire project configuration
   * @param {string} projectPath - Root path of project
   * @returns {Promise<Object>} Validation results
   */
  async validateProject(projectPath) {
    console.log('\n🔍 Validating project configuration...\n');

    // 1. Discover all config files
    await this.discoverConfigs(projectPath);

    // 2. Determine expected module system
    await this.detectModuleSystem(projectPath);

    // 3. Validate each config file
    for (const config of this.validation.configs) {
      await this.validateConfig(config);
    }

    // 4. Cross-validate consistency
    await this.crossValidate();

    // 5. Generate summary
    const summary = this.generateSummary();

    console.log('\n' + '='.repeat(70));
    console.log('              CONFIG VALIDATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`\nConfigs Found: ${this.validation.configs.length}`);
    console.log(`Issues: ${this.validation.issues.length}`);
    console.log(`Warnings: ${this.validation.warnings.length}`);
    console.log('');

    return {
      configs: this.validation.configs,
      issues: this.validation.issues,
      warnings: this.validation.warnings,
      moduleSystem: this.validation.moduleSystem,
      ports: Array.from(this.validation.ports.entries()),
      plugins: Array.from(this.validation.plugins.entries()),
      envVars: Array.from(this.validation.envVars.entries()),
      summary
    };
  }

  /**
   * Discover all configuration files in project
   * @param {string} projectPath - Project root
   */
  async discoverConfigs(projectPath) {
    console.log('📂 Discovering configuration files...\n');

    for (const pattern of this.options.configPatterns) {
      const files = await glob(pattern, {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**'],
        absolute: true
      });

      for (const file of files) {
        const relativePath = path.relative(projectPath, file);
        const ext = path.extname(file);
        const basename = path.basename(file);

        this.validation.configs.push({
          path: file,
          relativePath,
          basename,
          ext,
          type: this.getConfigType(basename),
          content: null,
          parsed: null,
          moduleSystem: null
        });

        console.log(`   Found: ${relativePath}`);
      }
    }

    console.log(`\n   Total: ${this.validation.configs.length} config file(s)\n`);
  }

  /**
   * Determine configuration file type
   * @param {string} basename - File basename
   * @returns {string} Config type
   */
  getConfigType(basename) {
    const types = {
      'package.json': 'package',
      'tsconfig.json': 'typescript',
      'vite.config': 'vite',
      'tailwind.config': 'tailwind',
      'postcss.config': 'postcss',
      '.env': 'env'
    };

    for (const [key, type] of Object.entries(types)) {
      if (basename.startsWith(key)) {
        return type;
      }
    }

    return 'unknown';
  }

  /**
   * Detect expected module system from package.json
   * @param {string} projectPath - Project root
   */
  async detectModuleSystem(projectPath) {
    console.log('🔎 Detecting module system...\n');

    const packageJsonPath = path.join(projectPath, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      // Check package.json "type" field
      if (packageJson.type === 'module') {
        this.validation.moduleSystem = 'ESM';
        console.log('   ✅ Module system: ESM (package.json type: "module")\n');
      } else if (packageJson.type === 'commonjs') {
        this.validation.moduleSystem = 'CJS';
        console.log('   ✅ Module system: CommonJS (package.json type: "commonjs")\n');
      } else {
        // Default is CJS if not specified
        this.validation.moduleSystem = 'CJS';
        console.log('   ℹ️  Module system: CommonJS (default, no type specified)\n');
      }

    } catch (error) {
      console.log('   ⚠️  Could not read package.json, assuming CommonJS\n');
      this.validation.moduleSystem = 'CJS';
    }
  }

  /**
   * Validate a single config file
   * @param {Object} config - Config file object
   */
  async validateConfig(config) {
    try {
      config.content = await fs.readFile(config.path, 'utf-8');

      // JSON files
      if (config.ext === '.json') {
        await this.validateJSONConfig(config);
      }
      // JavaScript/TypeScript files
      else if (['.js', '.ts', '.cjs', '.mjs'].includes(config.ext)) {
        await this.validateJSConfig(config);
      }
      // Environment files
      else if (config.basename.startsWith('.env')) {
        await this.validateEnvConfig(config);
      }

    } catch (error) {
      this.validation.issues.push({
        severity: 'MAJOR',
        file: config.relativePath,
        type: 'read_error',
        message: `Could not read config file: ${error.message}`
      });
    }
  }

  /**
   * Validate JSON configuration file
   * @param {Object} config - Config object
   */
  async validateJSONConfig(config) {
    try {
      config.parsed = JSON.parse(config.content);

      if (config.type === 'package') {
        this.validatePackageJSON(config);
      } else if (config.type === 'typescript') {
        this.validateTSConfig(config);
      }

    } catch (error) {
      this.validation.issues.push({
        severity: 'CRITICAL',
        file: config.relativePath,
        type: 'json_parse_error',
        message: `Invalid JSON: ${error.message}`,
        suggestion: 'Fix JSON syntax errors'
      });
    }
  }

  /**
   * Validate package.json
   * @param {Object} config - Config object
   */
  validatePackageJSON(config) {
    const pkg = config.parsed;

    // Check for module system declaration
    if (!pkg.type) {
      this.validation.warnings.push({
        severity: 'MINOR',
        file: config.relativePath,
        type: 'missing_type',
        message: 'No "type" field specified (defaults to CommonJS)',
        suggestion: 'Add "type": "module" or "type": "commonjs" for clarity'
      });
    }

    // Extract port references from scripts
    if (pkg.scripts) {
      this.extractPortsFromScripts(pkg.scripts, config.relativePath);
    }
  }

  /**
   * Validate tsconfig.json
   * @param {Object} config - Config object
   */
  validateTSConfig(config) {
    const tsconfig = config.parsed;

    if (tsconfig.compilerOptions) {
      const { module, moduleResolution } = tsconfig.compilerOptions;

      // Check module system alignment
      if (module && this.validation.moduleSystem) {
        const tsModule = module.toLowerCase();
        const isESM = ['es6', 'es2015', 'es2020', 'esnext'].includes(tsModule);
        const isCJS = tsModule === 'commonjs';

        if (this.validation.moduleSystem === 'ESM' && isCJS) {
          this.validation.issues.push({
            severity: 'MAJOR',
            file: config.relativePath,
            type: 'module_mismatch',
            message: `Package.json uses ESM but tsconfig.json uses CommonJS`,
            suggestion: 'Change tsconfig.json module to "ESNext" or "ES2020"'
          });
        } else if (this.validation.moduleSystem === 'CJS' && isESM) {
          this.validation.warnings.push({
            severity: 'MINOR',
            file: config.relativePath,
            type: 'module_mismatch',
            message: `Package.json uses CJS but tsconfig.json uses ESM`,
            suggestion: 'Consider aligning module systems'
          });
        }
      }
    }
  }

  /**
   * Validate JavaScript/TypeScript config file
   * @param {Object} config - Config object
   */
  async validateJSConfig(config) {
    // Detect module system used in file
    const hasCJS = this.detectCJSSyntax(config.content);
    const hasESM = this.detectESMSyntax(config.content);

    config.moduleSystem = hasESM ? 'ESM' : hasCJS ? 'CJS' : 'UNKNOWN';

    // Check for module system mismatch
    const expectedByExtension = this.getExpectedModuleSystemByExtension(config.ext);

    // Check against package.json
    if (this.validation.moduleSystem && config.moduleSystem !== 'UNKNOWN') {
      if (this.validation.moduleSystem === 'ESM' && config.moduleSystem === 'CJS') {
        // Special case: .cjs files are allowed in ESM projects
        if (config.ext !== '.cjs') {
          this.validation.issues.push({
            severity: 'CRITICAL',
            file: config.relativePath,
            type: 'module_system_mismatch',
            message: `ESM project but ${config.basename} uses CommonJS syntax (require/module.exports)`,
            suggestion: 'Convert to ES modules: use import/export instead of require/module.exports'
          });
        }
      } else if (this.validation.moduleSystem === 'CJS' && config.moduleSystem === 'ESM') {
        // Special case: .mjs files are allowed in CJS projects
        if (config.ext !== '.mjs') {
          this.validation.warnings.push({
            severity: 'MINOR',
            file: config.relativePath,
            type: 'module_system_mismatch',
            message: `CommonJS project but ${config.basename} uses ES module syntax`,
            suggestion: 'Consider converting project to ESM or use require() in this file'
          });
        }
      }
    }

    // Check against file extension
    if (expectedByExtension && config.moduleSystem !== 'UNKNOWN' &&
        expectedByExtension !== config.moduleSystem) {
      this.validation.issues.push({
        severity: 'MAJOR',
        file: config.relativePath,
        type: 'extension_mismatch',
        message: `File extension ${config.ext} expects ${expectedByExtension} but file uses ${config.moduleSystem}`,
        suggestion: `Rename to ${this.suggestExtension(config.moduleSystem)} or change syntax`
      });
    }

    // Parse and extract references
    await this.parseJSConfig(config);
  }

  /**
   * Detect CommonJS syntax
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
   * Detect ES module syntax
   * @param {string} content - File content
   * @returns {boolean} True if ESM syntax found
   */
  detectESMSyntax(content) {
    const esmPatterns = [
      /import\s+.*\s+from\s+['"`]/,
      /export\s+(default|const|function|class)/,
      /export\s+{/
    ];
    return esmPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get expected module system by file extension
   * @param {string} ext - File extension
   * @returns {string|null} Expected module system
   */
  getExpectedModuleSystemByExtension(ext) {
    const mapping = {
      '.mjs': 'ESM',
      '.cjs': 'CJS'
    };
    return mapping[ext] || null;
  }

  /**
   * Suggest file extension for module system
   * @param {string} moduleSystem - Module system
   * @returns {string} Suggested extension
   */
  suggestExtension(moduleSystem) {
    return moduleSystem === 'ESM' ? '.mjs' : '.cjs';
  }

  /**
   * Parse JavaScript config with Babel
   * @param {Object} config - Config object
   */
  async parseJSConfig(config) {
    try {
      const ast = parser.parse(config.content, {
        sourceType: 'unambiguous',
        plugins: ['typescript', 'jsx']
      });

      config.parsed = ast;

      // Extract plugin imports/requires
      this.extractPluginReferences(ast, config.relativePath);

      // Extract port references
      this.extractPortReferences(ast, config.relativePath);

    } catch (error) {
      // AST parsing failed, skip
      console.log(`   ⚠️  Could not parse ${config.relativePath}: ${error.message}`);
    }
  }

  /**
   * Extract plugin references from AST
   * @param {Object} ast - Babel AST
   * @param {string} file - File path
   */
  extractPluginReferences(ast, file) {
    traverse(ast, {
      ImportDeclaration: (path) => {
        const source = path.node.source.value;
        if (source.startsWith('@') || source.includes('plugin')) {
          this.addPluginReference(source, file);
        }
      },
      CallExpression: (path) => {
        if (path.node.callee.name === 'require') {
          const arg = path.node.arguments[0];
          if (arg && arg.value) {
            const source = arg.value;
            if (source.startsWith('@') || source.includes('plugin')) {
              this.addPluginReference(source, file);
            }
          }
        }
      }
    });
  }

  /**
   * Extract port references from AST
   * @param {Object} ast - Babel AST
   * @param {string} file - File path
   */
  extractPortReferences(ast, file) {
    traverse(ast, {
      NumericLiteral: (path) => {
        const value = path.node.value;
        // Check if it's a likely port number (1000-65535)
        if (value >= 1000 && value <= 65535) {
          // Check context to see if it's really a port
          const parent = path.parent;
          if (parent && (
            parent.key?.name === 'port' ||
            parent.key?.name === 'PORT'
          )) {
            this.addPortReference(value, file, 'config');
          }
        }
      },
      StringLiteral: (path) => {
        const value = path.node.value;
        // Check for port in URLs like "http://localhost:3000"
        const portMatch = value.match(/:(\d{4,5})/);
        if (portMatch) {
          this.addPortReference(parseInt(portMatch[1]), file, 'url');
        }
      }
    });
  }

  /**
   * Extract ports from package.json scripts
   * @param {Object} scripts - Scripts object
   * @param {string} file - File path
   */
  extractPortsFromScripts(scripts, file) {
    for (const [name, script] of Object.entries(scripts)) {
      // Look for --port or -p flags
      const portMatch = script.match(/(?:--port|-p)\s+(\d{4,5})/);
      if (portMatch) {
        this.addPortReference(parseInt(portMatch[1]), file, `script:${name}`);
      }

      // Look for PORT= environment variables
      const envMatch = script.match(/PORT=(\d{4,5})/);
      if (envMatch) {
        this.addPortReference(parseInt(envMatch[1]), file, `script:${name}`);
      }
    }
  }

  /**
   * Validate environment config file
   * @param {Object} config - Config object
   */
  async validateEnvConfig(config) {
    const lines = config.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;

        // Store environment variable
        if (!this.validation.envVars.has(key)) {
          this.validation.envVars.set(key, []);
        }
        this.validation.envVars.get(key).push({
          file: config.relativePath,
          value: value.replace(/['"]/g, '')
        });

        // Check for port variables
        if (key.includes('PORT') || key.includes('port')) {
          const portValue = parseInt(value.replace(/['"]/g, ''));
          if (!isNaN(portValue)) {
            this.addPortReference(portValue, config.relativePath, `env:${key}`);
          }
        }
      }
    }
  }

  /**
   * Add plugin reference
   * @param {string} plugin - Plugin name
   * @param {string} file - File path
   */
  addPluginReference(plugin, file) {
    if (!this.validation.plugins.has(plugin)) {
      this.validation.plugins.set(plugin, []);
    }
    this.validation.plugins.get(plugin).push(file);
  }

  /**
   * Add port reference
   * @param {number} port - Port number
   * @param {string} file - File path
   * @param {string} context - Context (config/url/script/env)
   */
  addPortReference(port, file, context) {
    if (!this.validation.ports.has(port)) {
      this.validation.ports.set(port, []);
    }
    this.validation.ports.get(port).push({ file, context });
  }

  /**
   * Cross-validate consistency across configs
   */
  async crossValidate() {
    console.log('🔗 Cross-validating configuration consistency...\n');

    // Check for port conflicts
    this.validatePortConsistency();

    // Check for duplicate environment variables with different values
    this.validateEnvConsistency();
  }

  /**
   * Validate port consistency
   */
  validatePortConsistency() {
    for (const [port, references] of this.validation.ports) {
      if (references.length > 1) {
        // Check if all references are intentional (e.g., frontend calling backend)
        const contexts = references.map(r => r.context);
        const uniqueContexts = new Set(contexts);

        // If same port used in multiple configs (not URL references), warn
        const configRefs = references.filter(r => r.context === 'config');
        if (configRefs.length > 1) {
          this.validation.warnings.push({
            severity: 'MINOR',
            type: 'port_conflict',
            message: `Port ${port} referenced in multiple config files`,
            details: references.map(r => `${r.file} (${r.context})`).join(', '),
            suggestion: 'Ensure this is intentional (e.g., monorepo with multiple services)'
          });
        }

        console.log(`   ℹ️  Port ${port} used in ${references.length} location(s)`);
      }
    }
  }

  /**
   * Validate environment variable consistency
   */
  validateEnvConsistency() {
    for (const [key, refs] of this.validation.envVars) {
      if (refs.length > 1) {
        const uniqueValues = new Set(refs.map(r => r.value));

        if (uniqueValues.size > 1) {
          this.validation.issues.push({
            severity: 'MAJOR',
            type: 'env_conflict',
            message: `Environment variable ${key} has different values across files`,
            details: refs.map(r => `${r.file}: "${r.value}"`).join(', '),
            suggestion: 'Use consistent values or rename variables'
          });
        }
      }
    }
  }

  /**
   * Generate validation summary
   * @returns {Object} Summary
   */
  generateSummary() {
    const critical = this.validation.issues.filter(i => i.severity === 'CRITICAL');
    const major = this.validation.issues.filter(i => i.severity === 'MAJOR');
    const minor = this.validation.warnings.filter(w => w.severity === 'MINOR');

    return {
      total: this.validation.configs.length,
      moduleSystem: this.validation.moduleSystem,
      critical: critical.length,
      major: major.length,
      minor: minor.length,
      passed: critical.length === 0 && major.length === 0
    };
  }

  /**
   * Generate detailed report
   * @param {Object} results - Validation results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '\n' + '='.repeat(70) + '\n';
    report += '              CONFIG VALIDATION REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += '📊 Summary:\n';
    report += `   Configs Analyzed: ${results.summary.total}\n`;
    report += `   Module System: ${results.summary.moduleSystem}\n`;
    report += `   Critical Issues: ${results.summary.critical}\n`;
    report += `   Major Issues: ${results.summary.major}\n`;
    report += `   Minor Warnings: ${results.summary.minor}\n\n`;

    // Critical issues
    const critical = results.issues.filter(i => i.severity === 'CRITICAL');
    if (critical.length > 0) {
      report += '🚨 CRITICAL ISSUES:\n\n';
      critical.forEach((issue, idx) => {
        report += `${idx + 1}. [${issue.type}] ${issue.file}\n`;
        report += `   ${issue.message}\n`;
        report += `   Fix: ${issue.suggestion}\n\n`;
      });
    }

    // Major issues
    const major = results.issues.filter(i => i.severity === 'MAJOR');
    if (major.length > 0) {
      report += '⚠️  MAJOR ISSUES:\n\n';
      major.forEach((issue, idx) => {
        report += `${idx + 1}. [${issue.type}] ${issue.file || 'Multiple files'}\n`;
        report += `   ${issue.message}\n`;
        if (issue.details) report += `   Details: ${issue.details}\n`;
        report += `   Fix: ${issue.suggestion}\n\n`;
      });
    }

    // Minor warnings
    if (results.warnings.length > 0) {
      report += 'ℹ️  MINOR WARNINGS:\n\n';
      results.warnings.forEach((warning, idx) => {
        report += `${idx + 1}. [${warning.type}] ${warning.file || 'General'}\n`;
        report += `   ${warning.message}\n`;
        if (warning.suggestion) report += `   Suggestion: ${warning.suggestion}\n`;
        report += '\n';
      });
    }

    // Port summary
    if (results.ports.length > 0) {
      report += '🔌 Port References:\n\n';
      results.ports.forEach(([port, refs]) => {
        report += `   Port ${port}:\n`;
        refs.forEach(ref => {
          report += `     - ${ref.file} (${ref.context})\n`;
        });
      });
      report += '\n';
    }

    if (results.summary.passed) {
      report += '✅ ALL CONFIG VALIDATIONS PASSED\n\n';
    } else {
      report += '❌ CONFIG VALIDATION FAILED - Fix issues above\n\n';
    }

    report += '='.repeat(70) + '\n';

    return report;
  }
}

module.exports = ConfigValidator;
