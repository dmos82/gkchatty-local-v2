/**
 * MCP Tool Wrappers for Builder Pro v2.0
 *
 * Integrates all 5 validation and auto-fix phases:
 * 1. Dependency Detection Engine
 * 2. Visual Smoke Test Pipeline
 * 3. Config File Validation Matrix
 * 4. Port Management Automaton
 * 5. Bug Categorization & Fix Orchestrator
 */

const DependencyResolver = require('./dependency-detection/dependency-resolver');
const VisualSmokeTest = require('./visual-testing/smoke-test');
const VisualErrorDetector = require('./visual-testing/visual-error-detector');
const ConfigValidator = require('./config-validation/config-validator');
const PortManager = require('./port-management/port-manager');
const BugOrchestrator = require('./fix-orchestrator/bug-orchestrator');

/**
 * Tool Definitions for MCP Protocol
 */
const tools = [
  {
    name: 'detect_dependencies',
    description: 'Phase 1: Detect missing dependencies from CSS utilities and config plugins. Scans for @apply directives in CSS that require Tailwind plugins, and validates config file imports.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to project root'
        },
        autoFix: {
          type: 'boolean',
          description: 'Automatically add missing dependencies to package.json',
          default: false
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'run_visual_test',
    description: 'Phase 2: Run visual smoke test with Playwright. Captures screenshot, monitors console errors, detects blank pages, and verifies asset loading.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to test (e.g., http://localhost:3000)'
        },
        screenshotPath: {
          type: 'string',
          description: 'Path to save screenshot',
          default: '/tmp/builder-pro-screenshot.png'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'validate_configs',
    description: 'Phase 3: Validate config file consistency. Cross-validates module systems (ESM vs CJS), port references, and plugin configurations across all config files.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to project root'
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'manage_ports',
    description: 'Phase 4: Scan busy ports and allocate available ones. Uses lsof to detect busy ports, finds available ports, and updates config files consistently.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to project root'
        },
        services: {
          type: 'object',
          description: 'Services requiring ports (e.g., {frontend: true, backend: true})',
          properties: {
            frontend: { type: 'boolean' },
            backend: { type: 'boolean' },
            api: { type: 'boolean' }
          }
        },
        updateConfigs: {
          type: 'boolean',
          description: 'Automatically update config files with new ports',
          default: false
        }
      },
      required: ['projectPath', 'services']
    }
  },
  {
    name: 'orchestrate_build',
    description: 'Phase 5: Orchestrate complete validation and auto-fix workflow. Runs all phases, categorizes bugs by severity, applies fixes intelligently with iteration limits (max 3), and generates comprehensive report.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to project root'
        },
        config: {
          type: 'object',
          description: 'Project configuration',
          properties: {
            frontend: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Frontend URL for visual testing' }
              }
            },
            backend: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Backend URL for API testing' }
              }
            }
          }
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum auto-fix iterations',
          default: 3
        },
        autoFix: {
          type: 'boolean',
          description: 'Enable automatic fixing',
          default: true
        },
        stopOnCritical: {
          type: 'boolean',
          description: 'Stop on critical errors',
          default: true
        }
      },
      required: ['projectPath']
    }
  }
];

/**
 * Tool Handlers
 */
