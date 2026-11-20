#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--html') args.html = argv[++i];
  }
  return args;
}

async function resolvePlaywrightChromium() {
  const localCandidates = [
    path.join(SKILL_ROOT, 'node_modules', 'playwright-core', 'index.mjs'),
    path.join(SKILL_ROOT, 'node_modules', 'playwright', 'index.mjs'),
    path.join(os.tmpdir(), 'atlas-loop-verifier', 'node_modules', 'playwright-core', 'index.mjs'),
  ];

  for (const cand of localCandidates) {
    if (fs.existsSync(cand)) {
      const mod = await import(pathToFileURL(cand).href);
      const chromium = mod?.chromium || mod?.default?.chromium;
      if (chromium) return chromium;
    }
  }

  const req = createRequire(import.meta.url);
  for (const pkg of ['playwright-core', 'playwright']) {
    try {
      const resolved = req.resolve(pkg);
      const mod = await import(pathToFileURL(resolved).href);
      const chromium = mod?.chromium || mod?.default?.chromium;
      if (chromium) return chromium;
    } catch {
      // 继续尝试下一个候选位置
    }
  }

  const verifierDir = path.join(os.tmpdir(), 'atlas-loop-verifier');
  const entry = path.join(verifierDir, 'node_modules', 'playwright-core', 'index.mjs');
  fs.mkdirSync(verifierDir, { recursive: true });
  fs.writeFileSync(
    path.join(verifierDir, 'package.json'),
    JSON.stringify({ name: 'atlas-loop-verifier', private: true, type: 'module' }),
    'utf8'
  );
  try {
    execSync(`bun add --cwd "${verifierDir}" playwright-core`, { stdio: 'pipe' });
  } catch (_) {
    execSync(`npm install --prefix "${verifierDir}" playwright-core --no-save --silent`, {
      stdio: 'pipe',
    });
  }
  const mod = await import(pathToFileURL(entry).href);
  return mod.chromium;
}

