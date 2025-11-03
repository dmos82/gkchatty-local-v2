'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import BootScene from '@/lib/phaser/scenes/BootScene';
import MenuScene from '@/lib/phaser/scenes/MenuScene';
import GameScene from '@/lib/phaser/scenes/GameScene';
import GameOverScene from '@/lib/phaser/scenes/GameOverScene';

export default function GamePage() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // Only initialize Phaser on client-side
    if (typeof window !== 'undefined' && !gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'phaser-game',
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 800 },
            debug: false,
          },
        },
        scene: [BootScene, MenuScene, GameScene, GameOverScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      };

      gameRef.current = new Phaser.Game(config);
    }

    // Cleanup on unmount
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div id="phaser-game" />
      <div className="mt-4 text-white text-sm">
        <p>Controls: Arrow Keys to Move, Spacebar to Jump</p>
      </div>
    </div>
  );
}
