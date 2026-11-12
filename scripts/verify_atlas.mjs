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
  if (!cond) throw new Error(`断言失败：${msg}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.html) {
    console.error('用法：node verify_atlas.mjs --html <atlas.html 的路径>');
    process.exit(1);
  }
  const htmlPath = path.resolve(args.html);
  assert(fs.existsSync(htmlPath), `未找到 HTML 文件：${htmlPath}`);

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

    // 1. 模型徽标与零页面错误
    const modelText = (await page.locator('[data-testid="model-badge"]').textContent()) || '';
    assert(modelText.trim().length > 3, '模型徽标为空');
    checks.modelDisplayed = modelText.trim();

    // 复杂度：徽标与数据一致，简单地图收起搜索与小地图
    const atlasMeta = await page.evaluate(() => {
      const el = document.getElementById('atlas-data-json');
      const d = el ? JSON.parse(el.textContent) : {};
      return {
        complexity: (d.meta && d.meta.complexity) || null,
        nodeCount: Array.isArray(d.nodes) ? d.nodes.length : 0,
        edgeCount: Array.isArray(d.edges) ? d.edges.length : 0,
      };
    });
    const complexityShown = await page
      .locator('[data-testid="complexity-badge"]')
      .getAttribute('data-complexity');
    assert(
      ['simple', 'moderate', 'complex'].includes(complexityShown),
      `复杂度徽标缺失或档位无效：${complexityShown}`
    );
    if (atlasMeta.complexity) {
      assert(
        complexityShown === atlasMeta.complexity,
        `复杂度徽标（${complexityShown}）与 meta.complexity（${atlasMeta.complexity}）不一致`
      );
    }
    const isCompact = complexityShown === 'simple';
    const hasSearch = (await page.locator('[data-testid="search-input"]').count()) > 0;
    const hasMiniMap = (await page.locator('.react-flow__minimap').count()) > 0;
    assert(
      isCompact ? !hasSearch && !hasMiniMap : hasSearch && hasMiniMap,
      isCompact ? '简单地图没有收起搜索与小地图' : '非简单地图缺少搜索或小地图'
    );
    checks.complexity = complexityShown;
    checks.compactChrome = isCompact;

    // 2. 画布尺寸非零，且初始概览节点互不重叠
    const canvasBox = await page.locator('[data-testid="atlas-canvas-wrap"]').boundingBox();
    assert(canvasBox && canvasBox.width > 400 && canvasBox.height > 300, '画布包围盒无效');

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
    assert(initialPositions.length > 0, '没有渲染出任何 React Flow 节点');
    assert(
      initialPositions.length === atlasMeta.nodeCount,
      `画布初始节点数（${initialPositions.length}）与数据中的顶层节点数（${atlasMeta.nodeCount}）不一致`
    );
    for (const n of initialPositions) {
      assert(n.w > 40 && n.h > 30, `节点 ${n.id} 的渲染尺寸为零或过小`);
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
    assert(severeOverlaps === 0, `检测到 ${severeOverlaps} 对节点重叠`);
    checks.initialNodeCount = initialPositions.length;
    checks.overlapFree = true;

    // 连线：顶层边必须全部渲染出来
    const countEdges = () => page.locator('.react-flow__edge').count();
    const initialEdgeCount = await countEdges();
    assert(
      initialEdgeCount === atlasMeta.edgeCount,
      `画布渲染出 ${initialEdgeCount} 条连线，数据中有 ${atlasMeta.edgeCount} 条顶层边`
    );
    checks.edgesRendered = initialEdgeCount;

    const labelOverlap = await page.evaluate(() => {
      const pad = 1;
      const labels = [...document.querySelectorAll('[data-testid="edge-label"]')];
      const nodes = [...document.querySelectorAll('.react-flow__node')];
      let hits = 0;
      for (const label of labels) {
        const l = label.getBoundingClientRect();
        if (l.width < 2 || l.height < 2) continue;
        for (const node of nodes) {
          const n = node.getBoundingClientRect();
          const overlapX = l.left < n.right - pad && l.right > n.left + pad;
          const overlapY = l.top < n.bottom - pad && l.bottom > n.top + pad;
          if (overlapX && overlapY) hits += 1;
        }
      }
      return { hits, labelCount: labels.length };
    });
    assert(labelOverlap.labelCount > 0, '连线没有渲染关系说明');
    assert(labelOverlap.hits === 0, `有 ${labelOverlap.hits} 处关系说明被节点盖住`);

    const getViewportTransform = () =>
      page.evaluate(() => document.querySelector('.react-flow__viewport')?.style.transform || '');

    const initialViewport = await getViewportTransform();

    // 3. 放大 / 缩小与平移
    await page.click('[data-testid="btn-zoom-in"]');
    const afterZoomIn = await getViewportTransform();
    assert(afterZoomIn !== initialViewport, '放大后视口 transform 没有变化');

    await page.click('[data-testid="btn-zoom-out"]');

    const paneBox = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.move(paneBox.x + paneBox.width - 60, paneBox.y + paneBox.height - 60);
    await page.mouse.down();
    await page.mouse.move(paneBox.x + paneBox.width - 180, paneBox.y + paneBox.height - 140, { steps: 5 });
    await page.mouse.up();
    const afterPan = await getViewportTransform();
    assert(afterPan !== afterZoomIn, '平移画布后视口 transform 没有变化');
    checks.zoomAndPan = true;

    // 在锁定/拖拽测试前先重置，让节点整齐地居中于视口内
    await page.click('[data-testid="btn-reset"]');
    await page.waitForTimeout(80);

    // 4. 画布默认锁定；解锁后才允许拖拽节点
    const firstNode = page.locator('.react-flow__node').first();
    const getFirstNodeTransform = () =>
      firstNode.evaluate((el) => el.style.transform);

    const beforeLockDrag = await getFirstNodeTransform();
    assert(
      (await page.locator('[data-testid="btn-lock"]').getAttribute('data-locked')) === 'true',
      '画布默认应锁定节点拖拽'
    );

    const lockedBox = await firstNode.boundingBox();
    await page.mouse.move(lockedBox.x + 40, lockedBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(lockedBox.x + 150, lockedBox.y + 110, { steps: 6 });
    await page.mouse.up();
    const afterLockedDrag = await getFirstNodeTransform();
    assert(afterLockedDrag === beforeLockDrag, '锁定状态下节点仍被拖动了！');

    await page.click('[data-testid="btn-lock"]');
    assert(
      (await page.locator('[data-testid="btn-lock"]').getAttribute('data-locked')) === 'false',
      '解锁后锁定状态属性未清除'
    );
    const unlockedBox = await firstNode.boundingBox();
    await page.mouse.move(unlockedBox.x + 40, unlockedBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(unlockedBox.x + 160, unlockedBox.y + 120, { steps: 8 });
    await page.mouse.up();
    const afterUnlockedDrag = await getFirstNodeTransform();
    assert(afterUnlockedDrag !== beforeLockDrag, '解锁状态下拖拽节点没有移动！');
    checks.lockAndUnlock = true;

    // 5. Fit View 与 Reset 的严格语义区分
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
      'Fit View 错误地重置了被拖拽节点的坐标！'
    );
    assert(
      viewportAfterFit.length > 0 && (viewportAfterFit !== viewportBeforeFit || initialPositions.length > 0),
      'Fit View 视口检查未通过'
    );
    if (streamBtnCount > 1) {
      assert(
        (await streamBtns.first().getAttribute('data-active')) === 'true',
        'Fit View 错误地清除了当前的脉络过滤器！'
      );
    }

    // 6. 展开 detailGraph（如有）与搜索
    const expandBtns = page.locator('[data-testid="node-expand-btn"]');
    if ((await expandBtns.count()) > 0) {
      const countBeforeExpand = await page.locator('.react-flow__node').count();
      await expandBtns.first().click();
      await page.waitForTimeout(80);
      const countAfterExpand = await page.locator('.react-flow__node').count();
      assert(countAfterExpand > countBeforeExpand, '展开 detailGraph 后没有新增细节子节点');
      assert((await countEdges()) > 0, '展开 detailGraph 后连线消失了');
      checks.detailDrillDown = true;
    }

    // 7. 「↳」深入探究：图标徽标、悬停提示、点击弹窗与复制按钮
    const helpBtn = page.locator('[data-testid="node-deep-dive-btn"]').first();
    assert((await helpBtn.locator('svg').count()) === 1, '深入探究徽标应为图标');
    assert(((await helpBtn.textContent()) || '').trim() === '', '深入探究徽标不应使用文字符号');
    await helpBtn.hover();
    await page.waitForSelector('[data-testid="deep-dive-tooltip"]', { timeout: 3000 });
    await helpBtn.click();
    await page.waitForSelector('[data-testid="deep-dive-panel"]', { timeout: 3000 });

    const askPromptText = (await page.locator('[data-testid="ask-prompt-text"]').first().textContent()) || '';
    assert(askPromptText.trim().length >= 20, '深入探究的追问提示缺失或过于简单');
    await page.click('[data-testid="btn-copy-ask-0"]');
    await page.waitForTimeout(50);
    assert(
      (await page.locator('[data-testid="btn-copy-ask-0"]').getAttribute('data-copied')) === 'true',
      '复制按钮没有进入已复制状态'
    );

    const recTab = page.locator('[data-testid="tab-recursive-prompt"]');
    if ((await recTab.count()) > 0) {
      await recTab.click();
      const recText = (await page.locator('[data-testid="recursive-prompt-text"]').textContent()) || '';
      assert(recText.trim().length > 10, '缺少递归子图提示');
    }
    checks.deepDiveLoopPrompts = true;

    // 8. 完整重置：精确恢复初始布局，关闭弹窗，重置过滤器与展开状态
    await page.click('[data-testid="btn-close-deep-dive"]');
    if (hasSearch) await page.fill('[data-testid="search-input"]', 'a');
    await page.click('[data-testid="btn-reset"]');
    await page.waitForTimeout(100);

    // 只有一条脉络时不显示「全部脉络」过滤器
    if ((await page.locator('[data-testid="stream-btn-all"]').count()) > 0) {
      assert(
        (await page.locator('[data-testid="stream-btn-all"]').getAttribute('data-active')) === 'true',
        'Reset 没有恢复「全部脉络」过滤器'
      );
    }
    if (hasSearch) {
      assert(
        (await page.locator('[data-testid="search-input"]').inputValue()) === '',
        'Reset 没有清空搜索框'
      );
    }
    assert(
      (await page.locator('.react-flow__node').count()) === initialPositions.length,
      'Reset 没有把已展开的细节节点折叠回初始状态'
    );
    const afterFullResetTransform = await getFirstNodeTransform();
    assert(
      afterFullResetTransform === beforeLockDrag,
      `Reset 没有恢复节点的初始位置（${afterFullResetTransform} vs ${beforeLockDrag}）`
    );
    assert(
      (await page.locator('[data-testid="btn-lock"]').getAttribute('data-locked')) === 'true',
      'Reset 没有恢复默认锁定'
    );
    const edgesAfterReset = await countEdges();
    assert(
      edgesAfterReset === atlasMeta.edgeCount,
      `Reset 后渲染出 ${edgesAfterReset} 条连线，应为 ${atlasMeta.edgeCount} 条`
    );
    checks.resetRestoredInitialState = true;

    assert(pageErrors.length === 0, `页面出现错误：${pageErrors.join('; ')}`);
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
