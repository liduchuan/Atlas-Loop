#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractAtlasDataFromHtml } from './link_child.mjs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(files) {
  const enc = new TextEncoder();
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const raw = f.bytes;
    const compressed = zlib.deflateRawSync(raw);
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const lh = new DataView(new ArrayBuffer(30 + nameBytes.length));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 文件名
    lh.setUint16(8, method, true);
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, payload.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    new Uint8Array(lh.buffer, 30).set(nameBytes);

    const cd = new DataView(new ArrayBuffer(46 + nameBytes.length));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, payload.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    new Uint8Array(cd.buffer, 46).set(nameBytes);

    localParts.push(new Uint8Array(lh.buffer), payload);
    cdParts.push(new Uint8Array(cd.buffer));
    offset += 30 + nameBytes.length + payload.length;
  }

  const cdSize = cdParts.reduce((sum, b) => sum + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  return Buffer.concat([
    ...localParts.map((u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength)),
    ...cdParts.map((u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength)),
    Buffer.from(eocd.buffer),
  ]);
}

function safeFileBaseName(title) {
  return (
    String(title || 'atlas')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'atlas'
  );
}

function uniqueHtmlName(title, usedNames) {
  const base = safeFileBaseName(title);
  let name = `${base}.html`;
  for (let suffix = 2; usedNames.has(name); suffix++) {
    name = `${base}-${suffix}.html`;
  }
  usedNames.add(name);
  return name;
}

function resolveLocalHtmlRef(ref, baseHtmlAbsPath) {
  if (!ref || typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:|javascript:|data:|vscode:|zed:)/i.test(trimmed)) return null;

  let candidate;
  if (trimmed.startsWith('file://')) {
    try {
      candidate = fileURLToPath(trimmed);
    } catch {
      return null;
    }
  } else {
    const clean = trimmed.split('#')[0].split('?')[0];
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      decoded = clean;
    }
    candidate = path.isAbsolute(decoded)
      ? path.resolve(decoded)
      : path.resolve(path.dirname(baseHtmlAbsPath), decoded);
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  try {
    return fs.realpathSync(candidate);
  } catch {
    return candidate;
  }
}

function collectDeepDives(atlasData) {
  const dives = [];
  for (const s of atlasData.streams || []) {
    if (s?.deepDive) dives.push(s.deepDive);
  }
  for (const n of atlasData.nodes || []) {
    if (n?.deepDive) dives.push(n.deepDive);
    for (const sn of n?.detailGraph?.nodes || []) {
      if (sn?.deepDive) dives.push(sn.deepDive);
    }
  }
  return dives;
}

function replaceAtlasDataInHtml(html, data) {
  const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');
  return String(html).replace(
    /(<script\b[^>]*\bid=["']atlas-data-json["'][^>]*>)[\s\S]*?(<\/script>)/i,
    (_, openTag, closeTag) => `${openTag}${safeJson}${closeTag}`
  );
}

export function packAtlasZip({ entry, out } = {}) {
  if (!entry) throw new Error('缺少 --entry <root.html>');
  const entryPath = path.resolve(entry);
  if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
    throw new Error(`入口 HTML 不存在：${entryPath}`);
  }

  const rootReal = fs.realpathSync(entryPath);
  const rootHtml = fs.readFileSync(rootReal, 'utf8');
  const rootData = extractAtlasDataFromHtml(rootHtml);
  const usedNames = new Set();
  const rootName = uniqueHtmlName(rootData.meta?.title || path.basename(rootReal, '.html'), usedNames);

  const records = [
    {
      absPath: rootReal,
      name: rootName,
      data: JSON.parse(JSON.stringify(rootData)),
      html: rootHtml,
      discoveredFrom: null,
    },
  ];
  const byAbsPath = new Map([[rootReal, records[0]]]);
  const skipped = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    for (const dive of collectDeepDives(rec.data)) {
      if (!dive.childAtlasUrl) continue;
      const targetReal = resolveLocalHtmlRef(dive.childAtlasUrl, rec.absPath);
      if (!targetReal) {
        skipped.push({ from: rec.absPath, url: dive.childAtlasUrl, reason: '文件不存在或非本地 HTML' });
        continue;
      }
      if (byAbsPath.has(targetReal)) continue;
      try {
        const childHtml = fs.readFileSync(targetReal, 'utf8');
        const childData = extractAtlasDataFromHtml(childHtml);
        if (!childData.meta?.title || !Array.isArray(childData.nodes)) {
          throw new Error('缺少 meta.title 或 nodes');
        }
        const childName = uniqueHtmlName(childData.meta.title, usedNames);
        const childRec = {
          absPath: targetReal,
          name: childName,
          data: JSON.parse(JSON.stringify(childData)),
          html: childHtml,
          discoveredFrom: rec.absPath,
        };
        records.push(childRec);
        byAbsPath.set(targetReal, childRec);
      } catch (err) {
        skipped.push({ from: rec.absPath, url: dive.childAtlasUrl, reason: err.message });
      }
    }
  }

  const enc = new TextEncoder();
  const files = [];
  for (const rec of records) {
    for (const dive of collectDeepDives(rec.data)) {
      if (!dive.childAtlasUrl) continue;
      const targetReal = resolveLocalHtmlRef(dive.childAtlasUrl, rec.absPath);
      const target = targetReal ? byAbsPath.get(targetReal) : null;
      if (target) dive.childAtlasUrl = encodeURIComponent(target.name);
      else delete dive.childAtlasUrl;
    }
    if (rec.data.meta) {
      const parentReal = rec.data.meta.parentMapHtml
        ? resolveLocalHtmlRef(rec.data.meta.parentMapHtml, rec.absPath)
        : null;
      const parent =
        (parentReal ? byAbsPath.get(parentReal) : null) || byAbsPath.get(rec.discoveredFrom) || null;
      rec.data.meta.parentMapHtml = parent ? encodeURIComponent(parent.name) : null;
    }
    const rewrittenHtml = replaceAtlasDataInHtml(rec.html, rec.data);
    files.push({ name: rec.name, bytes: enc.encode(rewrittenHtml) });
  }

  const outZip = out
    ? path.resolve(out)
    : path.join(path.dirname(entryPath), `${safeFileBaseName(rootData.meta?.title)}.zip`);
  fs.mkdirSync(path.dirname(outZip), { recursive: true });
  const zipBuffer = buildZipBuffer(files);
  fs.writeFileSync(outZip, zipBuffer);

  return {
    ok: true,
    outputZip: outZip,
    bytes: zipBuffer.length,
    fileCount: files.length,
    files: files.map((f) => f.name),
    skipped,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--entry') args.entry = argv[++i];
    else if (k === '--out') args.out = argv[++i];
  }
  return args;
}

export function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (!args.entry) {
    console.error('用法：node pack_atlas.mjs --entry <root.html> [--out <bundle.zip>]');
    process.exit(1);
  }
  const res = packAtlasZip({ entry: args.entry, out: args.out });
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
    console.error(`pack_atlas.mjs：${err.message}`);
    process.exit(1);
  }
}
