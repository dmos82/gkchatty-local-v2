import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    // Simple menu for now
    const title = this.add.text(400, 200, 'Platform Runner', {
      fontSize: '48px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const instructions = this.add.text(400, 300, 'Click to Start', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Start game on click
    this.input.on('pointerdown', () => {
      this.scene.start('GameScene', { level: 1 });
    });
  }
}
