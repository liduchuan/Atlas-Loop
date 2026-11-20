#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAtlasHtml, validateAndEnrich } from './build_atlas.mjs';
import { extractAtlasDataFromHtml, linkChildAtlas } from './link_child.mjs';
import { packAtlasZip } from './pack_atlas.mjs';
import { catalogAtlas } from './profile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const fnLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + fnLen).toString('utf8');
    const dataStart = offset + 30 + fnLen + extraLen;
    const rawSlice = buf.subarray(dataStart, dataStart + compSize);
    const inflated = method === 8 ? zlib.inflateRawSync(rawSlice) : rawSlice;
    assert.equal(inflated.length, uncompSize, `ZIP 条目 ${name} 解压长度不一致`);
    assert.equal(flags & 0x0800, 0x0800, `ZIP 条目 ${name} 应带 UTF-8 标志`);
    entries.set(name, inflated.toString('utf8'));
    offset = dataStart + compSize;
  }
  return entries;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('4 份内置样例数据全部通过校验与构建', () => {
  const tmp = makeTempDir('atlas-pipe-samples-');
  try {
    const samples = [
      ['sample-data.json', 3, 0],
      ['sample-data-simple.json', 2, 1],
      ['sample-data-child.json', 3, 0],
      ['sample-data-highlight.json', 2, 0],
    ];
    for (const [file, expectDepth, expectFeedback] of samples) {
      const outPath = path.join(tmp, `${file}.html`);
      const res = buildAtlasHtml({
        dataPath: path.join(REPO_ROOT, 'template', file),
        outPath,
        write: true,
      });
      assert.equal(res.ok, true);
      assert.equal(res.depth, expectDepth);
      assert.equal(res.feedbackEdgeCount, expectFeedback);
      assert.ok(fs.existsSync(outPath) && res.bytes > 100_000);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('推进边成环被拦截；显式 kind: "feedback" 回路放行且不虚增认知阶数', () => {
  const base = {
    schemaVersion: '2.0',
    meta: {
      title: '反馈回路校验',
      language: 'zh-CN',
      generatedByModel: 'test',
      level: 0,
      depth: 2,
      depthReason: 'A -> B -> C 两阶推进，C 回流到 A 作为反馈',
    },
    streams: [{ id: 's1', title: '主脉络' }],
    nodes: [
      {
        id: 'a',
        streamIds: ['s1'],
        role: 'entry',
        title: 'A',
        deepDive: {
          askPrompts: [{ title: '深入问题', prompt: '请具体分析为什么 A 到 B 的阈值在临界负载时会翻转？' }],
        },
      },
      { id: 'b', streamIds: ['s1'], role: 'core', title: 'B' },
      { id: 'c', streamIds: ['s1'], role: 'outcome', title: 'C' },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', label: '累积推进' },
      { id: 'e2', source: 'b', target: 'c', label: '触发跃迁' },
      { id: 'e3', source: 'c', target: 'a', label: '负反馈回流' },
    ],
  };

  assert.throws(
    () => validateAndEnrich(structuredClone(base)),
    /顶层推进边构成了环/
  );

  const withFeedback = structuredClone(base);
  withFeedback.edges[2].kind = 'feedback';
  const ok = validateAndEnrich(withFeedback);
  assert.equal(ok.feedbackEdgeCount, 1);

  const tooShallow = structuredClone(withFeedback);
  tooShallow.meta.depth = 3;
  assert.throws(
    () => validateAndEnrich(tooShallow),
    /只有 2 阶/
  );
});

test('linkChildAtlas 回写父图并同步消除未探索线索；packAtlasZip 离线打包保留 hljs', () => {
  const tmp = makeTempDir('atlas-pipe-link-pack-');
  try {
    const parentData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'template', 'sample-data.json'), 'utf8'));
    delete parentData.nodes[0].deepDive.childAtlasUrl;
    const childData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'template', 'sample-data-highlight.json'), 'utf8'));
    childData.meta.level = 1;
    childData.meta.drillDownTarget = parentData.nodes[0].title;
    childData.meta.parentMapHtml = 'parent.html';

    const parentHtml = path.join(tmp, 'parent.html');
    const childHtml = path.join(tmp, 'sub', 'highlight-child.html');
    buildAtlasHtml({ data: parentData, outPath: parentHtml, write: true });
    buildAtlasHtml({ data: childData, outPath: childHtml, write: true });

    const linked = linkChildAtlas({
      parentHtml,
      childHtml,
      node: 'n-grind',
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.childAtlasUrl, 'sub/highlight-child.html');

    const reparsedParent = extractAtlasDataFromHtml(fs.readFileSync(parentHtml, 'utf8'));
    assert.equal(reparsedParent.nodes[0].deepDive.childAtlasUrl, 'sub/highlight-child.html');

    const profile = { version: 2, entries: {}, atlases: [] };
    catalogAtlas(profile, { domain: '测试/咖啡', htmlPath: parentHtml });
    assert.ok(!profile.atlases[0].unexploredTargets.includes(parentData.nodes[0].title));

    const zipOut = path.join(tmp, 'bundle.zip');
    const packed = packAtlasZip({ entry: parentHtml, out: zipOut });
    assert.equal(packed.ok, true);
    assert.equal(packed.fileCount, 2);
    assert.equal(packed.skipped.length, 0);

    const entries = readZipEntries(zipOut);
    assert.equal(entries.size, 2);
    const parentEntryHtml = entries.get(packed.files[0]);
    const childEntryHtml = entries.get(packed.files[1]);
    const zippedParentData = extractAtlasDataFromHtml(parentEntryHtml);
    const zippedChildData = extractAtlasDataFromHtml(childEntryHtml);
    assert.equal(decodeURIComponent(zippedParentData.nodes[0].deepDive.childAtlasUrl), packed.files[1]);
    assert.equal(decodeURIComponent(zippedChildData.meta.parentMapHtml), packed.files[0]);
    assert.ok(childEntryHtml.includes('id="atlas-hljs-manifest"'));
    assert.ok(childEntryHtml.includes('id="atlas-hljs-core"'));
    assert.ok(childEntryHtml.includes('id="atlas-hljs-lang-python"'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install 安装后的 skill 在无自动模块检测（Node 18/20.0–20.18 行为）下仍可正常构建', () => {
  const tmp = makeTempDir('atlas-pipe-install-');
  try {
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'atlas-loop.mjs'), 'install', '--dir', tmp], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    const skillDir = path.join(tmp, 'atlas-loop');
    assert.ok(fs.existsSync(path.join(skillDir, 'package.json')));
    assert.ok(fs.existsSync(path.join(skillDir, 'template', 'snippet-lang.mjs')));

    const outHtml = path.join(tmp, 'installed-out.html');
    execFileSync(
      process.execPath,
      [
        '--no-experimental-detect-module',
        path.join(skillDir, 'scripts', 'build_atlas.mjs'),
        '--data',
        path.join(skillDir, 'template', 'sample-data-simple.json'),
        '--out',
        outHtml,
      ],
      { cwd: tmp, stdio: 'pipe' }
    );
    assert.ok(fs.existsSync(outHtml));
    const parsed = extractAtlasDataFromHtml(fs.readFileSync(outHtml, 'utf8'));
    assert.equal(parsed.meta.depth, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exit(failed === 0 ? 0 : 1);
