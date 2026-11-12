#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--html') args.html = argv[++i];
  }
  return args;
}

function ensurePlaywrightCore() {
  const verifierDir = path.join(os.tmpdir(), 'atlas-loop-verifier');
  const entry = path.join(verifierDir, 'node_modules', 'playwright-core', 'index.mjs');
  if (fs.existsSync(entry)) return entry;

  fs.mkdirSync(verifierDir, { recursive: true });
  fs.writeFileSync(
    path.join(verifierDir, 'package.json'),
    JSON.stringify({ name: 'atlas-loop-verifier', private: true, type: 'module' }),
    'utf8'
  );
  try {
    execSync('bun add --cwd "' + verifierDir + '" playwright-core', { stdio: 'pipe' });
  } catch (_) {
    execSync('npm install --prefix "' + verifierDir + '" playwright-core --no-save --silent', {
      stdio: 'pipe',
    });
  }
  return entry;
}

function findLocalChromiumExecutable() {
  const home = os.homedir();
  const cacheDirs = [
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
    path.join(home, '.cache', 'ms-playwright'),
  ];
  for (const base of cacheDirs) {
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base).sort().reverse();
    for (const dir of entries) {
      if (dir.startsWith('chromium_headless_shell-')) {
        const sub = path.join(base, dir);
        for (const archDir of fs.readdirSync(sub)) {
          const bin = path.join(sub, archDir, 'chrome-headless-shell');
          if (fs.existsSync(bin)) return bin;
        }
      }
      if (dir.startsWith('chromium-')) {
        const sub = path.join(base, dir);
        for (const archDir of fs.readdirSync(sub)) {
          const macBin = path.join(sub, archDir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
          const linuxBin = path.join(sub, archDir, 'chrome');
          if (fs.existsSync(macBin)) return macBin;
          if (fs.existsSync(linuxBin)) return linuxBin;
        }
      }
    }
  }
  const sysCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const c of sysCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.html) {
    console.error('Usage: node verify_atlas.mjs --html <path-to-atlas.html>');
    process.exit(1);
  }
  const htmlPath = path.resolve(args.html);
  assert(fs.existsSync(htmlPath), `HTML file not found: ${htmlPath}`);

  const pwEntry = ensurePlaywrightCore();
  const { chromium } = await import(pathToFileURL(pwEntry).href);
  const executablePath = findLocalChromiumExecutable();

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  const checks = {};
  const pageErrors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="atlas-node-card"]', { timeout: 8000 });

    // 1. Model badge & zero page errors
    const modelText = (await page.locator('[data-testid="model-badge"]').textContent()) || '';
    assert(modelText.trim().length > 3, 'Model badge is empty');
    checks.modelDisplayed = modelText.trim();

    // 2. Non-zero canvas & non-overlapping initial overview nodes
    const canvasBox = await page.locator('[data-testid="atlas-canvas-wrap"]').boundingBox();
    assert(canvasBox && canvasBox.width > 400 && canvasBox.height > 300, 'Canvas bounding box invalid');

    const initialPositions = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.react-flow__node')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-id'),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          transform: el.style.transform,
        };
      });
    });
    assert(initialPositions.length > 0, 'No rendered React Flow nodes');
    for (const n of initialPositions) {
      assert(n.w > 40 && n.h > 30, `Node ${n.id} rendered with zero/tiny size`);
    }
    let severeOverlaps = 0;
    for (let i = 0; i < initialPositions.length; i++) {
      for (let j = i + 1; j < initialPositions.length; j++) {
        const a = initialPositions[i];
        const b = initialPositions[j];
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const area = ix * iy;
        const minArea = Math.min(a.w * a.h, b.w * b.h);
        if (minArea > 0 && area / minArea > 0.25) severeOverlaps++;
      }
    }
    assert(severeOverlaps === 0, `Detected ${severeOverlaps} overlapping node pairs`);
    checks.initialNodeCount = initialPositions.length;
    checks.overlapFree = true;

    const getViewportTransform = () =>
      page.evaluate(() => document.querySelector('.react-flow__viewport')?.style.transform || '');

    const initialViewport = await getViewportTransform();

    // 3. Zoom in / out & pan
    await page.click('[data-testid="btn-zoom-in"]');
    const afterZoomIn = await getViewportTransform();
    assert(afterZoomIn !== initialViewport, 'Zoom In did not change viewport transform');

    await page.click('[data-testid="btn-zoom-out"]');

    const paneBox = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.move(paneBox.x + paneBox.width - 60, paneBox.y + paneBox.height - 60);
    await page.mouse.down();
    await page.mouse.move(paneBox.x + paneBox.width - 180, paneBox.y + paneBox.height - 140, { steps: 5 });
    await page.mouse.up();
    const afterPan = await getViewportTransform();
    assert(afterPan !== afterZoomIn, 'Canvas pan did not change viewport transform');
    checks.zoomAndPan = true;

    // Reset before lock/drag test so nodes are cleanly centered in view
    await page.click('[data-testid="btn-reset"]');
    await page.waitForTimeout(80);

    // 4. Lock vs Unlock node dragging
    const firstNode = page.locator('.react-flow__node').first();
    const getFirstNodeTransform = () =>
      firstNode.evaluate((el) => el.style.transform);

    const beforeLockDrag = await getFirstNodeTransform();
    await page.click('[data-testid="btn-lock"]');
    assert(
      (await page.locator('[data-testid="btn-lock"]').getAttribute('data-locked')) === 'true',
      'Lock state attribute not set'
    );

    const lockedBox = await firstNode.boundingBox();
    await page.mouse.move(lockedBox.x + 40, lockedBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(lockedBox.x + 150, lockedBox.y + 110, { steps: 6 });
    await page.mouse.up();
    const afterLockedDrag = await getFirstNodeTransform();
    assert(afterLockedDrag === beforeLockDrag, 'Locked node moved when dragged!');

    await page.click('[data-testid="btn-lock"]');
    assert(
      (await page.locator('[data-testid="btn-lock"]').getAttribute('data-locked')) === 'false',
      'Unlock state attribute not cleared'
    );
    const unlockedBox = await firstNode.boundingBox();
    await page.mouse.move(unlockedBox.x + 40, unlockedBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(unlockedBox.x + 160, unlockedBox.y + 120, { steps: 8 });
    await page.mouse.up();
    const afterUnlockedDrag = await getFirstNodeTransform();
    assert(afterUnlockedDrag !== beforeLockDrag, 'Unlocked node did not move when dragged!');
    checks.lockAndUnlock = true;

    // 5. Fit View vs Reset strict semantics
    const streamBtns = page.locator('[data-testid^="stream-btn-"]:not([data-testid="stream-btn-all"])');
    const streamBtnCount = await streamBtns.count();
    if (streamBtnCount > 1) {
      await streamBtns.first().click();
      await page.waitForTimeout(80);
      const streamNodeBox = await firstNode.boundingBox();
      await page.mouse.move(streamNodeBox.x + 40, streamNodeBox.y + 24);
      await page.mouse.down();
      await page.mouse.move(streamNodeBox.x + 130, streamNodeBox.y + 95, { steps: 6 });
      await page.mouse.up();
    }
    const draggedTransformBeforeFit = await getFirstNodeTransform();
    const viewportBeforeFit = await getViewportTransform();
    await page.click('[data-testid="btn-fit-view"]');
    await page.waitForTimeout(80);
    const draggedTransformAfterFit = await getFirstNodeTransform();
    const viewportAfterFit = await getViewportTransform();
    assert(
      draggedTransformAfterFit === draggedTransformBeforeFit,
      'Fit View erroneously reset dragged node coordinates!'
    );
    assert(
      viewportAfterFit.length > 0 && (viewportAfterFit !== viewportBeforeFit || initialPositions.length > 0),
      'Fit View viewport check failed'
    );
    if (streamBtnCount > 1) {
      assert(
        (await streamBtns.first().getAttribute('data-active')) === 'true',
        'Fit View erroneously cleared active stream filter!'
      );
    }

    // 6. Expand detailGraph (if present) & Search
    const expandBtns = page.locator('[data-testid="node-expand-btn"]');
    if ((await expandBtns.count()) > 0) {
      const countBeforeExpand = await page.locator('.react-flow__node').count();
      await expandBtns.first().click();
      await page.waitForTimeout(80);
      const countAfterExpand = await page.locator('.react-flow__node').count();
      assert(countAfterExpand > countBeforeExpand, 'Expanding detailGraph did not add detail sub-nodes');
      checks.detailDrillDown = true;
    }

    // 7. "?" Deep Dive hover & click modal + copy button
    const helpBtn = page.locator('[data-testid="node-deep-dive-btn"]').first();
    await helpBtn.hover();
    await page.waitForSelector('[data-testid="deep-dive-tooltip"]', { timeout: 3000 });
    await helpBtn.click();
    await page.waitForSelector('[data-testid="deep-dive-panel"]', { timeout: 3000 });

    const askPromptText = (await page.locator('[data-testid="ask-prompt-text"]').first().textContent()) || '';
    assert(askPromptText.trim().length >= 20, 'Deep dive ask prompt text missing or trivial');
    await page.click('[data-testid="btn-copy-ask-0"]');
    await page.waitForTimeout(50);
    assert(
      (await page.locator('[data-testid="btn-copy-ask-0"]').getAttribute('data-copied')) === 'true',
      'Copy button did not report copied state'
    );

    const recTab = page.locator('[data-testid="tab-recursive-prompt"]');
    if ((await recTab.count()) > 0) {
      await recTab.click();
      const recText = (await page.locator('[data-testid="recursive-prompt-text"]').textContent()) || '';
      assert(recText.trim().length > 10, 'Recursive sub-atlas prompt missing');
    }
    checks.deepDiveLoopPrompts = true;

    // 8. Full Reset restores exact initial layout, closes modal, resets filter & expansion
    await page.click('[data-testid="btn-close-deep-dive"]');
    await page.fill('[data-testid="search-input"]', 'a');
    await page.click('[data-testid="btn-reset"]');
    await page.waitForTimeout(100);

    assert(
      (await page.locator('[data-testid="stream-btn-all"]').getAttribute('data-active')) === 'true',
      'Reset did not restore All Streams filter'
    );
    assert(
      (await page.locator('[data-testid="search-input"]').inputValue()) === '',
      'Reset did not clear search input'
    );
    assert(
      (await page.locator('.react-flow__node').count()) === initialPositions.length,
      'Reset did not collapse expanded detail nodes back to initial state'
    );
    const afterFullResetTransform = await getFirstNodeTransform();
    assert(
      afterFullResetTransform === beforeLockDrag,
      `Reset did not restore initial node position (${afterFullResetTransform} vs ${beforeLockDrag})`
    );
    checks.resetRestoredInitialState = true;

    assert(pageErrors.length === 0, `Page errors occurred: ${pageErrors.join('; ')}`);
    checks.zeroPageErrors = true;

    console.log(JSON.stringify({ ok: true, htmlPath, checks }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
