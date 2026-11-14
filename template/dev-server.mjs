#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { port: 5179, data: path.join(__dirname, 'sample-data.json') };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) args.port = Number(argv[++i]);
    else if (argv[i] === '--data' && argv[i + 1]) args.data = path.resolve(argv[++i]);
  }
  return args;
}

function ensureDevDeps() {
  const rfCss = path.join(REPO_ROOT, 'node_modules', '@xyflow', 'react', 'dist', 'style.css');
  if (fs.existsSync(rfCss)) return;
  console.log('正在仓库中安装模板运行时依赖…');
  try {
    execSync('bun install', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch (_) {
    execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit' });
  }
}

async function bundleAppJs() {
  const entry = path.join(__dirname, 'app.jsx');
  const esbuildPath = path.join(REPO_ROOT, 'node_modules', 'esbuild', 'lib', 'main.js');
  if (fs.existsSync(esbuildPath)) {
    const esbuild = await import(esbuildPath);
    const res = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      target: ['es2020'],
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    });
    return res.outputFiles[0].text.replace(/import\.meta\.env/g, '({MODE:"development"})');
  }
  const tmpOut = path.join(REPO_ROOT, 'node_modules', '.cache-dev-bundle.js');
  execSync(
    `bun build "${entry}" --outfile "${tmpOut}" --target=browser --format=iife --define:process.env.NODE_ENV='"development"'`,
    { cwd: REPO_ROOT, stdio: 'pipe' }
  );
  return fs.readFileSync(tmpOut, 'utf8').replace(/import\.meta\.env/g, '({MODE:"development"})');
}

async function start() {
  const args = parseArgs(process.argv);
  ensureDevDeps();

  const rfCssPath = path.join(REPO_ROOT, 'node_modules', '@xyflow', 'react', 'dist', 'style.css');
  const stylesPath = path.join(__dirname, 'styles.css');
  const appPath = path.join(__dirname, 'app.jsx');

  let cachedBundle = await bundleAppJs();
  const clients = new Set();

  const broadcast = (type) => {
    for (const res of clients) {
      res.write(`data: ${JSON.stringify({ type, ts: Date.now() })}\n\n`);
    }
  };

  let debounceTimer = null;
  const watchTargets = [stylesPath, appPath, args.data].filter((p) => fs.existsSync(p));
  for (const file of watchTargets) {
    fs.watch(file, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          if (file === stylesPath) {
            console.log('[dev] styles.css 已更新 → 热替换 CSS');
            broadcast('css');
          } else {
            console.log(`[dev] ${path.basename(file)} 已更新 → 重新构建并刷新`);
            cachedBundle = await bundleAppJs();
            broadcast('reload');
          }
        } catch (err) {
          console.error('[dev] 构建出错：', err.message);
        }
      }, 60);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${args.port}`);

    if (url.pathname === '/__events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/__styles.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(stylesPath, 'utf8'));
      return;
    }

    if (url.pathname === '/__rf.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(rfCssPath, 'utf8'));
      return;
    }

    if (url.pathname === '/__bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(cachedBundle);
      return;
    }

    // ?data=xxx.json 切换数据文件（仅限 template 目录内的 .json，防止路径穿越）
    let dataPath = args.data;
    const dataParam = url.searchParams.get('data');
    if (dataParam) {
      const safeName = path.basename(dataParam);
      if (safeName.endsWith('.json')) {
        const candidate = path.join(__dirname, safeName);
        if (fs.existsSync(candidate)) dataPath = candidate;
      }
    }

    const rawData = fs.readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(rawData);
    const safeJson = JSON.stringify(parsed).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="${parsed.meta?.language || 'zh-CN'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#fafafa" />
  <title>${parsed.meta?.title || 'Atlas Loop'} — 开发预览</title>
  <link rel="stylesheet" href="/__rf.css" />
  <link id="atlas-live-css" rel="stylesheet" href="/__styles.css" />
</head>
<body>
  <div id="root"></div>
  <script id="atlas-data-json" type="application/json">${safeJson}</script>
  <script src="/__bundle.js"></script>
  <script>
    (() => {
      const es = new EventSource('/__events');
      es.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'css') {
          const link = document.getElementById('atlas-live-css');
          if (link) link.href = '/__styles.css?t=' + msg.ts;
        } else if (msg.type === 'reload') {
          window.location.reload();
        }
      };
    })();
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });

  server.listen(args.port, () => {
    console.log(`\nAtlas Loop 模板开发运行时已启动：http://localhost:${args.port}`);
    console.log(`- 编辑 template/styles.css  → 即时热替换 CSS（保留画布状态）`);
    console.log(`- 编辑 template/app.jsx     → 自动重新构建并刷新`);
    console.log(`- 数据源                    → ${args.data}`);
    console.log(`- 写入 viewer-shell         → npm run build:shell\n`);
  });
}

start();
