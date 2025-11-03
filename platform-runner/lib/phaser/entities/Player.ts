import Phaser from 'phaser';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private currentSprite: string = 'player-idle';
  private isJumping: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-idle');

    // Add to scene
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Configure physics
    this.setCollideWorldBounds(true);
    this.setBounce(0.2);
    this.setGravityY(300);

    // Setup input
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
    }
  }

  update() {
    if (!this.cursors || !this.body) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    // Horizontal movement
    if (this.cursors.left.isDown) {
      this.setVelocityX(-160);
      this.setTexture('player-walk-left');
      this.currentSprite = 'player-walk-left';
    } else if (this.cursors.right.isDown) {
      this.setVelocityX(160);
      this.setTexture('player-walk-right');
      this.currentSprite = 'player-walk-right';
    } else {
      this.setVelocityX(0);
      if (!this.isJumping) {
        this.setTexture('player-idle');
        this.currentSprite = 'player-idle';
      }
    }

    // Jumping
    if (this.cursors.up.isDown && body.touching.down) {
      this.setVelocityY(-500);
      this.setTexture('player-jump');
      this.currentSprite = 'player-jump';
      this.isJumping = true;
    }

    // Check if landed
    if (body.touching.down && this.isJumping) {
      this.isJumping = false;
    }
  }

  die() {
    // Handle player death
    this.setTint(0xff0000);
    this.setVelocity(0, -200);
    this.disableBody(true, false);
  }
}
