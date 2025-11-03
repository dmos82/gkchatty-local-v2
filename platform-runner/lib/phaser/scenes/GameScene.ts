import Phaser from 'phaser';
import Player from '../entities/Player';

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private currentLevel: number = 1;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { level: number }) {
    this.currentLevel = data.level || 1;
    this.score = this.registry.get('score') || 0;
  }

  create() {
    // Set background color
    this.cameras.main.setBackgroundColor('#87CEEB');

    // Create platforms
    this.platforms = this.physics.add.staticGroup();

    // Ground
    for (let x = 0; x < 800; x += 32) {
      this.platforms.create(x + 16, 580, 'platform-grass');
    }

    // Create level platforms based on current level
    this.createLevelPlatforms();

    // Create player
    this.player = new Player(this, 100, 450);

    // Create coins
    this.coins = this.physics.add.group();
    this.createCoins();

    // Create enemies
    this.enemies = this.physics.add.group();
    this.createEnemies();

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin as any, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy as any, undefined, this);

    // Score text
    this.scoreText = this.add.text(16, 16, `Score: ${this.score}`, {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 },
    });

    // Level text
    this.add.text(400, 16, `Level ${this.currentLevel}`, {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0);

    // Goal flag - FIXED: Added stroke and made it stand out
    const goal = this.add.rectangle(750, 520, 30, 80, 0x00ff00);
    goal.setStrokeStyle(3, 0x00aa00); // Dark green border
    goal.setOrigin(0.5);
    this.physics.add.existing(goal);
    const goalBody = goal.body as Phaser.Physics.Arcade.Body;
    goalBody.setAllowGravity(false); // Don't let flag fall
    this.physics.add.overlap(this.player, goal, this.reachGoal as any, undefined, this);

    // Add flag pole for better visibility
    const pole = this.add.rectangle(750, 565, 5, 130, 0x8b4513);
    pole.setOrigin(0.5, 1);
  }

  update() {
    this.player.update();

    // Enemy simple AI (patrol)
    this.enemies.children.entries.forEach((enemy: any) => {
      if (enemy.body.velocity.x === 0) {
        enemy.setVelocityX(enemy.getData('direction') === 'left' ? -50 : 50);
      }
      if (enemy.body.touching.right) {
        enemy.setVelocityX(-50);
        enemy.setData('direction', 'left');
      } else if (enemy.body.touching.left) {
        enemy.setVelocityX(50);
        enemy.setData('direction', 'right');
      }
    });
  }

  private createLevelPlatforms() {
    const platforms = [
      // Level 1 platforms
      [
        { x: 200, y: 450 },
        { x: 350, y: 400 },
        { x: 500, y: 350 },
        { x: 650, y: 300 },
      ],
      // Level 2 platforms (more challenging)
      [
        { x: 150, y: 480 },
        { x: 300, y: 420 },
        { x: 450, y: 360 },
        { x: 550, y: 300 },
        { x: 680, y: 250 },
      ],
      // Level 3 platforms (most challenging)
      [
        { x: 120, y: 500 },
        { x: 240, y: 440 },
        { x: 360, y: 380 },
        { x: 480, y: 320 },
        { x: 600, y: 260 },
        { x: 720, y: 200 },
      ],
    ];

    const levelPlatforms = platforms[this.currentLevel - 1] || platforms[0];
    levelPlatforms.forEach(({ x, y }) => {
      const tile = this.currentLevel === 3 ? 'platform-stone' : 'platform-grass';
      this.platforms.create(x, y, tile);
    });
  }

  private createCoins() {
    const coinPositions = [
      { x: 200, y: 400 },
      { x: 350, y: 350 },
      { x: 500, y: 300 },
      { x: 650, y: 250 },
      { x: 400, y: 500 },
    ];

    coinPositions.forEach(({ x, y }) => {
      const coin = this.coins.create(x, y, 'coin');
      coin.setScale(0.75);
      coin.body.setAllowGravity(false);
    });
  }

  private createEnemies() {
    const enemyCount = this.currentLevel + 1;
    for (let i = 0; i < enemyCount; i++) {
      const x = 250 + i * 150;
      const enemy = this.enemies.create(x, 520, 'enemy-goomba');
      enemy.setBounce(0.2);
      enemy.setCollideWorldBounds(true);
      enemy.setVelocityX(50);
      enemy.setData('direction', 'right');
    }
  }

  private collectCoin(player: Player, coin: Phaser.GameObjects.GameObject) {
    (coin as Phaser.Physics.Arcade.Sprite).disableBody(true, true);
    this.score += 10;
    this.registry.set('score', this.score);
    this.scoreText.setText(`Score: ${this.score}`);
  }

  private hitEnemy(player: Player, enemy: Phaser.GameObjects.GameObject) {
    player.die();
    this.physics.pause();
    this.time.delayedCall(1000, () => {
      this.scene.start('GameOverScene', { score: this.score });
    });
  }

  private reachGoal() {
    this.physics.pause();
    if (this.currentLevel < 3) {
      this.time.delayedCall(1000, () => {
        this.scene.start('GameScene', { level: this.currentLevel + 1 });
      });
    } else {
      this.time.delayedCall(1000, () => {
        this.scene.start('GameOverScene', { score: this.score, victory: true });
      });
    }
  }
}
