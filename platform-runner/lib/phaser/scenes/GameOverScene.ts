import Phaser from 'phaser';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { score?: number; victory?: boolean }) {
    this.registry.set('finalScore', data.score || 0);
    this.registry.set('victory', data.victory || false);
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    const victory = this.registry.get('victory');
    const score = this.registry.get('finalScore');

    // Title
    const titleText = victory ? 'Victory!' : 'Game Over';
    const titleColor = victory ? '#00ff00' : '#ff0000';

    this.add.text(400, 200, titleText, {
      fontSize: '64px',
      color: titleColor,
    }).setOrigin(0.5);

    // Score
    this.add.text(400, 300, `Final Score: ${score}`, {
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Message
    const message = victory
      ? 'You completed all 3 levels!'
      : 'Better luck next time!';

    this.add.text(400, 370, message, {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Restart instruction
    this.add.text(400, 450, 'Click to Play Again', {
      fontSize: '24px',
      color: '#ffff00',
    }).setOrigin(0.5);

    // Restart on click
    this.input.on('pointerdown', () => {
      this.registry.set('score', 0);
      this.scene.start('MenuScene');
    });
  }
}
