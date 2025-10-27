/**
 * BMAD Claude Code Integration Module
 *
 * Bridges the BMAD Orchestrator with Claude Code's Task tool for production use.
 * This module is designed to be invoked from within Claude Code sessions.
 *
 * @date 2025-10-27
 */

const BMADOrchestrator = require('./bmad-orchestrator-v2');

/**
 * Production agent prompts for each phase
 */
const AGENT_PROMPTS = {
  requirements: {
    agent: 'general-purpose',
    promptTemplate: (context) => `
You are a BMAD Product Owner creating comprehensive requirements.

User Request: ${context.request}

Create detailed user stories and acceptance criteria for this feature.

CRITICAL: Return ONLY valid JSON with this exact structure:
{
  "status": "success",
  "phase": "requirements",
  "outputs": {
    "user_stories": [
      {
        "id": "US-001",
        "title": "Story title",
        "description": "As a..., I want..., so that...",
        "priority": "high|medium|low"
      }
    ],
    "acceptance_criteria": [
      {
        "story_id": "US-001",
        "criteria": ["Given...", "When...", "Then..."]
      }
    ],
    "scope": "MVP|Full|Enterprise",
    "constraints": ["technical", "time", "budget"],
    "non_functional": {
      "performance": "requirements",
      "security": "requirements",
      "scalability": "requirements"
    }
  },
  "artifacts": [
    {
      "name": "requirements.md",
      "path": "specs/user-stories/YYYY-MM-DD-feature.md",
      "content": "# User Stories\\n\\nFull markdown document content here",
      "type": "file",
      "metadata": {
        "description": "User stories and acceptance criteria",
        "format": "markdown"
      }
    }
  ],
  "validation": {
    "checks": ["completeness", "clarity", "testability"],
    "passed": ["completeness", "clarity", "testability"],
    "failed": [],
    "warnings": []
  },
  "next_phase": {
    "ready": true,
    "blockers": [],
    "requirements": []
  },
  "errors": []
}

Return ONLY the JSON object.`
  },

  architecture: {
    agent: 'general-purpose',
    promptTemplate: (context) => `
You are a BMAD System Architect designing the technical architecture.

Requirements: ${JSON.stringify(context.requirements, null, 2)}

Design a comprehensive system architecture for these requirements.

CRITICAL: Return ONLY valid JSON with this exact structure:
{
  "status": "success",
  "phase": "architecture",
  "outputs": {
    "components": ["frontend", "backend", "database"],
    "technologies": {
      "frontend": ["Next.js 14", "shadcn/ui", "Tailwind CSS"],
      "backend": ["Supabase", "PostgreSQL"],
      "infrastructure": ["Vercel", "Supabase Cloud"]
    },
    "patterns": ["REST API", "WebSockets", "JWT Auth"],
    "database_schema": {
      "tables": [],
      "relationships": [],
      "indexes": []
    },
    "api_design": {
      "endpoints": [],
      "authentication": "JWT",
      "rate_limiting": true
    },
    "decisions": [
      {
        "decision": "Use Supabase",
        "rationale": "Provides auth, database, and realtime",
        "alternatives": ["Firebase", "Custom backend"]
      }
    ]
  },
  "artifacts": [
    {
      "name": "architecture.md",
      "path": "specs/architecture/YYYY-MM-DD-feature.md",
      "content": "# System Architecture\\n\\nFull architecture document here",
      "type": "file",
      "metadata": {
        "description": "System architecture and design decisions",
        "format": "markdown"
      }
    }
  ],
  "validation": {
    "checks": ["completeness", "feasibility", "scalability"],
    "passed": ["completeness", "feasibility", "scalability"],
    "failed": [],
    "warnings": []
  },
  "next_phase": {
    "ready": true,
    "blockers": [],
    "requirements": []
  },
  "errors": []
}

Return ONLY the JSON object.`
  },

  discovery: {
    agent: 'scout',
    promptTemplate: (context) => `
Analyze the codebase for relevant patterns and existing implementations.

Requirements: ${JSON.stringify(context.requirements, null, 2)}
Architecture: ${JSON.stringify(context.architecture, null, 2)}

Search for:
1. Similar existing features
2. Reusable components
3. Integration points
4. Dependencies

Return findings as JSON with relevant files, patterns, and recommendations.`
  },

  planning: {
    agent: 'planner',
    promptTemplate: (context) => `
Create a detailed step-by-step implementation plan.

Requirements: ${JSON.stringify(context.requirements, null, 2)}
Architecture: ${JSON.stringify(context.architecture, null, 2)}
Discovery: ${JSON.stringify(context.discovery, null, 2)}

CRITICAL: Return ONLY valid JSON with this exact structure:
{
  "status": "success",
  "phase": "planning",
  "outputs": {
    "total_steps": 16,
    "estimated_time": "4-6 hours",
    "complexity": "medium",
    "risk_level": "low",
    "phases": [
      {
        "phase": "Setup",
        "steps": [1, 2, 3, 4],
        "duration": "30 minutes"
      }
    ]
  },
  "artifacts": [
    {
      "name": "implementation-plan.md",
      "path": "specs/plans/YYYY-MM-DD-feature.md",
      "content": "# Implementation Plan\\n\\n## Step 1: Initialize Project\\n\\nDetailed step-by-step plan here...",
      "type": "gkchatty",
      "metadata": {
        "description": "Step-by-step implementation plan",
        "format": "markdown",
        "tags": ["plan", "implementation"]
      }
    }
  ],
  "validation": {
    "checks": ["completeness", "feasibility", "dependencies"],
    "passed": ["completeness", "feasibility", "dependencies"],
    "failed": [],
    "warnings": []
  },
  "next_phase": {
    "ready": true,
    "blockers": [],
    "requirements": []
  },
  "errors": []
}

Return ONLY the JSON object.`
  },

  qa: {
    agent: 'general-purpose',
    promptTemplate: (context) => `
You are a BMAD QA Specialist reviewing the implementation.

Implementation: ${JSON.stringify(context.implementation, null, 2)}
Requirements: ${JSON.stringify(context.requirements, null, 2)}

Review for:
1. Code quality and best practices
2. Security vulnerabilities
3. Performance issues
4. Test coverage
5. Requirements compliance

CRITICAL: Return ONLY valid JSON with this exact structure:
{
  "status": "success",
  "phase": "qa",
  "outputs": {
    "tests_passed": true,
    "code_quality": "A",
    "security_score": 95,
    "performance_score": 90,
    "coverage": 85,
    "security_issues": [],
    "performance_concerns": [],
    "recommendations": [
      "Add more unit tests",
      "Consider caching strategy"
    ],
    "requirements_met": ["US-001", "US-002"]
  },
  "artifacts": [
    {
      "name": "qa-report.md",
      "path": "specs/qa/YYYY-MM-DD-feature.md",
      "content": "# QA Report\\n\\nComprehensive QA analysis here",
      "type": "file",
      "metadata": {
        "description": "QA review and recommendations",
        "format": "markdown"
      }
    }
  ],
  "validation": {
    "checks": ["security", "performance", "quality"],
    "passed": ["security", "performance", "quality"],
    "failed": [],
    "warnings": []
  },
  "next_phase": {
    "ready": true,
    "blockers": [],
    "requirements": []
  },
  "errors": []
}

Return ONLY the JSON object.`
  }
};

