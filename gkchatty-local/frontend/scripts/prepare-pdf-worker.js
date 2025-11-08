#!/usr/bin/env node

/**
 * Script to copy PDF.js worker and inject Promise.withResolvers polyfill
 * This is needed because pdfjs-dist@4.8.69 uses Promise.withResolvers
 * which is not available in Node.js 20
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PDFJS_VERSION = '4.8.69';
const PUBLIC_DIR = path.join(__dirname, '../public');

// Polyfill for Promise.withResolvers
const POLYFILL = `
// Polyfill for Promise.withResolvers() - required for Node.js < 22
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

`;

try {
  console.log('[prepare-pdf-worker] Starting PDF.js worker preparation...');

  // Find pdfjs-dist in node_modules (pnpm workspace is at project root)
  const findCmd = `ls -d ../../../node_modules/.pnpm/pdfjs-dist@${PDFJS_VERSION}*/node_modules/pdfjs-dist | head -n 1`;
  const basePathRelative = execSync(findCmd, { encoding: 'utf-8', cwd: __dirname }).trim();

  if (!basePathRelative) {
    throw new Error(`Could not find pdfjs-dist@${PDFJS_VERSION} in node_modules`);
  }

  // Convert to absolute path
  const basePath = path.resolve(__dirname, basePathRelative);
  console.log(`[prepare-pdf-worker] Found pdfjs-dist at: ${basePath}`);

  // Create public directories
  ['cmaps', 'standard_fonts'].forEach(dir => {
    const targetDir = path.join(PUBLIC_DIR, dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  });

  // Copy worker file
  const workerSource = path.join(basePath, 'build/pdf.worker.min.mjs');
  const workerTarget = path.join(PUBLIC_DIR, 'pdf.worker.min.js');

  console.log('[prepare-pdf-worker] Reading worker source...');
  const workerContent = fs.readFileSync(workerSource, 'utf-8');

  console.log('[prepare-pdf-worker] Injecting polyfill...');
  const patchedWorker = POLYFILL + workerContent;

  console.log('[prepare-pdf-worker] Writing patched worker...');
  fs.writeFileSync(workerTarget, patchedWorker, 'utf-8');

  // Copy cmaps
  console.log('[prepare-pdf-worker] Copying cmaps...');
  const cmapsSource = path.join(basePath, 'cmaps');
  const cmapsTarget = path.join(PUBLIC_DIR, 'cmaps');
  execSync(`cp -R "${cmapsSource}"/* "${cmapsTarget}"/`, { stdio: 'inherit' });

  // Copy standard fonts
  console.log('[prepare-pdf-worker] Copying standard_fonts...');
  const fontsSource = path.join(basePath, 'standard_fonts');
  const fontsTarget = path.join(PUBLIC_DIR, 'standard_fonts');
  execSync(`cp -R "${fontsSource}"/* "${fontsTarget}"/`, { stdio: 'inherit' });

  console.log('[prepare-pdf-worker] ✅ PDF.js worker prepared successfully with polyfill!');
} catch (error) {
  console.error('[prepare-pdf-worker] ❌ Error:', error.message);
  process.exit(1);
}
