#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAtlasHtml } from './build_atlas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SAMPLES = [
  'sample-data.json',
  'sample-data-simple.json',
  'sample-data-child.json',
  'sample-data-highlight.json',
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-samples-'));
try {
  for (const sample of SAMPLES) {
    const dataPath = path.join(REPO_ROOT, 'template', sample);
    const outHtml = path.join(tmpDir, `${sample.replace(/\.json$/, '')}.html`);
    const built = buildAtlasHtml({ dataPath, outPath: outHtml, write: true });
    console.log(`[build] ${sample} -> depth=${built.depth}, nodes=${built.nodeCount}, feedback=${built.feedbackEdgeCount}`);
    execFileSync(process.execPath, [path.join(__dirname, 'verify_atlas.mjs'), '--html', outHtml], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }
  console.log(`\n全部 ${SAMPLES.length} 份示例地图构建与无头校验通过`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
