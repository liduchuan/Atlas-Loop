#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAtlasHtml } from './build_atlas.mjs';

export function extractAtlasDataFromHtml(html) {
  const match = String(html || '').match(
    /<script\b[^>]*\bid=["']atlas-data-json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match || !match[1] || match[1].includes('__ATLAS_DATA_JSON__')) {
    throw new Error('HTML 中缺少有效的 #atlas-data-json 数据载荷');
  }
  return JSON.parse(match[1]);
}

function encodeRelativeHref(fromHtmlPath, toHtmlPath) {
  const rel = path.relative(path.dirname(fromHtmlPath), toHtmlPath).replace(/\\/g, '/');
  return rel
    .split('/')
    .map((seg) => (seg === '.' || seg === '..' ? seg : encodeURIComponent(seg)))
    .join('/');
}

function findTarget(list, selector, kindLabel) {
  const byId = list.find((item) => item.id === selector);
  if (byId) return byId;
  const byTitle = list.filter((item) => item.title === selector);
  if (byTitle.length === 1) return byTitle[0];
  if (byTitle.length > 1) {
    throw new Error(`${kindLabel} "${selector}" 存在多个重名项，请改用 id 指定`);
  }
  throw new Error(`未找到目标${kindLabel}："${selector}"`);
}

export function linkChildAtlas({ parentHtml, childHtml, node, stream, url } = {}) {
  if (!parentHtml) throw new Error('缺少 --parent <parent.html>');
  if (!node && !stream) throw new Error('必须提供 --node <id-or-title> 或 --stream <id-or-title>');
  if (node && stream) throw new Error('--node 与 --stream 不能同时指定');
  if (!childHtml && !url) throw new Error('必须提供 --child <child.html> 或 --url <relative-url>');

  const resolvedParent = path.resolve(parentHtml);
  if (!fs.existsSync(resolvedParent) || !fs.statSync(resolvedParent).isFile()) {
    throw new Error(`父图 HTML 不存在：${resolvedParent}`);
  }

  let resolvedChild = null;
  if (childHtml) {
    resolvedChild = path.resolve(childHtml);
    if (!fs.existsSync(resolvedChild) || !fs.statSync(resolvedChild).isFile()) {
      throw new Error(`子图 HTML 不存在：${resolvedChild}`);
    }
  }

  const rawHtml = fs.readFileSync(resolvedParent, 'utf8');
  const data = extractAtlasDataFromHtml(rawHtml);

  const targetType = node ? 'node' : 'stream';
  const targetObj = node
    ? findTarget(Array.isArray(data.nodes) ? data.nodes : [], node, '节点')
    : findTarget(Array.isArray(data.streams) ? data.streams : [], stream, '脉络');

  const childAtlasUrl = url || encodeRelativeHref(resolvedParent, resolvedChild);
  if (!targetObj.deepDive || typeof targetObj.deepDive !== 'object') {
    targetObj.deepDive = {};
  }
  targetObj.deepDive.childAtlasUrl = childAtlasUrl;

  const built = buildAtlasHtml({ data, outPath: resolvedParent, write: true });
  return {
    ok: true,
    parentHtml: built.outputHtml,
    targetType,
    targetId: targetObj.id,
    targetTitle: targetObj.title,
    childAtlasUrl,
    bytes: built.bytes,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--parent') args.parent = argv[++i];
    else if (k === '--child') args.child = argv[++i];
    else if (k === '--node') args.node = argv[++i];
    else if (k === '--stream') args.stream = argv[++i];
    else if (k === '--url') args.url = argv[++i];
  }
  return args;
}

export function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (!args.parent || (!args.node && !args.stream) || (!args.child && !args.url)) {
    console.error(
      '用法：node link_child.mjs --parent <parent.html> --child <child.html> (--node <id|title> | --stream <id|title>) [--url <url>]'
    );
    process.exit(1);
  }
  const res = linkChildAtlas({
    parentHtml: args.parent,
    childHtml: args.child,
    node: args.node,
    stream: args.stream,
    url: args.url,
  });
  console.log(JSON.stringify(res, null, 2));
}

function isDirectCliRun() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectCliRun()) {
  try {
    main();
  } catch (err) {
    console.error(`link_child.mjs：${err.message}`);
    process.exit(1);
  }
}
