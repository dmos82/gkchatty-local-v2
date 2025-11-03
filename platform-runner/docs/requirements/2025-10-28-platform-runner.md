# Platform Runner - Requirements Document

## Project Overview

**Project Name:** Platform Runner

**Description:** A Mario-style 2D side-scrolling platformer game built with Phaser 3 game engine embedded in a Next.js 15 + TypeScript application. The game features AI-generated pixel art sprites created using PixelLab MCP tools. Players control a character navigating through 3 progressively challenging levels, collecting coins, avoiding enemies, and reaching goals with smooth physics-based movement.

**Target Platform:** Web (desktop browsers)

**Technology Stack:**
- Framework: Next.js 15
- Language: TypeScript
- Game Engine: Phaser 3
- Asset Generation: PixelLab MCP

**Scope:** MVP (Minimum Viable Product)

---

## User Stories

### US-001: Player Movement Controls
**As a** player
**I want to** control a character with arrow keys (left, right, jump)
**So that** I can navigate through the platformer levels with responsive controls

**Priority:** High
**Acceptance Criteria:**
- Left/Right arrow keys move player horizontally
- Spacebar or Up arrow triggers jump
- Input response time < 16ms (60 FPS)
- Movement speed: 150-200 px/s
- Jump height: 150-250 px

---

### US-002: Animated Character Sprites
**As a** player
**I want to** see smooth 4-directional animated sprites (idle, walk left, walk right, jump)
**So that** the character movement feels polished and alive

**Priority:** High
**Acceptance Criteria:**
- Idle animation (2-4 frames, loops)
- Walk left animation (4-6 frames, loops)
- Walk right animation (4-6 frames, loops)
- Jump animation (2-4 frames, plays once)
- Sprite size: 32x32px or 64x64px
- Animation frame rate: 8-12 FPS
- All sprites generated via PixelLab MCP

---

### US-003: Physics-Based Jumping
**As a** player
**I want to** jump with realistic physics (gravity, velocity, double-jump prevention)
**So that** platforming feels challenging and predictable

**Priority:** High
**Acceptance Criteria:**
- Gravity: 800-1200 px/s²
- Jump velocity: -500 to -700 px/s
- No double-jumping (grounded check required)
- Variable jump height (hold jump key = higher jump)
- Coyote time: 100-150ms (grace period after leaving platform)

---

### US-004: Coin Collection System
**As a** player
**I want to** collect coins scattered throughout levels
**So that** I can increase my score and feel progression

**Priority:** Medium
**Acceptance Criteria:**
- 10-20 coins per level
- Coin sprite: animated (3-4 frames rotation)
- Collision detection removes coin and updates score
- Each coin worth +10 points
- Coin sprite generated via PixelLab MCP

---

### US-005: Score Display
**As a** player
**I want to** see a score display on screen
**So that** I can track my coin collection in real-time

**Priority:** Medium
**Acceptance Criteria:**
- Score displayed in top-left corner
- Format: "Score: XXX"
- Font size: 24px, readable contrast
- Updates immediately on coin collection
- Persists across levels (cumulative score)

---

### US-006: Enemy Characters
**As a** player
**I want to** encounter enemy sprites that move in patterns
**So that** the game has challenge and requires timing

**Priority:** High
**Acceptance Criteria:**
- At least 2 enemy types with distinct sprites
- Enemy Type 1: Patrol (moves left-right between waypoints)
- Enemy Type 2: Stationary or simple AI
- Enemy sprites: 32x32px, animated (2-4 frames)
- Enemy movement speed: 50-100 px/s
- All enemy sprites generated via PixelLab MCP

---

### US-007: Death and Respawn System
**As a** player
**I want to** die and respawn when touching enemies
**So that** mistakes have consequences but I can retry immediately

**Priority:** High
**Acceptance Criteria:**
- Player-enemy collision triggers death
- Death animation (optional, 0.5s fade or explosion)
- Respawn at level start position
- Score resets to 0 for current level
- 1-second delay before respawn

---

### US-008: Multi-Level Progression
**As a** player
**I want to** play through 3 distinct levels with increasing difficulty
**So that** I have a complete game experience with progression

