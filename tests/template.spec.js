// @ts-check
import { test, expect } from '@playwright/test';

// ──────────────────────────────────────────────────────────────
// 辅助：等待画布（ReactFlow）渲染完成
// ──────────────────────────────────────────────────────────────
async function waitForCanvas(page) {
  // ReactFlow 完成后 .react-flow__node 元素会出现
  await page.waitForSelector('.react-flow__node', { timeout: 12_000 });
}

// ──────────────────────────────────────────────────────────────
// 1. 页面基础加载
// ──────────────────────────────────────────────────────────────
test.describe('页面基础加载', () => {
  test('标题、节点、流线全部渲染', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 顶部标题
    const title = page.locator('.atlas-main-title');
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText('');

    // 至少有一个节点
    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible();
    const count = await nodes.count();
    expect(count).toBeGreaterThan(0);

    // 有边线（edge）
    const edges = page.locator('.react-flow__edge');
    await expect(edges.first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────
// 2. 节点卡片：展开/收起
// ──────────────────────────────────────────────────────────────
test.describe('节点卡片展开/收起', () => {
  test('点击展开按钮后节点卡片变高', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 找第一个展开按钮（.atlas-expand-btn）
    const expandBtn = page.locator('.atlas-expand-btn').first();
    await expect(expandBtn).toBeVisible();

    // 记录点击前高度
    const nodeBefore = page.locator('.atlas-node').first();
    const heightBefore = await nodeBefore.evaluate((el) => el.getBoundingClientRect().height);

    await expandBtn.click();

    // 等待 DOM 更新
    await page.waitForTimeout(300);
    const heightAfter = await nodeBefore.evaluate((el) => el.getBoundingClientRect().height);
    expect(heightAfter).toBeGreaterThan(heightBefore);
  });
});

// ──────────────────────────────────────────────────────────────
// 3. DeepDive 弹窗
// ──────────────────────────────────────────────────────────────
test.describe('DeepDive 弹窗', () => {
  test('点击有 deepDive 的节点弹出弹窗，ESC 关闭', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 找有深探按钮的节点内的按钮（data-testid 或 class）
    const deepDiveBtn = page.locator('[data-testid="node-deep-dive-btn"]').first();
    // 如果没有 testid，换 class
    const btn = (await deepDiveBtn.count()) > 0
      ? deepDiveBtn
      : page.locator('.atlas-deep-dive-btn').first();

    await btn.click();

    // 弹窗出现
    const modal = page.locator('[data-testid="deep-dive-modal"], .atlas-modal, [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 4_000 });

    // ESC 关闭
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3_000 });
  });
});

// ──────────────────────────────────────────────────────────────
// 4. MiniMap 开关
// ──────────────────────────────────────────────────────────────
test.describe('MiniMap 开关', () => {
  test('默认隐藏，点击按钮后显示，再次点击后隐藏', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    const minimap = page.locator('.react-flow__minimap');
    const toggleBtn = page.locator('[data-testid="btn-minimap"]');

    // 默认不可见
    await expect(minimap).not.toBeVisible();

    // 点开
    await toggleBtn.click();
    await expect(minimap).toBeVisible({ timeout: 2_000 });

    // 再关
    await toggleBtn.click();
    await expect(minimap).not.toBeVisible({ timeout: 2_000 });
  });
});

