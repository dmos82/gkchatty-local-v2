/**
 * Port Management Automaton
 *
 * Automatically manages port allocation for projects:
 * - Scans for busy ports on the system
 * - Finds available ports in desired range
 * - Updates all config files with new ports
 * - Ensures consistency across frontend, backend, .env, and configs
 *
 * This prevents port conflict errors on startup.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

const execAsync = promisify(exec);

class PortManager {
  constructor(options = {}) {
    this.options = {
      portRange: { min: 3000, max: 9000 },
      preferredPorts: {
        frontend: 3000,
        backend: 4000,
        api: 5000
      },
      timeout: 5000,
      ...options
    };

    this.busyPorts = new Set();
    this.allocatedPorts = new Map();
  }

  /**
   * Scan system for busy ports
   * @returns {Promise<Set>} Set of busy port numbers
   */
  async scanBusyPorts() {
    console.log('\n🔍 Scanning for busy ports...\n');

    try {
      // Use lsof to find listening ports (works on macOS/Linux)
      const { stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -n -P');

      const lines = stdout.split('\n');
      const ports = new Set();

      for (const line of lines) {
        // Extract port from lines like: "node    1234 user   20u  IPv4 0x... 0t0  TCP *:3000 (LISTEN)"
        const match = line.match(/:(\d+)\s+\(LISTEN\)/);
        if (match) {
          ports.add(parseInt(match[1]));
        }
      }

      this.busyPorts = ports;

      console.log(`   Found ${ports.size} busy port(s):`);
      if (ports.size > 0) {
        const sortedPorts = Array.from(ports).sort((a, b) => a - b);
        sortedPorts.forEach(port => {
          console.log(`     - ${port}`);
        });
      }
      console.log('');

      return ports;

    } catch (error) {
      // If lsof fails, try alternative methods
      console.log('   ⚠️  lsof unavailable, using alternative port detection\n');
      return await this.scanBusyPortsAlternative();
    }
  }

  /**
   * Alternative port scanning using netstat (Windows/fallback)
   * @returns {Promise<Set>} Set of busy port numbers
   */
  async scanBusyPortsAlternative() {
    try {
      const { stdout } = await execAsync('netstat -an');

      const lines = stdout.split('\n');
      const ports = new Set();

      for (const line of lines) {
        // Look for LISTENING state
        if (line.includes('LISTEN')) {
          const match = line.match(/:(\d+)\s/);
          if (match) {
            ports.add(parseInt(match[1]));
          }
        }
      }

      this.busyPorts = ports;
      return ports;

    } catch (error) {
      console.log('   ⚠️  Could not scan ports, assuming common ports are busy\n');
      // Assume common ports are busy
      return new Set([80, 443, 3000, 3001, 4000, 5000, 8000, 8080]);
    }
  }

  /**
   * Find available port in range
   * @param {number} preferredPort - Preferred port to try first
   * @param {string} service - Service name (for logging)
   * @returns {Promise<number>} Available port number
   */
  async findAvailablePort(preferredPort, service = 'service') {
    // Try preferred port first
    if (!this.busyPorts.has(preferredPort) &&
        !Array.from(this.allocatedPorts.values()).includes(preferredPort)) {
      console.log(`   ✅ ${service}: ${preferredPort} (preferred port available)`);
      return preferredPort;
    }

    // Search for available port in range
    const { min, max } = this.options.portRange;

    for (let port = min; port <= max; port++) {
      if (!this.busyPorts.has(port) &&
          !Array.from(this.allocatedPorts.values()).includes(port)) {
        console.log(`   ✅ ${service}: ${port} (alternative port)`);
        return port;
      }
    }

    throw new Error(`No available ports in range ${min}-${max}`);
  }

  /**
   * Allocate ports for a project
   * @param {Object} services - Services needing ports (e.g., {frontend: true, backend: true})
   * @returns {Promise<Map>} Map of service to port
   */
  async allocatePorts(services) {
    console.log('🎯 Allocating ports for services...\n');

    await this.scanBusyPorts();

    for (const [service, needed] of Object.entries(services)) {
      if (needed) {
        const preferredPort = this.options.preferredPorts[service] || 3000;
        const port = await this.findAvailablePort(preferredPort, service);
        this.allocatedPorts.set(service, port);
      }
    }

    console.log(`\n   Allocated ${this.allocatedPorts.size} port(s)\n`);

    return this.allocatedPorts;
  }

  /**
   * Update all configuration files with new ports
   * @param {string} projectPath - Project root path
   * @param {Map} ports - Map of service to port
   * @returns {Promise<Object>} Update results
   */
  async updateConfigsWithPorts(projectPath, ports) {
    console.log('📝 Updating configuration files with new ports...\n');

    const results = {
      updated: [],
      failed: []
    };

    // 1. Update .env files
    await this.updateEnvFiles(projectPath, ports, results);

    // 2. Update config files (vite.config, package.json scripts, etc.)
    await this.updateConfigFiles(projectPath, ports, results);

    // 3. Update code files (api.ts, server.js, etc.)
    await this.updateCodeFiles(projectPath, ports, results);

    console.log(`\n   Updated ${results.updated.length} file(s)`);
    if (results.failed.length > 0) {
      console.log(`   ⚠️  Failed to update ${results.failed.length} file(s)`);
    }
    console.log('');

    return results;
  }

  /**
   * Update .env files with new ports
   * @param {string} projectPath - Project root
   * @param {Map} ports - Port allocations
   * @param {Object} results - Results object to update
   */
  async updateEnvFiles(projectPath, ports, results) {
    const envFiles = await glob('.env*', {
      cwd: projectPath,
      ignore: ['node_modules/**'],
      absolute: true
    });

    for (const file of envFiles) {
      try {
        let content = await fs.readFile(file, 'utf-8');
        let updated = false;

        // Update PORT variables
        for (const [service, port] of ports) {
          const varName = service.toUpperCase() + '_PORT';
          const regex = new RegExp(`^${varName}=\\d+`, 'm');

          if (regex.test(content)) {
            content = content.replace(regex, `${varName}=${port}`);
            updated = true;
          } else {
            // Add if doesn't exist
            content += `\n${varName}=${port}\n`;
            updated = true;
          }

          // Also check for generic PORT variable
          if (service === 'backend' || service === 'api') {
            const portRegex = /^PORT=\d+/m;
            if (portRegex.test(content)) {
              content = content.replace(portRegex, `PORT=${port}`);
              updated = true;
            }
          }
        }

        if (updated) {
          await fs.writeFile(file, content);
          results.updated.push(path.relative(projectPath, file));
          console.log(`   ✅ Updated: ${path.relative(projectPath, file)}`);
        }

      } catch (error) {
        results.failed.push({
          file: path.relative(projectPath, file),
          error: error.message
        });
      }
    }
  }

  /**
   * Update config files with new ports
   * @param {string} projectPath - Project root
   * @param {Map} ports - Port allocations
   * @param {Object} results - Results object to update
   */
  async updateConfigFiles(projectPath, ports, results) {
    const configFiles = await glob('*.config.{js,ts}', {
      cwd: projectPath,
      ignore: ['node_modules/**'],
      absolute: true
    });

    for (const file of configFiles) {
      try {
        let content = await fs.readFile(file, 'utf-8');
        let updated = false;

        // Update port numbers in config files
        for (const [service, port] of ports) {
          // Look for patterns like: port: 3000, server: { port: 3000 }
          const portPatterns = [
            /port:\s*\d+/g,
            /"port":\s*\d+/g,
            /'port':\s*\d+/g
          ];

          for (const pattern of portPatterns) {
            if (pattern.test(content)) {
              // Only update if it's a vite config and we have a frontend port
              if (file.includes('vite') && service === 'frontend') {
                content = content.replace(pattern, `port: ${port}`);
                updated = true;
              }
            }
          }
        }

        if (updated) {
          await fs.writeFile(file, content);
          results.updated.push(path.relative(projectPath, file));
          console.log(`   ✅ Updated: ${path.relative(projectPath, file)}`);
        }

      } catch (error) {
        results.failed.push({
          file: path.relative(projectPath, file),
          error: error.message
        });
      }
    }

    // Update package.json scripts
    await this.updatePackageJsonPorts(projectPath, ports, results);
  }

  /**
   * Update package.json scripts with new ports
   * @param {string} projectPath - Project root
   * @param {Map} ports - Port allocations
   * @param {Object} results - Results object to update
   */
  async updatePackageJsonPorts(projectPath, ports, results) {
    const packageJsonPath = path.join(projectPath, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      let updated = false;

      if (packageJson.scripts) {
        for (const [scriptName, script] of Object.entries(packageJson.scripts)) {
          let newScript = script;

          // Update --port flags
          newScript = newScript.replace(/--port\s+\d+/g, (match) => {
            for (const [service, port] of ports) {
              if (scriptName.includes(service)) {
                updated = true;
                return `--port ${port}`;
              }
            }
            return match;
          });

          // Update PORT= environment variables
          newScript = newScript.replace(/PORT=\d+/g, (match) => {
            for (const [service, port] of ports) {
              if (scriptName.includes(service) || service === 'backend') {
                updated = true;
                return `PORT=${port}`;
              }
            }
            return match;
          });

          packageJson.scripts[scriptName] = newScript;
        }
      }

      if (updated) {
        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2) + '\n'
        );
        results.updated.push('package.json');
        console.log(`   ✅ Updated: package.json`);
      }

    } catch (error) {
      results.failed.push({
        file: 'package.json',
        error: error.message
      });
    }
  }

  /**
   * Update code files with new ports
   * @param {string} projectPath - Project root
   * @param {Map} ports - Port allocations
   * @param {Object} results - Results object to update
   */
  async updateCodeFiles(projectPath, ports, results) {
    // Look for common server/API files
    const codeFiles = await glob('**/*.{js,ts}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true
    });

    for (const file of codeFiles) {
      const basename = path.basename(file).toLowerCase();

      // Only update likely server files
      if (!basename.includes('server') &&
          !basename.includes('api') &&
          !basename.includes('index')) {
        continue;
      }

      try {
        let content = await fs.readFile(file, 'utf-8');
        let updated = false;

        // Update port literals
        for (const [service, port] of ports) {
          // Look for patterns like: listen(3000), port = 4000, PORT: 5000
          const patterns = [
            /listen\(\d+\)/g,
            /port\s*=\s*\d+/gi,
            /PORT\s*:\s*\d+/g,
            /const\s+port\s*=\s*\d+/gi
          ];

          for (const pattern of patterns) {
            if (pattern.test(content)) {
              // Check if this is the right file for this service
              const isBackend = file.includes('backend') || file.includes('api');
              const isFrontend = file.includes('frontend');

              if ((service === 'backend' || service === 'api') && isBackend) {
                content = content.replace(pattern, (match) => {
                  return match.replace(/\d+/, port.toString());
                });
                updated = true;
              } else if (service === 'frontend' && isFrontend) {
                content = content.replace(pattern, (match) => {
                  return match.replace(/\d+/, port.toString());
                });
                updated = true;
              }
            }
          }
        }

        if (updated) {
          await fs.writeFile(file, content);
          results.updated.push(path.relative(projectPath, file));
          console.log(`   ✅ Updated: ${path.relative(projectPath, file)}`);
        }

      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
  }

  /**
   * Complete port management workflow
   * @param {string} projectPath - Project root path
   * @param {Object} services - Services needing ports
   * @returns {Promise<Object>} Complete results
   */
  async manageProjectPorts(projectPath, services) {
    console.log('\n🚀 Port Management Automaton\n');
    console.log('='.repeat(70));
    console.log(`Project: ${projectPath}`);
    console.log('='.repeat(70));

    // 1. Allocate ports
    const ports = await this.allocatePorts(services);

    // 2. Update configs
    const updateResults = await this.updateConfigsWithPorts(projectPath, ports);

    // 3. Generate summary
    const summary = {
      ports: Object.fromEntries(ports),
      updated: updateResults.updated,
      failed: updateResults.failed,
      success: updateResults.failed.length === 0
    };

    return summary;
  }

  /**
   * Generate port management report
   * @param {Object} results - Management results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '\n' + '='.repeat(70) + '\n';
    report += '              PORT MANAGEMENT REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += '🎯 Port Allocations:\n\n';
    for (const [service, port] of Object.entries(results.ports)) {
      report += `   ${service}: ${port}\n`;
    }
    report += '\n';

    report += '📝 Files Updated:\n\n';
    if (results.updated.length > 0) {
      results.updated.forEach(file => {
        report += `   ✅ ${file}\n`;
      });
    } else {
      report += '   (no files needed updating)\n';
    }
    report += '\n';

    if (results.failed.length > 0) {
      report += '❌ Failed Updates:\n\n';
      results.failed.forEach(failure => {
        report += `   ❌ ${failure.file}\n`;
        report += `      Error: ${failure.error}\n`;
      });
      report += '\n';
    }

    if (results.success) {
      report += '✅ PORT MANAGEMENT SUCCESSFUL\n\n';
      report += 'All ports allocated and configs updated.\n';
      report += 'Run your dev servers with the new ports.\n\n';
    } else {
      report += '⚠️  PORT MANAGEMENT COMPLETED WITH ERRORS\n\n';
      report += 'Some files could not be updated. Review errors above.\n\n';
    }

    report += '='.repeat(70) + '\n';

    return report;
  }
}

module.exports = PortManager;