**Priority:** High
**Acceptance Criteria:**
- Level 1: Tutorial (5 enemies, simple layout, 10 coins)
- Level 2: Moderate (8 enemies, medium layout, 15 coins)
- Level 3: Hard (12 enemies, complex layout, 20 coins)
- Level transitions automatically on reaching goal
- Each level has unique platform layout
- "Level Complete" screen displays for 2 seconds

---

### US-009: PixelLab Sprite Generation
**As a** developer
**I want to** generate all sprites using PixelLab MCP during Phase 4
**So that** the game has consistent, high-quality pixel art without manual asset creation

**Priority:** Critical
**Acceptance Criteria:**
- Player sprites: 4 animation sets (idle, walk-left, walk-right, jump)
- Enemy sprites: 2 types with animations
- Coin sprite: 1 animated sprite (3-4 frames)
- Platform tiles: 3 variations (ground, floating, edge)
- Background: 1 sky/background sprite
- All sprites 32x32px or 64x64px
- Consistent pixel art style and color palette
- Prompts documented for reproducibility

---

### US-010: Performance Optimization
**As a** player
**I want to** the game to run at 60 FPS with no lag on modern browsers
**So that** gameplay feels smooth and responsive

**Priority:** High
**Acceptance Criteria:**
- Stable 60 FPS during gameplay
- No frame drops during sprite animations
- Memory usage < 200MB
- No memory leaks during 10-minute session (< 50MB growth)
- Compatible with Chrome, Firefox, Safari (latest 2 versions)

---

## Acceptance Criteria (Consolidated)

### Functional Requirements
1. **Player Controls:**
   - Arrow keys (left, right) for horizontal movement
   - Spacebar or Up arrow for jumping
   - Input latency < 16ms

2. **Player Animations:**
   - 4 animation states: idle, walk-left, walk-right, jump
   - Minimum 4 frames per walk cycle
   - Smooth transitions between states

3. **Physics System:**
   - Gravity: 800-1200 px/s²
   - Jump velocity: -500 to -700 px/s
   - No double-jumping (grounded state check)
   - Coyote time: 100-150ms

4. **Collision Detection:**
   - Player-platform (prevents falling through)
   - Player-enemy (triggers death)
   - Player-coin (adds to score, removes coin)
   - Pixel-perfect accuracy

5. **Enemy AI:**
   - Type 1: Patrol between waypoints (left-right)
   - Type 2: Stationary or simple behavior
   - Collision with player = player death

6. **Score System:**
   - +10 points per coin collected
   - Display in top-left corner
   - Cumulative across levels
   - Resets on level death

7. **Level Design:**
   - Level 1: 15-20 platforms, 10 coins, 5 enemies (tutorial)
   - Level 2: 20-25 platforms, 15 coins, 8 enemies (moderate)
   - Level 3: 25-30 platforms, 20 coins, 12 enemies (hard)
   - Each level has start position and goal flag

8. **Level Progression:**
   - Reaching goal triggers level complete
   - 2-second "Level Complete" screen
   - Auto-transition to next level
   - Final level shows "Game Complete"

### Technical Requirements
1. **Technology Stack:**
   - Next.js 15 with TypeScript
   - Phaser 3 game engine
   - PixelLab MCP for sprite generation

2. **Performance:**
   - 60 FPS stable frame rate
   - < 200MB memory usage
   - < 50MB memory growth in 10 minutes
   - Game loads within 3 seconds

3. **Sprites (PixelLab Generated):**
   - Player: 4 animation sets (idle, walk-left, walk-right, jump)
   - Enemies: 2 types with animations
   - Coins: 1 animated sprite (3-4 frames)
   - Platforms: 3 tile variations
   - Background: 1 sprite
   - All 32x32px or 64x64px
   - Consistent pixel art style

4. **Viewport:**
   - 800x600px fixed resolution
   - Embedded in Next.js page
   - Responsive canvas scaling (optional stretch goal)

5. **Code Quality:**
   - TypeScript: 0 compilation errors
   - ESLint: 0 critical warnings
   - Modular architecture (scenes, sprites, physics)

---

## Technical Constraints

1. **Must use Phaser 3** for all game logic, rendering, and physics
2. **Must use Next.js 15 + TypeScript** for project structure
3. **All sprites must be generated via PixelLab MCP** (no external assets)
4. **Client-side only** (no backend, no database, no save system)
5. **Keyboard controls only** (no mobile/touch support in MVP)
6. **Desktop browsers only** (Chrome, Firefox, Safari - latest 2 versions)
7. **Fixed 800x600px viewport** (no responsive design in MVP)
8. **Pixel art style enforced** (32x32px or 64x64px sprites)
9. **No audio/music** in MVP (sound effects out of scope)
10. **No multiplayer** or online features in MVP

