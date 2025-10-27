#!/usr/bin/env node

/**
 * BMAD Orchestrator Proof of Concept
 *
 * This demonstrates the new orchestration pattern where:
 * - Agents return JSON only (no I/O)
 * - Orchestrator handles all file writes and MCP operations
 * - Clear separation of concerns
 */

const fs = require('fs').promises;
const path = require('path');

class BMADOrchestrator {
  constructor() {
    this.phases = ['requirements', 'architecture', 'discovery', 'planning', 'implementation', 'qa'];
    this.artifacts = new Map();
    this.context = {};
  }

  /**
   * Execute complete BMAD workflow
   */
  async executeWorkflow(request) {
    console.log('🚀 Starting BMAD Orchestrated Workflow');
    console.log(`📝 Request: ${request}\n`);

    this.context = {
      request,
      startTime: Date.now(),
      phases: {},
      artifacts: {}
    };

    for (const phase of this.phases) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 PHASE: ${phase.toUpperCase()}`);
      console.log(`${'='.repeat(60)}`);

      try {
        // Execute phase
        const result = await this.executePhase(phase);

        // Store results
        this.context.phases[phase] = {
          status: result.status,
          outputs: result.outputs,
          duration: result.duration
        };

        // Check if should continue
        if (result.status === 'failed') {
          console.log(`❌ Phase ${phase} failed. Stopping workflow.`);
          break;
        }

        if (!result.next_phase?.ready) {
          console.log(`⚠️ Not ready for next phase. Stopping workflow.`);
          break;
        }

      } catch (error) {
        console.error(`❌ Error in phase ${phase}:`, error.message);
        this.context.phases[phase] = {
          status: 'error',
          error: error.message
        };
        break;
      }
    }

    return this.generateReport();
  }

  /**
   * Execute a single phase
   */
  async executePhase(phase) {
    const startTime = Date.now();

    // 1. Prepare agent prompt
    const prompt = this.preparePrompt(phase);

    // 2. Simulate agent execution (in real implementation, would call Task)
    console.log(`🤖 Invoking ${phase} agent...`);
    const agentOutput = await this.simulateAgent(phase, prompt);

    // 3. Parse agent output
    const parsed = this.parseAgentOutput(agentOutput);

    // 4. Validate output structure
    this.validateOutput(phase, parsed);

    // 5. Process artifacts
    await this.processArtifacts(phase, parsed.artifacts || []);

    // 6. Store in context
    this.context.artifacts[phase] = parsed.artifacts;

    const duration = Date.now() - startTime;
    console.log(`✅ Phase completed in ${duration}ms`);

    return {
      ...parsed,
      duration
    };
  }

  /**
   * Prepare prompt for agent based on phase and context
   */
  preparePrompt(phase) {
    const basePrompt = `
You are a BMAD ${phase} agent.

IMPORTANT: You must return ONLY valid JSON, no markdown, no explanations.

Context:
- Original request: ${this.context.request}
- Previous phases: ${Object.keys(this.context.phases).join(', ')}

Return JSON with this structure:
{
  "status": "success|partial|failed",
  "phase": "${phase}",
  "outputs": {
    // Phase-specific outputs
  },
  "artifacts": [
    {
      "type": "file|gkchatty",
      "path": "path/to/file",
      "content": "file content",
      "metadata": {}
    }
  ],
  "validation": {
    "checks": [],
    "passed": [],
    "failed": []
  },
  "next_phase": {
    "ready": true,
    "requirements": []
  }
}`;

    // Add phase-specific context
    if (phase === 'architecture' && this.context.phases.requirements) {
      return basePrompt + `\n\nRequirements from previous phase:\n${JSON.stringify(this.context.phases.requirements.outputs)}`;
    }

    return basePrompt;
  }

  /**
   * Simulate agent response (in production, this would be actual Task call)
   */
  async simulateAgent(phase, prompt) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return mock responses based on phase
    const mockResponses = {
      requirements: {
        status: 'success',
        phase: 'requirements',
        outputs: {
          user_stories: ['As a user, I want to...'],
          acceptance_criteria: ['Given... When... Then...']
        },
        artifacts: [{
          type: 'file',
          path: 'specs/requirements.md',
          content: '# Requirements\n\nUser stories and acceptance criteria...',
          metadata: { format: 'markdown' }
        }],
        validation: {
          checks: ['stories_defined', 'criteria_clear'],
          passed: ['stories_defined', 'criteria_clear'],
          failed: []
        },
        next_phase: { ready: true }
      },

      architecture: {
        status: 'success',
        phase: 'architecture',
        outputs: {
          components: ['Frontend', 'Backend', 'Database'],
          technologies: ['React', 'Node.js', 'PostgreSQL']
        },
        artifacts: [{
          type: 'file',
          path: 'specs/architecture.md',
          content: '# System Architecture\n\nComponents and design...',
          metadata: { format: 'markdown' }
        }],
        validation: {
          checks: ['design_complete', 'scalable'],
          passed: ['design_complete', 'scalable'],
          failed: []
        },
        next_phase: { ready: true }
      }
    };

    return JSON.stringify(mockResponses[phase] || {
      status: 'success',
      phase: phase,
      outputs: {},
      artifacts: [],
      validation: { checks: [], passed: [], failed: [] },
      next_phase: { ready: true }
    });
  }

  /**
   * Parse agent output (handles JSON and fallback to text)
   */
  parseAgentOutput(output) {
    try {
      return JSON.parse(output);
    } catch (error) {
      console.warn('⚠️ Failed to parse JSON, attempting text extraction');

      // Fallback: try to extract JSON from text
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('❌ Could not extract valid JSON from output');
          throw new Error('Invalid agent output format');
        }
      }

      throw new Error('No valid JSON found in agent output');
    }
  }

  /**
   * Validate output structure
   */
  validateOutput(phase, output) {
    const required = ['status', 'phase', 'outputs', 'artifacts', 'validation', 'next_phase'];
    const missing = required.filter(field => !(field in output));

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (output.phase !== phase) {
      console.warn(`⚠️ Phase mismatch: expected ${phase}, got ${output.phase}`);
    }

    // Validate artifacts structure
    if (output.artifacts && Array.isArray(output.artifacts)) {
      output.artifacts.forEach((artifact, index) => {
        if (!artifact.type || !artifact.path || !artifact.content) {
          throw new Error(`Invalid artifact at index ${index}`);
        }
      });
    }

    console.log('✅ Output validation passed');
  }

  /**
   * Process artifacts (write files, upload to GKChatty, etc.)
   */
  async processArtifacts(phase, artifacts) {
    if (!artifacts || artifacts.length === 0) {
      console.log('📭 No artifacts to process');
      return;
    }

    console.log(`📦 Processing ${artifacts.length} artifacts...`);

    for (const artifact of artifacts) {
      try {
        switch (artifact.type) {
          case 'file':
            await this.writeFile(artifact.path, artifact.content);
            console.log(`  ✅ Wrote file: ${artifact.path}`);
            break;

          case 'gkchatty':
            // In production, would call MCP tool here
            console.log(`  📤 Would upload to GKChatty: ${artifact.path}`);
            break;

          default:
            console.warn(`  ⚠️ Unknown artifact type: ${artifact.type}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to process artifact: ${error.message}`);
      }
    }
  }

  /**
   * Write file with directory creation
   */
  async writeFile(filePath, content) {
    const fullPath = path.join('/tmp/bmad-orchestrator-test', filePath);
    const dir = path.dirname(fullPath);

    // Create directory if needed
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Generate final report
   */
  generateReport() {
    const duration = Date.now() - this.context.startTime;
    const successful = Object.values(this.context.phases)
      .filter(p => p.status === 'success').length;

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 WORKFLOW COMPLETE');
    console.log(`${'='.repeat(60)}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Phases completed: ${successful}/${this.phases.length}`);
    console.log(`Artifacts created: ${Object.values(this.context.artifacts).flat().length}`);

    // Write summary file
    const summary = {
      request: this.context.request,
      duration,
      phases: this.context.phases,
      artifacts: this.context.artifacts,
      success: successful === this.phases.length
    };

    this.writeFile('summary.json', JSON.stringify(summary, null, 2));

    return summary;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node bmad-orchestrator-poc.js "your request"');
    console.log('Example: node bmad-orchestrator-poc.js "Create a login form"');
    process.exit(1);
  }

  const request = args.join(' ');
  const orchestrator = new BMADOrchestrator();

  try {
    const result = await orchestrator.executeWorkflow(request);

    if (result.success) {
      console.log('\n✅ Workflow completed successfully!');
    } else {
      console.log('\n⚠️ Workflow completed with issues');
    }

    console.log(`\n📁 Artifacts saved to: /tmp/bmad-orchestrator-test/`);

  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = BMADOrchestrator;