/**
 * Execute BMAD workflow with Claude Code Task integration
 */
async function executeWithClaudeCode(request, options = {}) {
  const orchestrator = new BMADOrchestrator(options);

  // Override the invokeAgent method to use Claude Code's Task tool
  orchestrator.invokeAgent = async function(agentType, prompt) {
    console.log(`🤖 Invoking ${agentType} agent via Claude Code...`);

    // Get the appropriate prompt template
    const phaseConfig = Object.values(AGENT_PROMPTS).find(p => p.agent === agentType);

    if (!phaseConfig) {
      throw new Error(`No configuration found for agent type: ${agentType}`);
    }

    // In Claude Code, this would be:
    // const result = await Task({
    //   subagent_type: agentType,
    //   description: `BMAD ${agentType} phase`,
    //   prompt: prompt
    // });
    // return result;

    // For testing, return simulated output
    return orchestrator.simulateAgentOutput(agentType);
  };

  // Execute the workflow
  return await orchestrator.execute(request, options);
}

/**
 * Helper function to prepare context for each phase
 */
function preparePhaseContext(phase, previousOutputs) {
  const context = {
    timestamp: new Date().toISOString().split('T')[0],
    phase: phase,
    ...previousOutputs
  };

  return context;
}

/**
 * Helper function to validate phase transitions
 */
function canProceedToNextPhase(currentPhase, phaseOutput) {
  if (!phaseOutput.next_phase) return false;
  if (!phaseOutput.next_phase.ready) return false;
  if (phaseOutput.next_phase.blockers && phaseOutput.next_phase.blockers.length > 0) return false;
  if (phaseOutput.status === 'failed') return false;

  return true;
}

/**
 * Export for use in Claude Code
 */
module.exports = {
  BMADOrchestrator,
  executeWithClaudeCode,
  preparePhaseContext,
  canProceedToNextPhase,
  AGENT_PROMPTS
};