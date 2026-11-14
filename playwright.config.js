// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Atlas Loop Playwright 配置
 * 运行前先启动开发服务器：npm run dev
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,  // 共用同一个 dev-server，顺序跑
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5179',
    headless: false,          // 题目要求：用真实浏览器跑
    viewport: { width: 1280, height: 800 },
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 下载目录（测试 PNG export 时用）
    acceptDownloads: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * 自动启动/停止开发服务器
   * 如果已经手动 npm run dev，可以注释掉这段，直接 npx playwright test
   */
  webServer: {
    command: 'node template/dev-server.mjs',
    url: 'http://localhost:5179',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
