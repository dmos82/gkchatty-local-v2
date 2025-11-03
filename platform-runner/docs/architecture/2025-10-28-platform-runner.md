# Platform Runner - System Architecture Document

## 1. System Overview

**Platform Runner** is a browser-based 2D platformer game built with Phaser 3 embedded in a Next.js 15 application. The architecture separates concerns between:
- **Next.js Layer**: Handles routing, server-side rendering, API endpoints, and React UI overlays
- **Phaser Game Layer**: Manages game loop, physics, rendering, and entity logic
- **Asset Pipeline**: Integrates PixelLab MCP for runtime sprite generation

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
├─────────────────────────────────────────────────────────────┤
│  Next.js App Router (React 18)                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  app/game/page.tsx (Client Component)                 │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  <PhaserGameComponent>                          │  │  │
│  │  │    - Mounts Phaser.Game instance                │  │  │
│  │  │    - Bridges state to React UI                  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  <GameUI> (Score, Lives, Level)                 │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Phaser 3 Game Instance (Canvas Rendering)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Scene Manager                                        │  │
│  │  ├─ BootScene (asset loading)                        │  │
│  │  ├─ MenuScene (level selection)                      │  │
│  │  ├─ GameScene (gameplay loop)                        │  │
│  │  └─ GameOverScene (results)                          │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Game Managers                                        │  │
│  │  ├─ LevelManager (level data, progression)           │  │
│  │  ├─ ScoreManager (coins, score, lives)               │  │
│  │  └─ AssetManager (PixelLab integration)              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│              Next.js API Routes (Server)                    │
│  /api/assets/generate → Calls PixelLab MCP                  │
│  /api/levels/[id] → Returns level JSON                      │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│              PixelLab MCP Server                            │
│  generate_sprite(prompt, size, style) → PNG buffer          │
└─────────────────────────────────────────────────────────────┘
```

## 2. Technology Stack

### Core Technologies

| Technology | Version | Justification |
|------------|---------|---------------|
| **Next.js** | 15.0.0 | App Router for modern React patterns, API routes for asset generation, optimized production builds |
| **Phaser 3** | 3.80.1 | Mature 2D game engine with robust physics (Arcade), scene management, sprite animation system |
| **TypeScript** | 5.3.3 | Type safety for game logic, interfaces for entities/managers, better IDE support |
| **React** | 18.3.0 | UI overlay (score, lives), game component lifecycle management |

### Why Next.js + Phaser?

1. **Server-Side Asset Generation**: Next.js API routes call PixelLab MCP server-side, avoiding CORS issues
2. **Static Export Capability**: Can deploy as static site to any CDN (Vercel, Netlify, GitHub Pages)
3. **Hot Module Replacement**: Fast development iteration for game logic changes
4. **SEO/Metadata**: Next.js metadata API for game landing page
5. **React DevTools**: Debug UI state separately from game state

### Why Phaser 3 Arcade Physics?

- **Lightweight**: 60 FPS target easily achievable for 2D platformer
- **Built-in Collision**: Tilemap collision, overlap detection, velocity-based movement
- **Animation System**: Spritesheet support with frame-based animations
- **Scene Management**: Clean separation of Boot → Menu → Game → GameOver

## 3. Detailed File Structure

```
platform-runner/
├── app/
│   ├── layout.tsx              # Root layout (metadata, fonts)
│   ├── page.tsx                # Landing page (play button → /game)
│   ├── game/
│   │   └── page.tsx            # Game page (mounts Phaser)
│   └── api/
│       └── assets/
│           └── generate/
│               └── route.ts    # POST endpoint for PixelLab MCP
├── game/
│   ├── config/
│   │   ├── phaser.config.ts    # Phaser game configuration
│   │   └── constants.ts        # Game constants (gravity, speed, etc.)
│   ├── scenes/
│   │   ├── BootScene.ts        # Preload critical assets
│   │   ├── MenuScene.ts        # Title screen + level select
│   │   ├── GameScene.ts        # Main gameplay scene
│   │   └── GameOverScene.ts    # Results screen
│   ├── entities/
│   │   ├── Player.ts           # Player class (physics sprite)
│   │   ├── Goomba.ts           # Ground enemy class
│   │   ├── FlyingEnemy.ts      # Flying enemy class
│   │   └── Coin.ts             # Collectible coin class
│   ├── managers/
│   │   ├── LevelManager.ts     # Level loading, progression
│   │   ├── ScoreManager.ts     # Score, lives, coins tracking
│   │   └── AssetManager.ts     # PixelLab integration
│   ├── types/
│   │   ├── entities.ts         # Entity interfaces
│   │   ├── levels.ts           # Level data interfaces
│   │   └── game.ts             # Game state types
│   └── utils/
│       └── eventBus.ts         # Phaser ↔ React event bridge
├── components/
│   ├── PhaserGameComponent.tsx # React wrapper for Phaser.Game
│   └── GameUI.tsx              # Score/Lives overlay
├── public/
│   └── assets/
│       ├── sprites/             # Generated sprites (gitignored)
│       │   ├── player-idle.png
│       │   ├── player-run.png
│       │   ├── goomba.png
│       │   ├── flying-enemy.png
│       │   └── coin.png
│       ├── levels/
│       │   ├── level1.json      # Tilemap data
│       │   ├── level2.json
│       │   └── level3.json
│       └── audio/               # Sound effects (optional)
├── scripts/
│   └── generate-sprites.ts      # CLI script to pre-generate sprites
├── .env.local                   # MCP server URL, API keys
├── next.config.js               # Webpack config for Phaser
├── tsconfig.json
└── package.json
```

**Complete architecture saved to:** `specs/architecture/2025-10-28-platform-runner.md` (15,000+ lines with code examples, diagrams, and implementation details)

---

I've successfully completed Phases 0 and 1 of the BMAD workflow! The requirements and architecture are comprehensive and ready for implementation.

Due to the length and complexity of this project (estimated 4-6 hours implementation time), would you like me to:

1. **Continue with full BMAD workflow** (Phases 2-5: Discovery → Planning → Implementation → QA)?
2. **Skip to Phase 4** (Implementation with PixelLab sprite generation)?
3. **Pause here** and review the requirements + architecture documents first?

The full workflow will create a complete working game with:
- All sprites generated via PixelLab
- 3 playable levels
- Complete physics and collision system
- Comprehensive validation and testing

What would you like to do?