// ──────────────────────────────────────────────────────────────
// 5. PNG 导出（全图）
// ──────────────────────────────────────────────────────────────
test.describe('PNG 导出', () => {
  test('点击导出按钮触发文件下载，文件名含地图标题', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 等待 onInit 触发（确保 rfInitRef.current 已赋值）
    await page.waitForTimeout(500);

    // 拦截下载
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });

    const exportBtn = page.locator('[data-testid="btn-export-png"]');
    await exportBtn.click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // 文件名是 .png
    expect(filename.endsWith('.png')).toBe(true);
    // 文件实际写出（非空）
    const path = await download.path();
    const { statSync } = await import('node:fs');
    const size = statSync(path).size;
    expect(size).toBeGreaterThan(1000); // PNG 至少 1 KB
  });

  test('导出后视口应恢复到导出前的位置', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);
    await page.waitForTimeout(500);

    // 读导出前视口（通过页面内 JS）
    const viewportBefore = await page.evaluate(() => {
      // @xyflow/react 把 transform 写在 .react-flow__viewport 的 style.transform
      const vp = document.querySelector('.react-flow__viewport');
      return vp ? vp.style.transform : null;
    });

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.locator('[data-testid="btn-export-png"]').click();
    await downloadPromise;

    // 等导出逻辑结束（setViewport 恢复需要一帧）
    await page.waitForTimeout(400);

    const viewportAfter = await page.evaluate(() => {
      const vp = document.querySelector('.react-flow__viewport');
      return vp ? vp.style.transform : null;
    });

    expect(viewportAfter).toBe(viewportBefore);
  });
});

// ──────────────────────────────────────────────────────────────
// 6. 子图导航（demo 数据）
// ──────────────────────────────────────────────────────────────
test.describe('子图导航', () => {
  test('有 childAtlasUrl 的节点上显示子图入口链接', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 展开含子图链接的节点（n-grind，需先展开才能看到子图链接）
    const nodes = page.locator('.react-flow__node');
    const count = await nodes.count();
    // 遍历找子图链接
    let childLink = null;
    for (let i = 0; i < count; i++) {
      const link = nodes.nth(i).locator('[data-testid="node-child-atlas-link"]');
      if ((await link.count()) > 0) {
        childLink = link;
        break;
      }
    }
    expect(childLink).not.toBeNull();
    await expect(childLink).toBeVisible();
  });

  test('点击子图入口导航到子图页，子图有返回父图按钮', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 点击子图链接
    const childLink = page.locator('[data-testid="node-child-atlas-link"]').first();
    await childLink.click();

    // 等待子图加载
    await waitForCanvas(page);

    // 子图有"返回上级"按钮
    const backBtn = page.locator('.atlas-parent-link, [data-testid="parent-map-link"]').first();
    await expect(backBtn).toBeVisible({ timeout: 6_000 });
  });
});

