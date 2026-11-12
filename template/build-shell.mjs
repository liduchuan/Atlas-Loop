#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function ensureDevDeps() {
  const rfCss = path.join(REPO_ROOT, 'node_modules', '@xyflow', 'react', 'dist', 'style.css');
  if (fs.existsSync(rfCss)) return;
  try {
    execSync('bun install', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch (_) {
    execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit' });
  }
}

async function compileBundle() {
  const entry = path.join(__dirname, 'app.jsx');
  const esbuildPath = path.join(REPO_ROOT, 'node_modules', 'esbuild', 'lib', 'main.js');
  if (fs.existsSync(esbuildPath)) {
    const esbuild = await import(esbuildPath);
    const res = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      write: false,
      format: 'iife',
      target: ['es2020'],
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });
    return res.outputFiles[0].text;
  }
  const tmpOut = path.join(REPO_ROOT, 'node_modules', '.cache-prod-bundle.js');
  execSync(
    `bun build "${entry}" --outfile "${tmpOut}" --minify --target=browser --format=iife --define:process.env.NODE_ENV='"production"'`,
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  return fs.readFileSync(tmpOut, 'utf8');
}

async function main() {
  ensureDevDeps();
  const rfCss = fs.readFileSync(
    path.join(REPO_ROOT, 'node_modules', '@xyflow', 'react', 'dist', 'style.css'),
    'utf8'
  );
  const customCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const rawBundle = await compileBundle();
  const safeBundle = rawBundle
    .replace(/import\.meta\.env/g, '({MODE:"production"})')
    .replace(/<\/script/gi, '<\\/script');

  const htmlTemplate = `<!DOCTYPE html>
<html lang="__ATLAS_HTML_LANG__">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#fafafa" />
  <title>__ATLAS_HTML_TITLE__</title>
  <style>${rfCss}\n${customCss}</style>
</head>
<body>
  <div id="root"></div>
  <script id="atlas-data-json" type="application/json">__ATLAS_DATA_JSON__</script>
  <script>${safeBundle}</script>
</body>
</html>
`;

  const outAsset = path.join(REPO_ROOT, 'assets', 'viewer-shell.html');
  fs.mkdirSync(path.dirname(outAsset), { recursive: true });
  fs.writeFileSync(outAsset, htmlTemplate, 'utf8');
  console.log(`已构建 assets/viewer-shell.html（${(fs.statSync(outAsset).size / 1024).toFixed(1)} KB）`);
}

main();
