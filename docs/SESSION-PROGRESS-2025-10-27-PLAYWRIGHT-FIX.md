# Session Progress: Builder Pro Stress Test & Critical Playwright Fix

**Date:** October 27, 2025
**Session Focus:** Builder Pro stress test with CommiSocial project
**Status:** Phase 1 Complete - Critical fix discovered and applied

## Executive Summary

During stress testing Builder Pro with a real-world project (CommiSocial), we discovered and fixed a critical issue with the Playwright MCP screenshot tool. The fix enables visual research in the BMAD workflow, significantly improving product brief quality.

## Critical Fix: Playwright MCP Screenshot Path Issue

### Problem Discovered
The `mcp__builder-pro-mcp__test_ui` tool was reporting success but not saving screenshots to disk.

**Root Cause:**
- The builder-pro-mcp server runs from `/opt/homebrew/bin/` (global npm install)
- Relative paths don't resolve to the project directory
- Screenshots were being "saved" to unknown locations

**Evidence:**
```bash
# Tool reports success
{
  "success": true,
  "screenshot": "specs/product-briefs/2025-10-27-commisocial/research/reddit.png"
}

# But no file exists
$ ls specs/product-briefs/2025-10-27-commisocial/research/
# Empty directory
```

### Solution Applied
Use absolute paths for all screenshot captures:

```javascript
// ❌ WRONG - Relative path
await mcp__builder-pro-mcp__test_ui({
  url: "https://example.com",
  screenshotPath: "research/screenshot.png"  // Fails silently
})

// ✅ CORRECT - Absolute path
await mcp__builder-pro-mcp__test_ui({
  url: "https://example.com",
  screenshotPath: "/Users/davidjmorin/GOLDKEY CHATTY/project/research/screenshot.png"
})
```

### Verification
```bash
# Check MCP server location
$ ps aux | grep builder-pro-mcp
/opt/homebrew/bin/builder-pro-mcp  # Global install location

# After fix with absolute paths
$ ls -la research/
-rw-r--r--  1 user  staff  72463 Oct 27 00:48 reddit-test-absolute.png  # ✅ File created
```

## Additional Fix Applied: Image Size for Claude API

We also encountered the 8000px dimension limit. Applied the ImageMagick solution from Oct 25:

```bash
# Resize images exceeding 8000px
magick discord-homepage.png -resize 1440x4000\> discord-homepage-analysis.png
magick linktree-homepage.png -resize 1440x4000\> linktree-homepage-analysis.png

# Results
Discord: 1280x7873 → 650x4000 ✅
Linktree: 1280x8849 → 579x4000 ✅
```

## CommiSocial Product Research Completed

### What We Built
**Product Brief:** 655-line comprehensive specification for CommiSocial
- Reddit-style community platform + Linktree link aggregation
- Complete database schema with RLS policies
- Visual design patterns extracted from screenshots
- Component examples with shadcn/ui
- Ready for Builder Pro implementation

### Visual Research Captured
```
specs/product-briefs/2025-10-27-commisocial/
├── product-brief.md (655 lines)
└── research/
    ├── discord-homepage-analysis.png (1.2MB - resized)
    ├── linktree-homepage-analysis.png (736KB - resized)
    ├── shadcn-main.png (265KB)
    └── [7 more screenshots]
```

### Key Patterns Extracted
- **Linktree:** Vibrant gradients, link cards, analytics
- **Discord:** Dark theme, community features, voice/video
- **shadcn/ui:** Clean components, consistent spacing
- **Reddit:** Voting system, threaded comments (from knowledge)

## Database Cleanup Completed

Earlier in session, we cleaned up GKChatty test users:

### Cleanup Results
- **Before:** 66 users (mostly test accounts from E2E testing)
- **After:** 3 users (davidmorinmusic, dev, builderpro-bmad)
- **Script Created:** `scripts/cleanup-test-users.js` for future use

Deleted:
- 42 E2E test users (e2e-test-*)
- 6 Project test users (habittracker, jamblog, etc.)
- 15 Other test users (admin, bob, jack, mcp, etc.)

## System Status for Builder Pro Testing

| Component | Status | Notes |
|-----------|--------|-------|
| GKChatty DB | ✅ Clean | Only 3 production users remain |
| Builder Pro MCP | ✅ Fixed | Screenshot paths working with absolute paths |
| Image Processing | ✅ Fixed | ImageMagick resize for >8000px images |
| Product Brief | ✅ Complete | 655 lines with visual research |
| Commands | ✅ Ready | /bmad-pro-build command available |
| Agents | ✅ Present | All 6 BMAD agents verified |

## Lessons Learned

1. **Always use absolute paths with global MCP tools**
   - Global npm installs don't share working directory
   - Relative paths fail silently

2. **Check image dimensions before Claude API**
   - Max: 8000px width or height
   - Use ImageMagick to resize: `magick input.png -resize 1440x4000\> output.png`

3. **Test with real projects reveals edge cases**
   - CommiSocial stress test found 2 critical issues
   - Both issues now documented with solutions

## Next Steps

Ready to execute Phase 2 of stress test:
```bash
/bmad-pro-build "Build CommiSocial based on specs/product-briefs/2025-10-27-commisocial/product-brief.md"
```

This will test:
- Can Builder Pro consume a 655-line product brief?
- Will visual references improve code quality?
- Can the 6-phase BMAD workflow handle a production app?
- Will the implementation match the detailed specifications?

## Files to Commit

```bash
# New files created this session
scripts/cleanup-test-users.js                    # Database cleanup utility
specs/product-briefs/2025-10-27-commisocial/    # Complete product research
docs/SESSION-PROGRESS-2025-10-27-PLAYWRIGHT-FIX.md  # This documentation
```

## Recommendations

1. **Update builder-pro-mcp README** with absolute path requirement
2. **Add path helper** to automatically resolve to project directory
3. **Include ImageMagick** in setup requirements
4. **Document the 8000px limit** in MCP tools that handle images

---

**Session Duration:** ~1.5 hours
**Issues Fixed:** 2 critical (screenshot paths, image sizing)
**Ready for:** Builder Pro stress test Phase 2
**Blockers:** None