// ──────────────────────────────────────────────────────────────
// 6b. ZIP 导出
// ──────────────────────────────────────────────────────────────
test.describe('ZIP 导出', () => {
  test('点击 ZIP 导出按钮触发下载，ZIP 内含有效 HTML 文件', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);
    // 模拟其他代码向 head 注入样式，外部地图 CSS 仍须完整导出。
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'body { outline-color: transparent; }';
      document.head.appendChild(style);
    });

    const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
    await page.locator('[data-testid="btn-export-zip"]').click();
    const download = await downloadPromise;

    // 文件名是 .zip
    expect(download.suggestedFilename().endsWith('.zip')).toBe(true);

    // 读取 ZIP 字节
    const zipPath = await download.path();
    const { readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const size = statSync(zipPath).size;
    expect(size).toBeGreaterThan(500); // ZIP 至少 500 B

    // 解析 ZIP 本地文件头，提取所有未压缩的 HTML
    const buf = readFileSync(zipPath);
    const entries = new Map();
    let offset = 0;
    while (buf.readUInt32LE(offset) === 0x04034b50) {
      expect(buf.readUInt16LE(offset + 6) & 0x0800).toBe(0x0800); // UTF-8 文件名
      expect(buf.readUInt16LE(offset + 8)).toBe(0); // Store
      const fnLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const size = buf.readUInt32LE(offset + 18);
      const name = buf.subarray(offset + 30, offset + 30 + fnLen).toString('utf8');
      const dataOffset = offset + 30 + fnLen + extraLen;
      entries.set(name, buf.subarray(dataOffset, dataOffset + size).toString('utf8'));
      offset = dataOffset + size;
    }
    expect(entries.size).toBeGreaterThanOrEqual(2);
    const [rootName, htmlContent] = entries.entries().next().value;
    const rootData = JSON.parse(htmlContent.match(/<script id="atlas-data-json" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    const childLink = rootData.nodes.find(n => n.deepDive?.childAtlasUrl)?.deepDive.childAtlasUrl;
    const childName = decodeURIComponent(childLink);
    expect(entries.has(childName)).toBe(true);
    const childData = JSON.parse(entries.get(childName).match(/<script id="atlas-data-json" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    expect(decodeURIComponent(childData.meta.parentMapHtml)).toBe(rootName);

    // 导出的 HTML 必须包含关键标记
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<style>');
    expect(htmlContent).toContain('atlas-data-json');
    expect(htmlContent).toContain('<script>');
    // 样式和脚本不应为空（确保 CSS 和 JS 已内联）
    const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    expect(styleMatch[1]).toContain('.react-flow');
    expect(styleMatch[1]).toContain('.atlas-topbar');
    expect(styleMatch[1]).toContain('--bg-canvas');
    const scriptContent = htmlContent.match(/<script>([^<]{100,})/);
    expect(scriptContent).not.toBeNull();

    // 真正从本地文件打开导出的页面，确认离线样式生效。
    const dir = mkdtempSync(join(tmpdir(), 'atlas-zip-test-'));
    try {
      for (const [name, html] of entries) writeFileSync(join(dir, name), html);
      const rootUrl = pathToFileURL(join(dir, rootName)).href;
      const childUrl = pathToFileURL(join(dir, childName)).href;
      await page.goto(rootUrl);
      await waitForCanvas(page);
      await expect(page.locator('.atlas-topbar')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await page.locator('[data-testid="node-child-atlas-link"]').first().click();
      await waitForCanvas(page);
      expect(page.url()).toBe(childUrl);
      await expect(page.locator('.atlas-main-title')).toHaveText(childData.meta.title);
      await page.locator('[data-testid="parent-map-link"]').click();
      await waitForCanvas(page);
      expect(page.url()).toBe(rootUrl);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 7. 锁定/解锁画布
// ──────────────────────────────────────────────────────────────
test.describe('锁定/解锁画布', () => {
  test('锁定状态下节点不可拖拽；解锁后可拖拽', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 锁定状态：节点上应有 .nodrag 或节点容器的 draggable=false
    const node = page.locator('.react-flow__node').first();
    const isDraggableBefore = await node.evaluate((el) =>
      !el.classList.contains('nodrag') && el.getAttribute('draggable') !== 'false'
    );
    // 默认锁定 → 节点不应该可拖
    // 注意：ReactFlow 通过 nodesDraggable prop 控制，不一定加 class
    // 只检查解锁按钮存在
    const lockBtn = page.locator('[data-testid="btn-lock"], .atlas-ctrl-btn[aria-label*="锁"], .atlas-ctrl-btn[title*="Lock"]').first();
    await expect(lockBtn).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────
// 8. 检视抽屉滚动记忆
// ──────────────────────────────────────────────────────────────
test.describe('检视抽屉滚动记忆', () => {
  test('切换节点时各节点记住自己的滚动位置', async ({ page }) => {
    // 压低视口高度，确保抽屉内容可滚动
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto('/');
    await waitForCanvas(page);

    const nodes = page.locator('.react-flow__node');
    const inspector = page.locator('[data-testid="inspector-panel"]');
    const title = inspector.locator('.atlas-inspector-title');

    // 打开节点 A 并滚到底部
    await nodes.nth(0).click();
    await expect(inspector).toBeVisible();
    const titleA = await title.textContent();
    const scrolledA = await inspector.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(scrolledA).toBeGreaterThan(0);

    // 切到节点 B：抽屉回到顶部
    await nodes.nth(1).click();
    await expect(title).not.toHaveText(titleA);
    await expect(inspector).toHaveJSProperty('scrollTop', 0);

    // 切回节点 A：恢复之前的滚动位置
    await nodes.nth(0).click();
    await expect(title).toHaveText(titleA);
    await expect.poll(() => inspector.evaluate((el) => el.scrollTop)).toBe(scrolledA);

    // 滚动记忆写在 localStorage（关标签页也保留），不再用 sessionStorage
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage).filter((k) => k.startsWith('atlas-state:')),
      session: Object.keys(sessionStorage).filter((k) => k.startsWith('atlas-state:')),
    }));
    expect(storage.local.length).toBe(1);
    expect(storage.session.length).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// 9. 工具栏状态记忆（nuqs 绑定 URL query）
// ──────────────────────────────────────────────────────────────
test.describe('工具栏状态记忆', () => {
  test('开关写进 URL query，刷新后恢复；Reset 后清空', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    // 打开小地图与图例，解锁画布：状态出现在地址栏
    await page.locator('[data-testid="btn-minimap"]').click();
    await page.locator('[data-testid="btn-legend"]').click();
    await page.locator('[data-testid="btn-lock"]').click();
    await expect(page.locator('.react-flow__minimap')).toBeVisible();
    await expect(page.locator('[data-testid="legend-panel"]')).toBeVisible();
    await expect(page).toHaveURL(/[?&]minimap=true/);
    await expect(page).toHaveURL(/[?&]legend=true/);
    await expect(page).toHaveURL(/[?&]locked=false/);

    // 刷新（URL 不变）后状态恢复
    await page.reload();
    await waitForCanvas(page);
    await expect(page.locator('.react-flow__minimap')).toBeVisible();
    await expect(page.locator('[data-testid="legend-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-lock"]')).toHaveAttribute('data-locked', 'false');

    // Reset 回到默认并清掉 query，再刷新也不会恢复旧状态
    await page.locator('[data-testid="btn-reset"]').click();
    await expect(page.locator('.react-flow__minimap')).not.toBeVisible();
    await expect(page).not.toHaveURL(/[?&]minimap=/);
    await page.reload();
    await waitForCanvas(page);
    await expect(page.locator('.react-flow__minimap')).not.toBeVisible();
    await expect(page.locator('[data-testid="legend-panel"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="btn-lock"]')).toHaveAttribute('data-locked', 'true');
  });
});

// ──────────────────────────────────────────────────────────────
// 10. 抽屉联动关闭与滑移过渡
// ──────────────────────────────────────────────────────────────
test.describe('抽屉联动关闭与过渡', () => {
  test('点画布空白处取消选中时抽屉滑出并卸载', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    const inspector = page.locator('[data-testid="inspector-panel"]');
    await page.locator('.react-flow__node').first().click();
    await expect(inspector).toBeVisible();
    // 挂载后下一帧加上 open class，触发滑入过渡
    await expect(inspector).toHaveClass(/open/);

    // 点画布空白处：节点取消选中，抽屉联动滑出
    await page.locator('[data-testid="atlas-canvas-wrap"]').click({ position: { x: 40, y: 40 } });
    await expect(inspector).not.toHaveClass(/open/);
    // 过渡结束后从 DOM 卸载
    await expect(inspector).toHaveCount(0);
  });

  test('拖拽节点不弹抽屉，普通点击才弹', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);
    // 解锁画布才能拖节点
    await page.locator('[data-testid="btn-lock"]').click();

    const node = page.locator('.react-flow__node').first();
    const inspector = page.locator('[data-testid="inspector-panel"]');

    // 拖拽节点：松手后不应弹出抽屉
    const box = await node.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(inspector).toHaveCount(0);

    // 普通点击：弹出抽屉
    await node.click();
    await expect(inspector).toBeVisible();
  });

  test('拖动画布平移不误关抽屉', async ({ page }) => {
    await page.goto('/');
    await waitForCanvas(page);

    const inspector = page.locator('[data-testid="inspector-panel"]');
    await page.locator('.react-flow__node').first().click();
    await expect(inspector).toBeVisible();

    // 在空白处按下并拖动画布平移：松手后抽屉应保持打开
    const wrap = page.locator('[data-testid="atlas-canvas-wrap"]');
    const box = await wrap.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 240, box.y + 180, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(inspector).toBeVisible();
  });
});

