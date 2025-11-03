import { test, expect, Page } from '@playwright/test';

// Helper to wait for game to load
async function waitForGameLoad(page: Page) {
  await page.waitForTimeout(3000); // Wait for Phaser to initialize
}

// Helper to simulate keyboard input
async function pressKey(page: Page, key: string, duration: number = 100) {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
}

// Helper to capture console errors
function setupConsoleMonitoring(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    } else if (msg.type() === 'warning') {
      warnings.push(msg.text());
    }
  });

  return { errors, warnings };
}

test.describe('Platform Runner - Gameplay Tests', () => {
  test('should load game without errors', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/');
    await expect(page.locator('text=Platform Runner')).toBeVisible();

    // Check for console errors
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'test-results/01-homepage.png', fullPage: true });
  });

  test('should initialize Phaser game', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Check if canvas exists
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Check canvas dimensions
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    expect(canvasBox!.width).toBeGreaterThan(0);
    expect(canvasBox!.height).toBeGreaterThan(0);

    console.log('Canvas dimensions:', canvasBox);
    console.log('Console errors:', errors);

    await page.screenshot({ path: 'test-results/02-game-loaded.png', fullPage: true });
  });

  test('should navigate from menu to game', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    await page.screenshot({ path: 'test-results/03-menu-screen.png', fullPage: true });

    // Click anywhere to start game
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 400, y: 300 } });

    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/04-game-started.png', fullPage: true });

    expect(errors.filter(e => !e.includes('Failed to load resource'))).toHaveLength(0);
  });

  test('should test player movement - right arrow', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/05-before-move-right.png', fullPage: true });

    // Press right arrow
    await pressKey(page, 'ArrowRight', 500);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/06-after-move-right.png', fullPage: true });

    console.log('Player moved right - check screenshots for visual change');
    console.log('Errors during movement:', errors);
  });

  test('should test player movement - left arrow', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    // Move right first
    await pressKey(page, 'ArrowRight', 500);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/07-before-move-left.png', fullPage: true });

    // Press left arrow
    await pressKey(page, 'ArrowLeft', 500);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/08-after-move-left.png', fullPage: true });

    console.log('Player moved left - check screenshots for visual change');
  });

  test('should test player jump', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/09-before-jump.png', fullPage: true });

    // Press spacebar to jump
    await pressKey(page, 'Space', 100);
    await page.waitForTimeout(300); // Capture mid-jump

    await page.screenshot({ path: 'test-results/10-mid-jump.png', fullPage: true });

    await page.waitForTimeout(500); // Wait for landing

    await page.screenshot({ path: 'test-results/11-after-jump.png', fullPage: true });

    console.log('Player jumped - check screenshots for vertical movement');
    console.log('Errors during jump:', errors);
  });

  test('should test combined movement (run and jump)', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    // Run right and jump
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await pressKey(page, 'Space', 50);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/12-run-and-jump.png', fullPage: true });

    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/13-after-run-jump.png', fullPage: true });

    console.log('Combined movement tested');
  });

  test('should test continuous gameplay for 10 seconds', async ({ page }) => {
    const { errors, warnings } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    console.log('Starting 10-second gameplay simulation...');

    // Simulate 10 seconds of gameplay
    for (let i = 0; i < 10; i++) {
      // Random actions
      const action = Math.random();

      if (action < 0.3) {
        // Move right
        await pressKey(page, 'ArrowRight', 300);
      } else if (action < 0.6) {
        // Jump
        await pressKey(page, 'Space', 100);
      } else {
        // Move left
        await pressKey(page, 'ArrowLeft', 300);
      }

      await page.waitForTimeout(500);

      // Capture screenshot every 2 seconds
      if (i % 2 === 0) {
        await page.screenshot({
          path: `test-results/14-gameplay-${i}s.png`,
          fullPage: true
        });
      }
    }

    await page.screenshot({ path: 'test-results/15-after-10s-gameplay.png', fullPage: true });

    console.log('=== GAMEPLAY TEST COMPLETE ===');
    console.log('Total errors:', errors.length);
    console.log('Total warnings:', warnings.length);

    if (errors.length > 0) {
      console.log('Errors found:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    if (warnings.length > 0) {
      console.log('Warnings found:');
      warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    }

    // Fail test if errors (excluding asset loading errors which might be expected)
    const criticalErrors = errors.filter(e =>
      !e.includes('Failed to load resource') &&
      !e.includes('404')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should check for visual rendering issues', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Check if canvas is blank or has content
    const canvas = page.locator('canvas');
    const canvasImage = await canvas.screenshot();

    // A blank canvas would be very small in size
    console.log('Canvas screenshot size:', canvasImage.length, 'bytes');
    expect(canvasImage.length).toBeGreaterThan(1000); // Should have some content

    // Start game and check again
    await canvas.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(2000);

    const gameCanvas = await canvas.screenshot();
    console.log('Game canvas screenshot size:', gameCanvas.length, 'bytes');
    expect(gameCanvas.length).toBeGreaterThan(1000);

    // The sizes should be different (menu vs game)
    expect(Math.abs(canvasImage.length - gameCanvas.length)).toBeGreaterThan(100);
  });

  test('should detect collision issues', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    console.log('Testing collision detection by running into platforms...');

    // Try to walk off platform (should not fall through)
    for (let i = 0; i < 20; i++) {
      await pressKey(page, 'ArrowRight', 50);
      await page.waitForTimeout(50);
    }

    await page.screenshot({ path: 'test-results/16-collision-test.png', fullPage: true });

    // Check for physics errors
    const physicsErrors = errors.filter(e =>
      e.includes('physics') ||
      e.includes('collision') ||
      e.includes('body')
    );

    console.log('Physics/collision errors:', physicsErrors);
    expect(physicsErrors).toHaveLength(0);
  });

  test('should test enemy interaction', async ({ page }) => {
    const { errors } = setupConsoleMonitoring(page);

    await page.goto('/game');
    await waitForGameLoad(page);

    // Start game
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/17-before-enemy-interaction.png', fullPage: true });

    // Run towards enemies
    console.log('Running towards enemies to test collision...');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000); // Should hit enemy
    await page.keyboard.up('ArrowRight');

    await page.screenshot({ path: 'test-results/18-after-enemy-interaction.png', fullPage: true });

    console.log('Enemy interaction test complete');
  });
});