---

## Success Metrics

### Performance Metrics
1. **Frame Rate:** Stable 60 FPS during gameplay (measured via Phaser debugger)
2. **Input Latency:** < 16ms response time (frame-perfect controls)
3. **Load Time:** Game loads within 3 seconds on broadband
4. **Memory:** < 200MB peak usage, < 50MB growth over 10 minutes

### Quality Metrics
1. **Bug Count:** 0 critical bugs (crashes, game-breaking) after Phase 5 QA
2. **TypeScript Errors:** 0 compilation errors
3. **ESLint Warnings:** 0 critical warnings
4. **Code Coverage:** 80%+ test coverage (unit tests for game logic)

### User Experience Metrics
1. **Completability:** All 3 levels completable by playtester in < 10 minutes total
2. **Tutorial Effectiveness:** Level 1 completable in < 2 minutes on first attempt
3. **Sprite Quality:** PixelLab generates all required sprites (10+ unique assets)
4. **Animation Smoothness:** No frame drops or jittery animations

### Development Metrics
1. **Sprite Generation Success:** 100% sprite generation via PixelLab (no fallback to manual assets)
2. **Phase Completion:** All BMAD phases (0-5) complete with documentation
3. **Validation Pass:** Passes Phase 5 Playwright testing and orchestrate_build

---

## Out of Scope (Post-MVP)

1. **Audio/Music:** Sound effects, background music, audio engine integration
2. **Mobile Support:** Touch controls, responsive design, mobile optimization
3. **Save System:** Local storage, progress saving, high scores persistence
4. **Advanced Enemies:** AI pathfinding, multiple attack patterns, boss fights
5. **Power-ups:** Items, abilities, character upgrades
6. **Level Editor:** In-game level creation tools
7. **Multiplayer:** Online co-op, leaderboards, real-time multiplayer
8. **Cutscenes:** Story elements, dialogue, narrative progression
9. **Alternative Characters:** Character selection, skins, customization
10. **Advanced Physics:** Slopes, moving platforms, water mechanics

---

## Dependencies

1. **PixelLab MCP Server:** Must be running and accessible during Phase 4
2. **Next.js 15:** Project initialized with TypeScript template
3. **Phaser 3:** Latest stable version (3.80.x or higher)
4. **Node.js:** v18.x or higher
5. **Browser Compatibility:** Chrome 120+, Firefox 120+, Safari 17+

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| PixelLab sprite generation fails | High | Medium | Have fallback prompts, test MCP early in Phase 4 |
| Performance < 60 FPS | High | Low | Optimize sprite count, use object pooling |
| Physics bugs (clipping, stuck) | Medium | Medium | Thorough testing in Phase 5, use Phaser Arcade Physics |
| Scope creep (audio, mobile) | Medium | Medium | Strict adherence to requirements doc, defer to post-MVP |
| Level design too easy/hard | Low | Medium | Playtesting in Phase 5, adjust enemy count/layout |

---

## Deliverables

### Phase 0: Requirements (This Document)
- [x] requirements.md (this document)
- [x] User stories (10 stories)
- [x] Acceptance criteria (functional + technical)
- [x] Success metrics

### Phase 1: Architecture
- [ ] architecture.md (system design, component diagram)
- [ ] Technology stack justification
- [ ] File structure

### Phase 2: Discovery
- [ ] Project scaffolding (Next.js + Phaser setup)
- [ ] PixelLab MCP integration test
- [ ] Phaser scene boilerplate

### Phase 3: Planning
- [ ] implementation-plan.md (16 steps)
- [ ] Task breakdown with time estimates

### Phase 4: Implementation
- [ ] All game code (player, enemies, physics, levels)
- [ ] All sprites generated via PixelLab
- [ ] 3 playable levels

### Phase 5: QA
- [ ] Playwright test report
- [ ] Bug report
- [ ] orchestrate_build validation

---

## Approval

**Product Owner:** [AI Agent]
**Date:** 2025-10-28
**Status:** Draft - Pending User Approval

---

*This requirements document follows the BMAD methodology and is optimized for /bmad-pro-build workflow execution.*