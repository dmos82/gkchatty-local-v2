import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Display loading text
    const loadingText = this.add.text(400, 300, 'Loading...', {
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Load player sprites (48x48px)
    this.load.image('player-idle', '/assets/sprites/player-idle.png');
    this.load.image('player-walk-left', '/assets/sprites/player-walk-left.png');
    this.load.image('player-walk-right', '/assets/sprites/player-walk-right.png');
    this.load.image('player-jump', '/assets/sprites/player-jump.png');

    // Load enemy sprites (32x32px)
    this.load.image('enemy-goomba', '/assets/sprites/enemy-goomba.png');
    this.load.image('enemy-flying', '/assets/sprites/enemy-flying.png');

    // Load collectible sprites (32x32px)
    this.load.image('coin', '/assets/sprites/coin.png');

    // Load platform tiles (32x32px)
    this.load.image('platform-grass', '/assets/tiles/platform-grass.png');
    this.load.image('platform-stone', '/assets/tiles/platform-stone.png');
  }

  create() {
    // Once assets are loaded, transition to MenuScene
    this.scene.start('MenuScene');
  }
}
