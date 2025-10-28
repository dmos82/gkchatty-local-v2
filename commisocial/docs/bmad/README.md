# BMAD Documentation

**Last Updated:** 2025-10-28
**Version:** 2.0 (Post-Optimization)

## Quick Links

- 📖 [Complete Guide](BMAD-COMPLETE-GUIDE.md) - Everything about BMAD workflow
- 🔧 [MCP Tools Status](MCP-TOOLS-STATUS.md) - Builder Pro MCP tools reference
- ⚙️  [Project Configuration Template](../../.bmad/project-config.yml) - Config file structure
- 📋 [BMAD Command](../../../.claude/commands/bmad-pro-build.md) - Slash command source

---

## What is BMAD?

BMAD (Builder Master Agentic Development) is a complete SDLC automation system that takes a feature request and produces production-ready code through 6 orchestrated phases:

1. **Phase 0: Requirements** - Product Owner creates user stories
2. **Phase 1: Architecture** - Architect designs system
3. **Phase 2: Discovery** - Scout analyzes codebase + GKChatty history
4. **Phase 3: Planning** - Planner creates implementation plan → uploads to GKChatty
5. **Phase 4: Implementation** - Builder executes with RAG pattern (2K tokens/step)
6. **Phase 5: QA Review** - 7-phase validation workflow + user approval

---

## Recent Audits & Reports

### 2025-10-28 Optimization
- [Workflow Audit](../audits/2025-10-28-bmad-workflow-audit.md) - Comprehensive analysis (14 findings)
- [Optimization Plan](../plans/2025-10-28-bmad-workflow-optimization.md) - 5-phase improvement plan
- [MCP Tools Status](MCP-TOOLS-STATUS.md) - Validation results (6/11 tested ✅)

### Session History
- [2025-10-27 GKChatty User Enforcement](../sessions/2025-10-27-gkchatty-user-enforcement-fix.md) - Knowledge isolation fix
- [2025-10-28 Builder Pro Optimization](../sessions/2025-10-28-builder-pro-optimization.md) - Workflow consolidation

---

## Configuration

### Project Configuration
Every BMAD project should have `.bmad/project-config.yml`:

```yaml
project:
  name: your-project-name
  type: nextjs-supabase

gkchatty:
  user: your-project-name
  password: your-project-name123!
  enforce_project_user: true

validation:
  require_tests: true
  playwright_tests: true
  orchestrate_build: true
```

### GKChatty User Isolation
**CRITICAL:** Each project must use its own GKChatty user for knowledge isolation:
- ✅ Project: commisocial → User: `commisocial`
- ✅ Project: devblog → User: `devblog`
- ❌ NEVER upload project docs to `dev` user (reserved for meta-work)

---

## When to Use BMAD

### Decision Matrix

| Factor | Manual | BMAD |
|--------|--------|------|
| **Time** | < 1 hour | 1+ hours |
| **User stories** | 1-2 | 3+ |
| **Documentation** | None | Requirements + Architecture + Plan |
| **Security** | Basic | Enterprise (RBAC, MFA, audit logs) |

### Examples

**✅ Use BMAD for:**
- Admin user management with RBAC
- Complete blog platform with auth, posts, comments
- Real-time chat system with WebSockets
- Payment integration with Stripe

**❌ Don't use BMAD for:**
- Fix typo in header
- Add dark mode toggle button
- Simple signup form with email validation

---

## Key Features

### 92% Token Efficiency
Phase 4 uses RAG pattern:
- Query GKChatty step-by-step: "What is step 5 of the plan?"
- Execute only that step
- Test → Query next step → Repeat
- **Result:** 2K tokens per step (vs 50K reading full plan)

### 7-Phase Validation Workflow
Phase 5 automatically runs:
1. **Phase 2A:** Visual load testing (every page)
2. **Phase 2B:** Interactive testing (forms, buttons) ⭐
3. **Phase 2C:** User flow testing (smoke tests) ⭐
4. **Phase 3:** orchestrate_build (full validation)
5. **Phase 4-6:** Iterative fixing (max 3 iterations)
6. **Phase 7:** User approval gate (mandatory)

**Cannot mark project complete without user approval.**

### Builder Pro MCP Tools
6 validated tools (all critical ones working ✅):
- `review_file` - ESLint code review
- `security_scan` - OWASP vulnerability detection
- `test_ui` - Playwright UI testing
- `orchestrate_build` - Full project validation
- `switch_user` - GKChatty user management
- `upload_to_gkchatty` - Document upload

---

## Usage

### Invoke BMAD Workflow
```bash
/bmad-pro-build "feature description"
```

**Example:**
```bash
/bmad-pro-build "Add admin user management with RBAC, audit logs, and password reset"
```

### What Happens Next
1. Product Owner creates 8 user stories → `specs/user-stories/[date]-[name].md`
2. Architect designs system → `specs/architecture/[date]-[name].md`
3. Scout discovers relevant files + GKChatty context
4. Planner creates plan → `specs/plans/[date]-[name].md` → uploads to GKChatty
5. Builder executes with RAG queries (2K tokens/step)
6. QA validates with 7-phase workflow → presents to user
7. **YOU approve** → Project marked complete ✅

---

## Troubleshooting

### Common Issues

**Q: "Implementation complete but not tested?"**
A: Phase 5 validation is now mandatory. Cannot skip to "MVP complete" without user approval.

**Q: "GKChatty returning wrong context?"**
A: Check `.bmad/project-config.yml` - verify `gkchatty.user` matches project name. Switch user before upload.

**Q: "Phase 4 using too many tokens?"**
A: RAG pattern should use 2K/step. If reading full plan, implementation plan may not be uploaded to GKChatty.

**Q: "MCP tools not working?"**
A: See [MCP-TOOLS-STATUS.md](MCP-TOOLS-STATUS.md) for validation status. All critical tools tested ✅.

---

## Contributing

### Report Issues
- Found a bug in BMAD workflow? Document in `docs/audits/`
- Suggest improvement? Create plan in `docs/plans/`

### Session Documentation
When making significant changes to BMAD, document in `docs/sessions/[date]-[description].md`

---

## Related Documentation

### Global Configuration
- `/Users/davidjmorin/.claude/CLAUDE.md` - SuperClaude configuration
- `/Users/davidjmorin/.claude/commands/bmad-pro-build.md` - BMAD workflow source

### Project Docs
- `docs/audits/` - Workflow audits
- `docs/plans/` - Optimization plans
- `docs/sessions/` - Session progress documentation
- `docs/validation/` - Test reports

---

**Built with:** SuperClaude + Builder Pro BMAD
**Pattern:** RAG-driven step-by-step execution
**Status:** ✅ Production Ready (validated 2025-10-28)
