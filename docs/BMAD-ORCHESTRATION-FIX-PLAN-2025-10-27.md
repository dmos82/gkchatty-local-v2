# BMAD Orchestration Fix Plan - Enterprise Grade

**Date:** October 27, 2025
**Type:** Infrastructure/Architecture Refactoring
**Estimated Time:** 4-6 hours for complete fix
**Risk Level:** High - Affects all BMAD workflows

## Executive Summary

Fix the fundamental orchestration flaw in BMAD workflows where sub-agents cannot perform I/O operations but are expected to. Implement proper separation between computation (agents) and orchestration (Claude Code).

## Success Criteria

- [ ] Sub-agents return structured data only (no I/O attempts)
- [ ] Orchestrator handles all file writes and MCP operations
- [ ] Clear validation gates between phases
- [ ] No silent failures
- [ ] Backward compatibility maintained
- [ ] Pattern documented and reusable

## Implementation Plan

### Phase 1: Proof of Concept (1 hour)

**Objective:** Validate that the orchestration pattern works

#### Step 1.1: Create Test Orchestrator
```typescript
// Test simple orchestration pattern
async function orchestratePhase(agentType, prompt) {
  // 1. Invoke agent
  const result = await Task(agentType, prompt + "\n\nReturn output as JSON only.");

  // 2. Parse output
  const output = JSON.parse(result);

  // 3. Handle artifacts
  for (const artifact of output.artifacts) {
    if (artifact.type === 'file') {
      await writeFile(artifact.path, artifact.content);
    } else if (artifact.type === 'gkchatty') {
      await mcp.uploadToGKChatty(artifact);
    }
  }

  // 4. Validate
  return validatePhaseOutput(output);
}
```

#### Step 1.2: Test with Simple Agent
- Create minimal test agent that returns JSON
- Verify orchestrator can handle the output
- Confirm file writes and MCP calls work

#### Validation Gate
- ✅ Orchestrator successfully parses agent output
- ✅ Files are written correctly
- ✅ MCP operations succeed
- ✅ Errors are caught and reported

### Phase 2: Refactor Agent Prompts (2 hours)

**Objective:** Update all BMAD agents to return structured JSON

#### Step 2.1: Define Standard Output Schema
```json
{
  "status": "success|partial|failed",
  "phase": "requirements|architecture|discovery|planning|implementation|qa",
  "outputs": {
    // Phase-specific data
  },
  "artifacts": [
    {
      "type": "file|gkchatty|database",
      "path": "relative/path/to/file",
      "content": "...",
      "metadata": {}
    }
  ],
  "validation": {
    "checks": ["check1", "check2"],
    "passed": ["check1"],
    "failed": ["check2"],
    "warnings": []
  },
  "next_phase": {
    "ready": true,
    "requirements": []
  }
}
```

#### Step 2.2: Update Agent Prompts

**Product Owner Agent:**
```markdown
You are the Product Owner. Analyze requirements and return JSON only:
- No file operations
- No MCP calls
- Return structured output per schema
- Include user stories as artifact content
```

**Architect Agent:**
```markdown
You are the Architect. Design system and return JSON only:
- No file operations
- No MCP calls
- Return architecture document as artifact content
```

**Scout Agent:**
```markdown
You are Scout. Discover context and return JSON only:
- You CAN read files passed to you
- You CANNOT write files
- You CANNOT use MCP tools
- Return discovery report as JSON
```

**Planner Agent:**
```markdown
You are the Planner. Create implementation plan and return JSON only:
- No file operations
- No MCP calls
- Return plan as artifact content
- Include metadata for GKChatty upload
```

#### Step 2.3: Create Prompt Templates
```yaml
# prompt-templates/agent-base.yaml
base_instructions: |
  You are a specialized BMAD agent.

  CAPABILITIES:
  - Read provided input
  - Process and analyze data
  - Generate output

  LIMITATIONS:
  - Cannot write files
  - Cannot use MCP tools
  - Cannot make network requests

  REQUIREMENTS:
  - Return JSON output only
  - Follow the schema exactly
  - Include all artifacts as content
  - Report status honestly
```

### Phase 3: Implement Orchestrator (2 hours)

**Objective:** Build robust orchestration layer

#### Step 3.1: Core Orchestrator Functions

```typescript
// orchestrator/core.ts

class BMADOrchestrator {
  private phases = ['requirements', 'architecture', 'discovery', 'planning', 'implementation', 'qa'];
  private artifacts = new Map();

  async executeWorkflow(request: string) {
    const context = { request, artifacts: {} };

    for (const phase of this.phases) {
      try {
        console.log(`\n🔄 Executing Phase: ${phase}`);

        // 1. Prepare phase input
        const input = this.preparePhaseInput(phase, context);

        // 2. Execute agent
        const output = await this.executePhase(phase, input);

        // 3. Validate output
        this.validateOutput(phase, output);

        // 4. Process artifacts
        await this.processArtifacts(output.artifacts);

        // 5. Update context
        context.artifacts[phase] = output.outputs;

        // 6. Check if should continue
        if (!output.next_phase.ready) {
          return this.handlePhaseFailure(phase, output);
        }

      } catch (error) {
        return this.handlePhaseError(phase, error);
      }
    }

    return { success: true, artifacts: context.artifacts };
  }

  async processArtifacts(artifacts: Artifact[]) {
    for (const artifact of artifacts) {
      switch (artifact.type) {
        case 'file':
          await this.writeFile(artifact.path, artifact.content);
          break;

        case 'gkchatty':
          await this.uploadToGKChatty(artifact);
          break;

        case 'database':
          await this.saveToDatabase(artifact);
          break;
      }
    }
  }

  validateOutput(phase: string, output: any) {
    // Schema validation
    if (!output.status || !output.outputs || !output.artifacts) {
      throw new Error(`Invalid output schema from ${phase} phase`);
    }

    // Phase-specific validation
    switch (phase) {
      case 'planning':
        if (!output.artifacts.some(a => a.type === 'gkchatty')) {
          console.warn(`Planning phase did not prepare GKChatty upload`);
        }
        break;
    }
  }
}
```