function findLocalChromiumExecutable() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const cacheDirs = [
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
    path.join(home, '.cache', 'ms-playwright'),
    path.join(localAppData, 'ms-playwright'),
  ];
  for (const base of cacheDirs) {
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base).sort().reverse();
    for (const dir of entries) {
      if (dir.startsWith('chromium_headless_shell-')) {
        const sub = path.join(base, dir);
        for (const archDir of fs.readdirSync(sub)) {
          for (const name of ['chrome-headless-shell', 'chrome-headless-shell.exe']) {
            const bin = path.join(sub, archDir, name);
            if (fs.existsSync(bin)) return bin;
          }
        }
      }
      if (dir.startsWith('chromium-')) {
        const sub = path.join(base, dir);
        for (const archDir of fs.readdirSync(sub)) {
          const candidates = [
            path.join(sub, archDir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
            path.join(sub, archDir, 'chrome'),
            path.join(sub, archDir, 'chrome.exe'),
          ];
          for (const bin of candidates) {
            if (fs.existsSync(bin)) return bin;
          }
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
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
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

  const chromium = await resolvePlaywrightChromium();
  const executablePath = findLocalChromiumExecutable();

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  const checks = {};
  const pageErrors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="atlas-node-card"]', { timeout: 8000 });

    // 1. 模型徽标与零页面错误
    const modelText = (await page.locator('[data-testid="model-badge"]').textContent()) || '';
    assert(modelText.trim().length > 3, '模型徽标为空');
    checks.modelDisplayed = modelText.trim();

    // 深度：徽标必须与 meta.depth 一致，浅图收起搜索与小地图，深图支持小地图开关
    const atlasMeta = await page.evaluate(() => {
      const el = document.getElementById('atlas-data-json');
      const d = el ? JSON.parse(el.textContent) : {};
      const edges = Array.isArray(d.edges) ? d.edges : [];
      return {
        depth: d.meta ? d.meta.depth : null,
        audience: (d.meta && d.meta.audience) || null,
        nodeCount: Array.isArray(d.nodes) ? d.nodes.length : 0,
        edgeCount: edges.length,
        feedbackEdgeCount: edges.filter((e) => e.kind === 'feedback').length,
      };
    });
    const depthShownRaw = await page
      .locator('[data-testid="depth-badge"]')
      .getAttribute('data-depth');
    const depthShown = Number(depthShownRaw);
    assert(
      Number.isInteger(depthShown) && depthShown >= 2 && depthShown <= 6,
      `深度徽标缺失或阶数无效：${depthShownRaw}`
    );
    assert(
      depthShown === Number(atlasMeta.depth),
      `深度徽标（${depthShown}）与 meta.depth（${atlasMeta.depth}）不一致`
    );
    const depthText = (await page.locator('[data-testid="depth-badge"]').textContent()) || '';
    assert(
      depthText.includes(String(depthShown)),
      `深度徽标文案没有写出阶数：${depthText.trim()}`
    );
    if (atlasMeta.audience) {
      const audienceText =
        (await page.locator('[data-testid="audience-badge"]').textContent()) || '';
      assert(
        audienceText.includes(atlasMeta.audience),
        `读者档位徽标没有显示 meta.audience：${audienceText.trim()}`
      );
    }

    const isCompact = depthShown <= 2;
    const hasSearch = (await page.locator('[data-testid="search-input"]').count()) > 0;
    const hasMiniMapBtn = (await page.locator('[data-testid="btn-minimap"]').count()) > 0;
    const initialMiniMapCount = await page.locator('.react-flow__minimap').count();
    if (isCompact) {
      assert(!hasSearch && !hasMiniMapBtn && initialMiniMapCount === 0, '浅图没有彻底收起搜索与小地图');
    } else {
      assert(hasSearch && hasMiniMapBtn, '非浅图缺少搜索或小地图开关按钮');
      assert(initialMiniMapCount === 0, '非浅图初始小地图应默认收起');
      await page.click('[data-testid="btn-minimap"]');
      await page.waitForSelector('.react-flow__minimap', { timeout: 2000 });
      assert(await page.locator('.react-flow__minimap').isVisible(), '点击小地图按钮后未能展开缩览图');
      await page.click('[data-testid="btn-minimap"]');
      assert((await page.locator('.react-flow__minimap').count()) === 0, '再次点击小地图按钮后未收起');
    }
    checks.depth = depthShown;
    checks.compactChrome = isCompact;

    // 本地存储契约：仅允许 atlas-state:* UI 浏览态缓存，严禁写入学习评分或能力档案
    const storageUsed = await page.evaluate(async () => {
      const idbNames =
        window.indexedDB && window.indexedDB.databases
          ? (await window.indexedDB.databases()).map((d) => d.name || '')
          : [];
      return {
        ls: Object.keys(window.localStorage),
        ss: Object.keys(window.sessionStorage),
        idb: idbNames,
      };
    });
    const disallowedLs = storageUsed.ls.filter((k) => !k.startsWith('atlas-state:'));
    const disallowedOther = [...disallowedLs, ...storageUsed.ss, ...storageUsed.idb];
    assert(
      disallowedOther.length === 0,
      `检测到未授权的浏览器本地存储（${disallowedOther.join(', ')}）：仅允许 atlas-state:* UI 浏览态缓存`
    );

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

    // 连线：顶层边与反馈边必须全部渲染出来
    const countEdges = () => page.locator('.react-flow__edge').count();
    const initialEdgeCount = await countEdges();
    assert(
      initialEdgeCount === atlasMeta.edgeCount,
      `画布渲染出 ${initialEdgeCount} 条连线，数据中有 ${atlasMeta.edgeCount} 条顶层边`
    );
    const renderedFeedbackEdges = await page.locator('.atlas-edge-feedback').count();
    assert(
      renderedFeedbackEdges === atlasMeta.feedbackEdgeCount,
      `反馈回路边数量不匹配（渲染 ${renderedFeedbackEdges} vs 数据 ${atlasMeta.feedbackEdgeCount}）`
    );
    checks.edgesRendered = initialEdgeCount;
    checks.feedbackEdgeCount = atlasMeta.feedbackEdgeCount;

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
    await page.click('[data-testid="btn-zoom-in"]');
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
      viewportAfterFit !== viewportBeforeFit,
      'Fit View 没有调整视口（视口在点击前后完全一致）'
    );
    if (streamBtnCount > 1) {
      assert(
        (await streamBtns.first().getAttribute('data-active')) === 'true',
        'Fit View 错误地清除了当前的脉络过滤器！'
      );
    }

    // 6. 展开 detailGraph（如有）再折叠回去与搜索
    const expandBtns = page.locator('[data-testid="node-expand-btn"]');
    if ((await expandBtns.count()) > 0) {
      const countBeforeExpand = await page.locator('.react-flow__node').count();
      const edgesBeforeExpand = await countEdges();
      await expandBtns.first().click();
      await page.waitForTimeout(80);
      const countAfterExpand = await page.locator('.react-flow__node').count();
      assert(countAfterExpand > countBeforeExpand, '展开 detailGraph 后没有新增细节子节点');
      assert((await countEdges()) > 0, '展开 detailGraph 后连线消失了');

      await expandBtns.first().click();
      await page.waitForTimeout(80);
      const countAfterCollapse = await page.locator('.react-flow__node').count();
      assert(
        countAfterCollapse === countBeforeExpand,
        `折叠 detailGraph 后节点数没有回到初始值（${countAfterCollapse} ≠ ${countBeforeExpand}）`
      );
      const edgesAfterCollapse = await countEdges();
      assert(
        edgesAfterCollapse === edgesBeforeExpand,
        `折叠 detailGraph 后连线数没有恢复（${edgesAfterCollapse} ≠ ${edgesBeforeExpand}）`
      );
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
      const childLink = page.locator('[data-testid="child-atlas-link"]');
      if ((await childLink.count()) > 0) {
        const href = (await childLink.getAttribute('href')) || '';
        assert(href.trim().length > 0, '子图链接 href 为空');
      } else {
        const recText = (await page.locator('[data-testid="recursive-prompt-text"]').textContent()) || '';
        assert(recText.trim().length > 10, '缺少递归子图提示');
      }
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
    assert((await page.locator('.react-flow__minimap').count()) === 0, 'Reset 没有收起缩览图');
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

    // 9. 导出 PNG：全图包围盒导出，且不改动视口、不残留遮罩
    await page.click('[data-testid="btn-zoom-in"]');
    await page.click('[data-testid="btn-zoom-in"]');
    const pixelRatio = await page.evaluate(() => Math.min(2, window.devicePixelRatio || 1));
    const viewportBeforeExport = await getViewportTransform();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('[data-testid="btn-export-png"]'),
    ]);
    const pngPath = path.join(os.tmpdir(), `atlas-export-${Date.now()}.png`);
    await download.saveAs(pngPath);
    const png = fs.readFileSync(pngPath);
    assert(png.length > 2000, `导出的 PNG 文件过小：${png.length} 字节`);
    assert(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', '导出文件不是 PNG');
    const pngWidth = png.readUInt32BE(16);
    const pngHeight = png.readUInt32BE(20);
    const maxAllowed = Math.round(3200 * pixelRatio) + 4;
    assert(
      pngWidth >= 180 && pngHeight >= 120 && pngWidth <= maxAllowed && pngHeight <= maxAllowed,
      `导出全图尺寸 ${pngWidth}x${pngHeight} 超出合理边界`
    );
    const viewportAfterExport = await getViewportTransform();
    assert(viewportAfterExport === viewportBeforeExport, '导出改变了画布的缩放或平移');
    const leftoverOverlays = await page.evaluate(() => {
      const wrap = document.querySelector('[data-testid="atlas-canvas-wrap"]');
      if (!wrap) return 0;
      return Array.from(wrap.children).filter((c) => c.style && c.style.zIndex === '9999').length;
    });
    assert(leftoverOverlays === 0, '导出后画布上残留了遮罩元素');
    fs.unlinkSync(pngPath);
    checks.exportPng = `${pngWidth}x${pngHeight}`;

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