const handlers = {
  /**
   * Phase 1: Dependency Detection
   */
  detect_dependencies: async (args) => {
    const { projectPath, autoFix = false } = args;

    console.error(`[Dependency Detection] Scanning ${projectPath}...`);

    const resolver = new DependencyResolver();
    const results = await resolver.scanProject(projectPath);

    if (autoFix && results.missing.length > 0) {
      console.error(`[Dependency Detection] Auto-fixing ${results.missing.length} missing dependencies...`);
      const fixResult = await resolver.autoAddMissing(results.missing, projectPath);
      results.autoFixApplied = fixResult.success;
      results.autoFixDetails = fixResult;
    }

    console.error(`[Dependency Detection] Found ${results.missing.length} missing, ${results.satisfied.length} satisfied`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          phase: 'Dependency Detection',
          timestamp: new Date().toISOString(),
          projectPath,
          results,
          summary: {
            missingCount: results.missing.length,
            satisfiedCount: results.satisfied.length,
            autoFixApplied: results.autoFixApplied || false
          }
        }, null, 2)
      }]
    };
  },

  /**
   * Phase 2: Visual Smoke Test
   */
  run_visual_test: async (args) => {
    const { url, screenshotPath = '/tmp/builder-pro-screenshot.png' } = args;

    console.error(`[Visual Test] Testing ${url}...`);

    const smokeTest = new VisualSmokeTest();
    const errorDetector = new VisualErrorDetector();

    const smokeResults = await smokeTest.runSmokeTest(url, screenshotPath);
    const analysis = await errorDetector.analyzeResults(smokeResults);

    console.error(`[Visual Test] ${analysis.errors.length} errors detected (${analysis.summary.critical} critical)`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          phase: 'Visual Smoke Test',
          timestamp: new Date().toISOString(),
          url,
          smokeResults,
          analysis,
          summary: {
            passed: analysis.severity === 'PASS',
            errorsFound: analysis.errors.length,
            criticalErrors: analysis.summary.critical,
            majorErrors: analysis.summary.major,
            shouldStop: analysis.shouldStop
          }
        }, null, 2)
      }]
    };
  },

  /**
   * Phase 3: Config Validation
   */
  validate_configs: async (args) => {
    const { projectPath } = args;

    console.error(`[Config Validation] Validating ${projectPath}...`);

    const validator = new ConfigValidator();
    const results = await validator.validateProject(projectPath);

    const critical = results.issues.filter(i => i.severity === 'CRITICAL');
    const major = results.issues.filter(i => i.severity === 'MAJOR');

    console.error(`[Config Validation] ${results.issues.length} issues (${critical.length} critical, ${major.length} major)`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          phase: 'Config Validation',
          timestamp: new Date().toISOString(),
          projectPath,
          results,
          summary: {
            totalIssues: results.issues.length,
            criticalIssues: critical.length,
            majorIssues: major.length,
            moduleSystem: results.moduleSystem
          }
        }, null, 2)
      }]
    };
  },

  /**
   * Phase 4: Port Management
   */
  manage_ports: async (args) => {
    const { projectPath, services, updateConfigs = false } = args;

    console.error(`[Port Management] Scanning ports and allocating for ${Object.keys(services).length} services...`);

    const portManager = new PortManager();
    const busyPorts = await portManager.scanBusyPorts();
    const allocatedPorts = await portManager.allocatePorts(services);

    let updateResults = null;
    if (updateConfigs) {
      console.error(`[Port Management] Updating config files...`);
      updateResults = await portManager.updateConfigFiles(projectPath, allocatedPorts);
    }

    console.error(`[Port Management] Allocated ${allocatedPorts.size} ports from ${busyPorts.size} busy ports`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          phase: 'Port Management',
          timestamp: new Date().toISOString(),
          projectPath,
          busyPorts: Array.from(busyPorts),
          allocatedPorts: Object.fromEntries(allocatedPorts),
          updateResults,
          summary: {
            busyPortsCount: busyPorts.size,
            allocatedPortsCount: allocatedPorts.size,
            configsUpdated: updateResults !== null
          }
        }, null, 2)
      }]
    };
  },

  /**
   * Phase 5: Orchestrate Complete Build Workflow
   */
  orchestrate_build: async (args) => {
    const {
      projectPath,
      config = {},
      maxIterations = 3,
      autoFix = true,
      stopOnCritical = true
    } = args;

    console.error(`[Orchestrator] Starting build orchestration for ${projectPath}...`);
    console.error(`[Orchestrator] Max iterations: ${maxIterations}, Auto-fix: ${autoFix}`);

    const orchestrator = new BugOrchestrator({
      maxIterations,
      autoFix,
      stopOnCritical
    });

    const results = await orchestrator.orchestrate(projectPath, config);
    const report = orchestrator.generateReport(results);

    console.error(`[Orchestrator] Completed - ${results.summary.totalBugs} bugs, ${results.summary.fixed} fixed`);
    console.error(`[Orchestrator] Success rate: ${results.summary.successRate}%`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          phase: 'Bug Orchestration',
          timestamp: new Date().toISOString(),
          projectPath,
          results,
          report,
          summary: {
            totalBugs: results.summary.totalBugs,
            fixed: results.summary.fixed,
            remaining: results.summary.remaining,
            successRate: results.summary.successRate,
            iterations: results.iterations.length,
            buildSuccessful: results.success
          }
        }, null, 2)
      }]
    };
  }
};

module.exports = {
  tools,
  handlers
};