#### Step 3.2: Error Handling and Recovery

```typescript
class OrchestratorError extends Error {
  constructor(
    public phase: string,
    public type: 'validation' | 'execution' | 'compensation',
    public details: any
  ) {
    super(`Orchestrator error in ${phase}: ${type}`);
  }
}

async function withRetry(fn: Function, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

#### Step 3.3: Compensation Logic

```typescript
async function compensateForAgentLimitations(phase: string, output: any) {
  // If agent tried to write files (detected in output text)
  if (output.raw_text?.includes('write_file') || output.raw_text?.includes('writeFile')) {
    console.log(`⚠️ Agent attempted file write - compensating`);
    // Extract intended file operations and execute them
  }

  // If agent tried MCP operations
  if (output.raw_text?.includes('mcp__') || output.raw_text?.includes('gkchatty')) {
    console.log(`⚠️ Agent attempted MCP operation - compensating`);
    // Extract intended MCP operations and execute them
  }
}
```

### Phase 4: Testing & Validation (1 hour)

**Objective:** Ensure the fix works correctly

#### Step 4.1: Unit Tests
```typescript
// tests/orchestrator.test.ts

describe('BMAD Orchestrator', () => {
  it('should handle agent JSON output', async () => {
    const mockOutput = {
      status: 'success',
      outputs: { test: 'data' },
      artifacts: [
        { type: 'file', path: 'test.md', content: 'test' }
      ]
    };

    const result = await orchestrator.processArtifacts(mockOutput.artifacts);
    expect(fs.existsSync('test.md')).toBe(true);
  });

  it('should detect and report agent I/O attempts', async () => {
    const mockOutput = {
      raw_text: 'Attempting to write_file...',
      status: 'success'
    };

    const warnings = orchestrator.detectIOAttempts(mockOutput);
    expect(warnings).toContain('file_write_attempt');
  });
});
```

#### Step 4.2: Integration Tests
```bash
# Test each phase individually
/test-bmad-phase requirements "Create user login"
/test-bmad-phase architecture "Design microservices"
/test-bmad-phase planning "Plan API implementation"

# Test full workflow
/test-bmad-workflow "Create simple todo app"
```

#### Step 4.3: Regression Tests
- Run against existing BMAD commands
- Ensure backward compatibility
- Verify no breaking changes

### Phase 5: Documentation & Rollout (30 min)

#### Step 5.1: Update Documentation
- Update bmad-pro-build.md with new pattern
- Document orchestration pattern
- Add troubleshooting guide

#### Step 5.2: Create Migration Guide
```markdown
# BMAD Orchestration Migration Guide

## What Changed
- Agents now return JSON only
- Orchestrator handles all I/O
- Clear separation of concerns

## How to Update Custom Agents
1. Remove all file write attempts
2. Remove all MCP tool usage
3. Return structured JSON output
4. Include artifacts in response

## Backward Compatibility
- Old workflows will show warnings but continue
- Orchestrator compensates for legacy behavior
- Full migration recommended within 30 days
```

## Risk Mitigation

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|---------|------------|
| Breaking existing workflows | Medium | High | Compensation logic + backward compatibility |
| JSON parsing failures | Low | Medium | Fallback to text parsing |
| Performance degradation | Low | Low | Optimize orchestration loops |
| Agent output too large | Medium | Medium | Streaming JSON parser |

## Rollback Plan

If issues arise:
1. Revert orchestrator changes
2. Restore original agent prompts
3. Document issues found
4. Plan incremental migration

## Success Metrics

- **Functionality**: All phases complete successfully
- **Performance**: <500ms orchestration overhead per phase
- **Reliability**: No silent failures
- **Compatibility**: Existing workflows continue to function
- **Adoption**: Clear documentation and examples

## Alternative Simpler Approach

If enterprise orchestration proves too complex:

### Two-Phase Simplified Pattern
```
Phase 1: Analysis (all research/planning agents combined)
  → Returns complete specification

Phase 2: Implementation (builder agent in main session)
  → Has full access to tools
```

Benefits:
- Dramatically simpler
- Fewer failure points
- Faster execution
- Easier to maintain

Drawbacks:
- Less specialized
- Larger context per agent
- Less granular control

## Decision Point

**Recommendation**: Implement the enterprise orchestration pattern because:
1. It solves the root problem correctly
2. It's reusable across all workflows
3. It enables proper monitoring and debugging
4. The complexity is manageable with phased approach

**However**, also create the simplified two-phase pattern as an alternative for simpler tasks.

## Next Actions

1. [ ] Approve this plan
2. [ ] Begin Phase 1 proof of concept
3. [ ] Test orchestration pattern
4. [ ] Refactor agent prompts
5. [ ] Deploy and test
6. [ ] Resume CommiSocial stress test

---

**Estimated Total Time**: 4-6 hours
**Risk Level**: Medium (with mitigations in place)
**Confidence Level**: High - pattern is proven in enterprise systems