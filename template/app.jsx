import dagre from '@dagrejs/dagre';
import {
    Background,
    Handle,
    MarkerType,
    MiniMap,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const I18N_DICT = {
  zh: {
    skipToCanvas: '跳转到交互画布',
    modelPrefix: '生成模型：',
    backParent: '返回上级地图',
    levelOverview: 'L0 全景图谱',
    levelSubPrefix: 'L1+ 深度专题：',
    allStreams: '全部脉络',
    searchLabel: '搜索节点与提示词',
    searchPlaceholder: '搜索概念、机制、路径或追问…',
    zoomIn: '放大',
    zoomOut: '缩小',
    lock: '锁定位置',
    unlock: '已锁定',
    fitView: '适配全图',
    reset: '重置',
    legend: '图例',
    exportPng: '导出 PNG',
    exportZip: '导出 ZIP',
    exportZipFailed: 'ZIP 导出失败，请刷新页面后重试。',
    scopeNotes: '范围与待确认',
    learningPath: '推荐顺序',
    expandDetail: '展开细节',
    collapseDetail: '收起细节',
    detailEdgeLabel: '下钻细节',
    deepDiveBadgeTitle: '打开继续深挖提示词',
    deepDiveModalTitle: '继续深潜（Atlas Loop）',
    tabAsk: '定向追问',
    tabRecursive: '递归生成子地图',
    tabChildAtlas: '进入子图',
    openChildAtlas: '打开已生成的子图',
    copyBtn: '复制提示词',
    copiedBtn: '已复制',
    copySnippet: '复制片段',
    openInEditor: '在编辑器中打开',
    editorConfirmHint: '首次点击时浏览器可能会请求打开外部编辑器权限；若文件移动请重新生成。',
    recursiveUsageHint: '将下方提示词发送给 AI，即可围绕当前节点递归生成下一层独立交互式 HTML 子地图：',
    whatItDoes: '核心说明',
    whyItMatters: '关键价值',
    miniMap: '缩览图',
    inputsLabel: '前置 / 输入',
    outputsLabel: '结果 / 产出',
    mechanismsLabel: '内部机制与影响',
    watchoutsLabel: '理解注意点',
    anchorsLabel: '关联依据与锚点',
    openDeepDiveBtn: '查看进阶追问与递归指令',
    unverifiedTag: '待确认',
    verifiedTag: '已核实',
    uncoveredTitle: '未覆盖范围',
    unverifiedTitle: '待确认项说明',
    noSearchMatches: '无匹配节点',
    nestedBadge: '内部细节',
    depthPrefix: '因果链深度：',
    hopsUnit: ' 跳',
    audiencePrefix: '读者档位：',
    scoreIntent: '这张图画到这一层，对你来说深了还是浅了？',
    scoreOptions: '2 全是新的 · 4 名词眼熟但串不起来 · 6 主线跟得上 · 8 大部分能预判 · 10 能指出哪里不对',
    scoreHowto: '回一个分数即可，下次的深度据此调整',
    close: '关闭',
    roles: {
      entry: '起点 / 命题',
      core: '核心机制',
      branch: '判断 / 分岔',
      foundation: '底层基石',
      context: '外部关联',
      extension: '延伸演化',
      outcome: '最终结论',
    },
  },
  en: {
    skipToCanvas: 'Skip to interactive canvas',
    modelPrefix: 'Model: ',
    backParent: 'Back to Parent Atlas',
    levelOverview: 'L0 Overview',
    levelSubPrefix: 'L1+ Focus: ',
    allStreams: 'All Streams',
    searchLabel: 'Search nodes & prompts',
    searchPlaceholder: 'Search concepts, paths, or prompts…',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    lock: 'Lock',
    unlock: 'Locked',
    fitView: 'Fit View',
    reset: 'Reset',
    legend: 'Legend',
    exportPng: 'Export PNG',
    exportZip: 'Export ZIP',
    exportZipFailed: 'ZIP export failed. Refresh the page and try again.',
    scopeNotes: 'Scope & Notes',
    learningPath: 'Learning Order',
    expandDetail: 'Details',
    collapseDetail: 'Collapse',
    detailEdgeLabel: 'Drill-down',
    deepDiveBadgeTitle: 'Open deep-dive prompts',
    deepDiveModalTitle: 'Deep Dive (Atlas Loop)',
    tabAsk: 'Follow-Up Prompts',
    tabRecursive: 'Recursive Sub-Atlas',
    tabChildAtlas: 'Child Atlas',
    openChildAtlas: 'Open Generated Child Atlas',
    copyBtn: 'Copy Prompt',
    copiedBtn: 'Copied',
    copySnippet: 'Copy Snippet',
    openInEditor: 'Open in Editor',
    editorConfirmHint: 'Your browser may ask permission to open the external editor. Regenerate if files move.',
    recursiveUsageHint: 'Send this prompt to your AI agent to generate a linked child HTML atlas for this node:',
    whatItDoes: 'Summary',
    whyItMatters: 'Why It Matters',
    miniMap: 'Mini Map',
    inputsLabel: 'Inputs / Conditions',
    outputsLabel: 'Outputs / Effects',
    mechanismsLabel: 'Mechanism & Side Effects',
    watchoutsLabel: 'Watchouts',
    anchorsLabel: 'Evidence & Anchors',
    openDeepDiveBtn: 'View Deep-Dive & Recursive Prompts',
    unverifiedTag: 'Unverified',
    verifiedTag: 'Verified',
    uncoveredTitle: 'Uncovered Scope',
    unverifiedTitle: 'Unverified Items',
    noSearchMatches: 'No matching nodes',
    nestedBadge: 'Sub-node',
    depthPrefix: 'Depth: ',
    hopsUnit: ' hops',
    audiencePrefix: 'Audience: ',
    scoreIntent: 'Is this map too shallow or too deep for you?',
    scoreOptions: '2 all new · 4 names ring a bell, no structure · 6 main line readable · 8 mostly predictable · 10 can point out what is wrong',
    scoreHowto: 'Reply with a score; the next map adapts to it',
    close: 'Close',
    roles: {
      entry: 'Entry / Thesis',
      core: 'Core Mechanism',
      branch: 'Decision / Branch',
      foundation: 'Foundation',
      context: 'Context',
      extension: 'Extension',
      outcome: 'Outcome',
    },
  },
};

function resolveI18n(meta = {}) {
  const langRaw = String(meta.language || 'en').toLowerCase();
  const base = langRaw.startsWith('zh') ? I18N_DICT.zh : I18N_DICT.en;
  const custom = meta.uiLabels && typeof meta.uiLabels === 'object' ? meta.uiLabels : {};
  return {
    ...base,
    ...custom,
    roles: { ...base.roles, ...(custom.roles || {}) },
  };
}

const MIN_DEPTH = 2;
const MAX_DEPTH = 6;

// 因果链深度：meta.depth 是构建期已校验过的因果跳数；缺省时退回 3 跳
function resolveDepth(meta) {
  const d = Number(meta.depth);
  if (Number.isInteger(d) && d >= MIN_DEPTH && d <= MAX_DEPTH) return d;
  return 3;
}

// 克制的单色 + 低饱和语义指示点（卡片不使用彩虹填充）
const ROLE_DOT_COLORS = {
  entry: '#18181b',
  core: '#52525b',
  branch: '#b45309',
  foundation: '#334155',
  context: '#a1a1aa',
  extension: '#6366f1',
  outcome: '#15803d',
};

function IconSearch() {
  return (
    <svg className="atlas-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function StrokeIcon({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconZoomIn() {
  return (
    <StrokeIcon>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </StrokeIcon>
  );
}

function IconZoomOut() {
  return (
    <StrokeIcon>
      <path d="M5 12h14" />
    </StrokeIcon>
  );
}

function IconLock({ locked }) {
  return locked ? (
    <StrokeIcon>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </StrokeIcon>
  ) : (
    <StrokeIcon>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </StrokeIcon>
  );
}

function IconFit() {
  return (
    <StrokeIcon>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    </StrokeIcon>
  );
}

function IconReset() {
  return (
    <StrokeIcon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </StrokeIcon>
  );
}

function IconLegend() {
  return (
    <StrokeIcon>
      <circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10 6h10" />
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10 12h10" />
      <circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10 18h7" />
    </StrokeIcon>
  );
}

function IconMiniMap() {
  return (
    <StrokeIcon>
      {/* 外框代表全图，内框代表视口 */}
      <rect x="2" y="4" width="20" height="16" rx="1.5" />
      <rect x="12" y="10" width="8" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
    </StrokeIcon>
  );
}

function IconExportPng() {
  // 图片图标：矩形边框 + 圆圈 + 山峰线条
  return (
    <StrokeIcon>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m3 18 5-5.5 4 4 3-3.5 7 5" />
    </StrokeIcon>
  );
}

function IconExport() {
  // 通用下载箭头，用于 ZIP 导出
  return (
    <StrokeIcon>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </StrokeIcon>
  );
}

function IconDeepDive() {
  return (
    <StrokeIcon size={13}>
      <path d="m15 10 5 5-5 5" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </StrokeIcon>
  );
}

function IconArrowLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch (_) {
    // 忽略
  }
  document.body.removeChild(ta);
  return true;
}

// ── 视口 & 交互状态缓存（从子图返回时恢复位置）────────────────────────
const _STATE_KEY = 'atlas-state:' + location.href;
function _loadSavedState() {
  try { return JSON.parse(sessionStorage.getItem(_STATE_KEY) || 'null'); }
  catch { return null; }
}
function _saveState(s) {
  try { sessionStorage.setItem(_STATE_KEY, JSON.stringify(s)); } catch {}
}
// 页面加载时读取一次；pagehide 时写入
const _savedState = _loadSavedState();

// ── 最小 CRC-32 + Store-only ZIP 打包（无需第三方库）──────────────────
const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function _crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ _CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function _buildZip(files) {
  // files: Array<{ name: string, bytes: Uint8Array }>
  const enc = new TextEncoder();
  const localParts = [];
  const cdParts = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.bytes;
    const crc = _crc32(data);
    const lh = new DataView(new ArrayBuffer(30 + name.length));
    lh.setUint32(0, 0x04034b50, true); // 本地文件头签名
    lh.setUint16(4, 20, true);         // 所需版本
    lh.setUint16(6, 0x0800, true);     // 文件名使用 UTF-8
    lh.setUint16(8, 0, true);          // 压缩方法: 0 = Store
    lh.setUint16(10, 0, true); lh.setUint16(12, 0, true); // 修改时间/日期
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    new Uint8Array(lh.buffer, 30).set(name);
    const cd = new DataView(new ArrayBuffer(46 + name.length));
    cd.setUint32(0, 0x02014b50, true); // 中央目录头签名
    cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true); cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true); cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true); cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true); cd.setUint32(42, off, true);
    new Uint8Array(cd.buffer, 46).set(name);
    localParts.push(new Uint8Array(lh.buffer), data);
    cdParts.push(new Uint8Array(cd.buffer));
    off += 30 + name.length + data.length;
  }
  const cdSize = cdParts.reduce((s, b) => s + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // 结束中央目录签名
  eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, off, true);
  eocd.setUint16(20, 0, true);
  const all = [...localParts, ...cdParts, new Uint8Array(eocd.buffer)];
  const total = all.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const b of all) { out.set(b, pos); pos += b.length; }
  return out;
}

function _safeFileName(title) {
  return String(title || 'atlas')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'atlas';
}

async function _exportZip(data, meta) {
  const enc = new TextEncoder();
  const files = [];
  const curTitle = _safeFileName(meta.title);

  // ── CSS ──────────────────────────────────────────────────────────
  // 按页面顺序收集内联和外部 CSS。即使有其他代码注入 <style>，也不能漏掉模板的样式表。
  const cssParts = [];
  for (const el of document.querySelectorAll('head style, head link[rel~="stylesheet"]')) {
    if (el.tagName === 'STYLE') {
      cssParts.push(el.textContent || '');
    } else {
      const res = await fetch(el.href);
      if (!res.ok) throw new Error(`无法读取样式表：${el.href} (${res.status})`);
      cssParts.push(await res.text());
    }
  }
  let styles = cssParts.join('\n');
  if (!styles.includes('.react-flow') || !styles.includes('.atlas-topbar')) {
    throw new Error('ZIP 导出缺少地图样式，请刷新页面后重试');
  }
  // 防止 CSS 内容意外截断 style 标签
  styles = styles.replace(/<\/style/gi, '<\\/style');

  // ── App JS ───────────────────────────────────────────────────────
  // 生产包：JS 内联在无 src / 无 type / 无 id 的 <script> 里
  // 开发模式：JS 以 <script src="/__bundle.js"> 外部文件加载
  let appScript = '';
  // 生产包：App JS 是内联的大型脚本（>10 KB），开发模式注入的 SSE 热更新脚本只有几百字节
  const inlineScriptEl = Array.from(document.querySelectorAll('body script'))
    .find(s => !s.type && !s.id && !s.src && s.textContent.length > 10_000);
  if (inlineScriptEl) {
    appScript = inlineScriptEl.textContent;
  } else {
    const extScriptEl = Array.from(document.querySelectorAll('body script'))
      .find(s => !s.type && !s.id && s.src);
    if (extScriptEl) {
      const res = await fetch(extScriptEl.src);
      if (!res.ok) throw new Error(`无法读取地图脚本：${extScriptEl.src} (${res.status})`);
      appScript = await res.text();
    }
  }
  if (!appScript.trim()) throw new Error('ZIP 导出缺少地图脚本，请刷新页面后重试');
  // 防止脚本内容意外截断 script 标签（开发包不含此转义，需手动补）
  appScript = appScript.replace(/<\/script/gi, '<\\/script');

  function _buildHtml(atlasData) {
    const title = String(atlasData.meta?.title || 'Atlas')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lang = String(atlasData.meta?.language || 'zh').split('-')[0];
    // 防止 JSON 内容意外截断 script 标签
    const dataJson = JSON.stringify(atlasData).replace(/<\//g, '<\\/');
    return [
      '<!DOCTYPE html>',
      '<html lang="' + lang + '">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '  <meta name="theme-color" content="#fafafa" />',
      '  <title>' + title + '</title>',
      '  <style>' + styles + '</style>',
      '</head>',
      '<body>',
      '  <div id="root"></div>',
      '  <script id="atlas-data-json" type="application/json">' + dataJson + '</script>',
      '  <script>' + appScript + '</script>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  // 遍历子图，把开发预览的 ?data=... 和线上 HTML 都转成 ZIP 内的独立页面。
  // 用 URL 查重，用标题命名文件；链接在数据中改为相对文件名。
  const pageUrl = new URL(location.href);
  pageUrl.hash = '';
  const records = [{
    url: pageUrl.href,
    name: curTitle + '.html',
    data: JSON.parse(JSON.stringify(data)),
    discoveredFrom: null,
  }];
  const byUrl = new Map([[pageUrl.href, records[0]]]);
  const usedNames = new Set([records[0].name]);
  const deepDives = (atlasData) => [...(atlasData.nodes || []), ...(atlasData.streams || [])]
    .map(item => item.deepDive)
    .filter(Boolean);
  const resolveUrl = (value, base) => {
    try {
      const url = new URL(value, base);
      url.hash = '';
      return url.href;
    } catch { return null; }
  };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    for (const dive of deepDives(record.data)) {
      if (!dive.childAtlasUrl) continue;
      const childUrl = resolveUrl(dive.childAtlasUrl, record.url);
      if (!childUrl || byUrl.has(childUrl)) continue;
      try {
        const res = await fetch(childUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const childDoc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const payload = childDoc.getElementById('atlas-data-json')?.textContent;
        if (!payload || payload.includes('__ATLAS_DATA_JSON__')) throw new Error('缺少子图数据');
        const childData = JSON.parse(payload);
        if (!childData.meta?.title || !Array.isArray(childData.nodes)) throw new Error('子图数据无效');

        const baseName = _safeFileName(childData.meta.title);
        let name = baseName + '.html';
        for (let suffix = 2; usedNames.has(name); suffix++) name = `${baseName}-${suffix}.html`;
        usedNames.add(name);
        const child = { url: childUrl, name, data: childData, discoveredFrom: record.url };
        records.push(child);
        byUrl.set(childUrl, child);
      } catch (error) {
        console.warn('[Atlas] Skipped child Atlas in ZIP:', childUrl, error);
      }
    }
  }

  for (const record of records) {
    for (const dive of deepDives(record.data)) {
      if (!dive.childAtlasUrl) continue;
      const target = byUrl.get(resolveUrl(dive.childAtlasUrl, record.url));
      if (target) dive.childAtlasUrl = encodeURIComponent(target.name);
      else delete dive.childAtlasUrl; // 不在 ZIP 中时避免出现无效的 file:// 链接
    }
    if (record.data.meta) {
      const parentUrl = record.data.meta.parentMapHtml
        ? resolveUrl(record.data.meta.parentMapHtml, record.url) : null;
      const parent = byUrl.get(parentUrl) || byUrl.get(record.discoveredFrom);
      record.data.meta.parentMapHtml = parent ? encodeURIComponent(parent.name) : null;
    }
    files.push({ name: record.name, bytes: enc.encode(_buildHtml(record.data)) });
  }

  const zipBytes = _buildZip(files);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = curTitle + '.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

function buildGraphElements(data, activeStream, expandedIds, t, handlers) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 64,
    ranksep: 116,
    marginx: 44,
    marginy: 44,
  });

  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data.edges) ? data.edges : [];

  const visibleTopNodes = rawNodes.filter((n) => {
    if (activeStream === 'all') return true;
    return Array.isArray(n.streamIds) && n.streamIds.includes(activeStream);
  });

  const visibleTopSet = new Set(visibleTopNodes.map((n) => n.id));
  const flowNodes = [];
  const flowEdges = [];

  for (const n of visibleTopNodes) {
    const detailCount = Array.isArray(n.detailGraph?.nodes) ? n.detailGraph.nodes.length : 0;
    const isExpanded = expandedIds.has(n.id) && detailCount > 0;
    const width = 296;
    const height = 144;
    g.setNode(n.id, { width, height });

    flowNodes.push({
      id: n.id,
      type: 'atlasNode',
      position: { x: 0, y: 0 },
      data: {
        item: n,
        isSubNode: false,
        detailCount,
        isExpanded,
        t,
        ...handlers,
      },
      style: { width, minHeight: height },
    });

    if (isExpanded) {
      const subNodes = n.detailGraph.nodes || [];
      const subEdges = n.detailGraph.edges || [];
      const incomingCount = new Map();
      for (const sn of subNodes) incomingCount.set(sn.id, 0);
      for (const se of subEdges) {
        if (incomingCount.has(se.target)) {
          incomingCount.set(se.target, incomingCount.get(se.target) + 1);
        }
      }

      for (const sn of subNodes) {
        const subFlowId = `${n.id}::${sn.id}`;
        const sw = 264;
        const sh = 120;
        g.setNode(subFlowId, { width: sw, height: sh });
        flowNodes.push({
          id: subFlowId,
          type: 'atlasNode',
          position: { x: 0, y: 0 },
          data: {
            item: {
              ...sn,
              parentTitle: n.title,
              parentId: n.id,
            },
            isSubNode: true,
            detailCount: 0,
            isExpanded: false,
            t,
            ...handlers,
          },
          style: { width: sw, minHeight: sh },
        });

        if ((incomingCount.get(sn.id) || 0) === 0) {
          const bridgeId = `bridge::${n.id}->${subFlowId}`;
          g.setEdge(n.id, subFlowId);
          flowEdges.push({
            id: bridgeId,
            source: n.id,
            target: subFlowId,
            label: t.detailEdgeLabel,
            style: { stroke: '#71717a', strokeWidth: 1.4, strokeDasharray: '4 4' },
            labelStyle: { fill: '#52525b', fontSize: 10.5, fontWeight: 500 },
            labelBgStyle: { fill: '#fafafa', fillOpacity: 0.94 },
            labelBgPadding: [5, 2],
            markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
          });
        }
      }

      for (let idx = 0; idx < subEdges.length; idx++) {
        const se = subEdges[idx];
        const sId = `${n.id}::${se.source}`;
        const tId = `${n.id}::${se.target}`;
        g.setEdge(sId, tId);
        flowEdges.push({
          id: `subedge::${n.id}::${se.id || idx}`,
          source: sId,
          target: tId,
          label: se.label || '',
          style: { stroke: '#a1a1aa', strokeWidth: 1.4 },
          labelStyle: { fill: '#52525b', fontSize: 10.5, fontWeight: 500 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.94 },
          labelBgPadding: [5, 2],
          markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' },
        });
      }
    }
  }

  for (let idx = 0; idx < rawEdges.length; idx++) {
    const e = rawEdges[idx];
    if (!visibleTopSet.has(e.source) || !visibleTopSet.has(e.target)) continue;
    g.setEdge(e.source, e.target);
    flowEdges.push({
      id: e.id || `edge-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label || '',
      style: { stroke: '#71717a', strokeWidth: 1.5 },
      labelStyle: { fill: '#27272a', fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
    });
  }

  dagre.layout(g);

  const positionedNodes = flowNodes.map((fn) => {
    const pos = g.node(fn.id);
    const w = fn.style.width || 296;
    const h = fn.style.minHeight || 144;
    return {
      ...fn,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: Math.round((pos ? pos.x : 0) - w / 2),
        y: Math.round((pos ? pos.y : 0) - h / 2),
      },
    };
  });

  return { nodes: positionedNodes, edges: flowEdges };
}

function AtlasNode({ id, data, selected }) {
  const { item, isSubNode, detailCount, isExpanded, t, onToggleExpand, onOpenDeepDive, onSelectNode } = data;
  const [hoveredHelp, setHoveredHelp] = useState(false);
  const roleKey = ROLE_DOT_COLORS[item.role] ? item.role : 'core';
  const dotColor = ROLE_DOT_COLORS[roleKey];
  const hasDeepDive = Boolean(
    item.deepDive &&
      ((Array.isArray(item.deepDive.askPrompts) && item.deepDive.askPrompts.length > 0) ||
        item.deepDive.subAtlasPrompt ||
        item.deepDive.childAtlasUrl)
  );
  const anchorCount = Array.isArray(item.anchors) ? item.anchors.length : 0;

  return (
    <div
      data-testid={isSubNode ? 'atlas-subnode-card' : 'atlas-node-card'}
      data-node-id={id}
      className={`atlas-node ${isSubNode ? 'atlas-node-sub' : ''} ${selected ? 'atlas-node-selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="atlas-handle" />

      <div className="atlas-node-header">
        <div className="atlas-node-badges">
          <span className="atlas-role-badge">
            <span className="atlas-role-dot" style={{ backgroundColor: dotColor }} aria-hidden="true" />
            <span>{t.roles[roleKey] || item.role}</span>
          </span>
          {isSubNode && <span className="atlas-sub-pill">{t.nestedBadge}</span>}
          {item.confidence === 'unverified' && (
            <span className="atlas-unverified-pill">{t.unverifiedTag}</span>
          )}
        </div>

        {hasDeepDive && (
          <div className="atlas-help-wrap nodrag nopan">
            <button
              type="button"
              data-testid="node-deep-dive-btn"
              data-for-node={id}
              aria-label={`${t.deepDiveBadgeTitle}: ${item.title}`}
              className="atlas-help-btn nodrag nopan"
              onMouseEnter={() => setHoveredHelp(true)}
              onMouseLeave={() => setHoveredHelp(false)}
              onFocus={() => setHoveredHelp(true)}
              onBlur={() => setHoveredHelp(false)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setHoveredHelp(false);
                onOpenDeepDive({
                  title: item.title,
                  deepDive: item.deepDive,
                });
              }}
            >
              <IconDeepDive />
            </button>
            {hoveredHelp && (
              <div role="tooltip" data-testid="deep-dive-tooltip" className="atlas-help-tooltip">
                {item.deepDive.hoverHint || t.deepDiveBadgeTitle}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="atlas-node-body">
        <div className="atlas-node-title">{item.title}</div>
        {item.summary && <div className="atlas-node-summary">{item.summary}</div>}
      </div>

      {item.deepDive?.childAtlasUrl && (
        <a
          href={item.deepDive.childAtlasUrl}
          data-testid="node-child-atlas-link"
          className="atlas-node-child-link nodrag nopan"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          ↳ {t.tabChildAtlas}
        </a>
      )}

      {(detailCount > 0 || anchorCount > 0) && (
        <div className="atlas-node-footer nodrag nopan">
          {detailCount > 0 ? (
            <button
              type="button"
              data-testid="node-expand-btn"
              data-for-node={id}
              aria-expanded={isExpanded}
              className={`atlas-expand-btn nodrag nopan ${isExpanded ? 'active' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(id);
              }}
            >
              {isExpanded ? `${t.collapseDetail} (${detailCount})` : `${t.expandDetail} (${detailCount})`}
            </button>
          ) : (
            <span />
          )}
          {anchorCount > 0 && (
            <span className="atlas-anchor-count" translate="no">#{anchorCount}</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="atlas-handle" />
    </div>
  );
}

const NODE_TYPES = { atlasNode: AtlasNode };

function CopyButton({ text, label, copiedLabel, testId = 'btn-copy-prompt', small = false }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = () => {
    copyToClipboard(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        data-copied={copied ? 'true' : 'false'}
        onClick={handleCopy}
        className={`atlas-copy-btn ${small ? 'small' : ''} ${copied ? 'copied' : ''}`}
      >
        {copied ? copiedLabel : label}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}

function DeepDiveModal({ target, t, onClose }) {
  const [tab, setTab] = useState('ask');

  useEffect(() => {
    setTab('ask');
  }, [target]);

  useEffect(() => {
    if (!target) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  if (!target || !target.deepDive) return null;

  const askPrompts = Array.isArray(target.deepDive.askPrompts) ? target.deepDive.askPrompts : [];
  const subPrompt = target.deepDive.subAtlasPrompt || '';
  const childAtlasUrl = target.deepDive.childAtlasUrl || '';
  // childAtlasUrl 存在时用"进入子图"替代生成提示词；两者互斥展示
  const showChildLink = Boolean(childAtlasUrl);
  const showRecursiveTab = !showChildLink && Boolean(subPrompt);

  return (
    <div
      className="atlas-modal-backdrop"
      data-testid="deep-dive-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="atlas-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-dive-modal-title"
        data-testid="deep-dive-panel"
      >
        <div className="atlas-modal-header">
          <div>
            <div className="atlas-modal-kicker">{t.deepDiveModalTitle}</div>
            <h3 id="atlas-dive-modal-title" className="atlas-modal-title">{target.title}</h3>
          </div>
          <button
            type="button"
            data-testid="btn-close-deep-dive"
            aria-label={t.close}
            className="atlas-icon-close"
            onClick={onClose}
          >
            {t.close}
          </button>
        </div>

        <div className="atlas-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ask'}
            data-testid="tab-ask-prompts"
            className={`atlas-tab-btn ${tab === 'ask' ? 'active' : ''}`}
            onClick={() => setTab('ask')}
          >
            {t.tabAsk} ({askPrompts.length})
          </button>
          {(showChildLink || showRecursiveTab) && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'recursive'}
              data-testid="tab-recursive-prompt"
              className={`atlas-tab-btn ${tab === 'recursive' ? 'active' : ''}`}
              onClick={() => setTab('recursive')}
            >
              {showChildLink ? t.tabChildAtlas : t.tabRecursive}
            </button>
          )}
        </div>

        <div className="atlas-modal-body">
          {tab === 'ask' && (
            <div className="atlas-prompt-list">
              {askPrompts.map((p, i) => (
                <div key={i} className="atlas-prompt-card" data-testid="ask-prompt-card">
                  <div className="atlas-prompt-card-head">
                    <strong>{p.title}</strong>
                    <CopyButton
                      text={p.prompt}
                      label={t.copyBtn}
                      copiedLabel={t.copiedBtn}
                      testId={`btn-copy-ask-${i}`}
                    />
                  </div>
                  <pre className="atlas-prompt-pre" data-testid="ask-prompt-text">{p.prompt}</pre>
                </div>
              ))}
            </div>
          )}

          {tab === 'recursive' && showChildLink && (
            <div className="atlas-prompt-card" data-testid="child-atlas-card">
              <div className="atlas-prompt-card-head">
                <strong translate="no">Atlas Loop · L1+</strong>
              </div>
              <a
                href={childAtlasUrl}
                data-testid="child-atlas-link"
                className="atlas-child-atlas-link"
              >
                {t.openChildAtlas}
              </a>
            </div>
          )}

          {tab === 'recursive' && showRecursiveTab && (
            <div className="atlas-prompt-card" data-testid="recursive-prompt-card">
              <p className="atlas-hint-p">{t.recursiveUsageHint}</p>
              <div className="atlas-prompt-card-head">
                <strong translate="no">Atlas Loop · L1+</strong>
                <CopyButton
                  text={subPrompt}
                  label={t.copyBtn}
                  copiedLabel={t.copiedBtn}
                  testId="btn-copy-recursive"
                />
              </div>
              <pre className="atlas-prompt-pre" data-testid="recursive-prompt-text">{subPrompt}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScopeModal({ open, uncoveredScopes, unverifiedNotes, t, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="atlas-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="atlas-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-scope-modal-title"
      >
        <div className="atlas-modal-header">
          <h3 id="atlas-scope-modal-title" className="atlas-modal-title">{t.scopeNotes}</h3>
          <button
            type="button"
            aria-label={t.close}
            className="atlas-icon-close"
            onClick={onClose}
          >
            {t.close}
          </button>
        </div>
        <div className="atlas-modal-body">
          {uncoveredScopes.length > 0 && (
            <section className="atlas-sec" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
              <h4>{t.uncoveredTitle}</h4>
              <ul>
                {uncoveredScopes.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          {unverifiedNotes.length > 0 && (
            <section className="atlas-sec">
              <h4>{t.unverifiedTitle}</h4>
              <ul>
                {unverifiedNotes.map((u, idx) => (
                  <li key={idx}>{u}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function pngFileName(title) {
  const cleaned = String(title || 'atlas')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${(cleaned || 'atlas').slice(0, 80)}.png`;
}

async function exportVisibleCanvas(container, title, rf) {
  const flow = container.querySelector('.react-flow');
  if (!flow) return;
  if (!rf) { console.error('[Atlas] exportVisibleCanvas: rf instance is null, export skipped'); return; }

  // 计算所有节点的边界框（流坐标）
  const nodes = rf.getNodes();
  if (nodes.length === 0) return;

  const PAD = 40;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const x = n.position.x;
    const y = n.position.y;
    const w = n.measured?.width ?? n.width ?? 240;
    const h = n.measured?.height ?? n.height ?? 120;
    if (x - PAD < minX) minX = x - PAD;
    if (y - PAD < minY) minY = y - PAD;
    if (x + w + PAD > maxX) maxX = x + w + PAD;
    if (y + h + PAD > maxY) maxY = y + h + PAD;
  }

  const graphW = maxX - minX;
  const graphH = maxY - minY;

  const MAX_PX = 3200;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const scale = Math.min(1, MAX_PX / Math.max(graphW, graphH));
  const imgW = Math.round(graphW * scale);
  const imgH = Math.round(graphH * scale);

  // 在画布容器上叠一个遮罩，用户看不到视口变换的跳动；
  // toPng 只捕获 flow 自身，遮罩是兄弟节点，不会进入截图。
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:9999;background:var(--bg-canvas,#fafafa);pointer-events:none;';
  const prevPos = container.style.position;
  if (!prevPos || prevPos === 'static') container.style.position = 'relative';
  container.appendChild(overlay);

  // 等遮罩先渲染出来，再改视口
  await new Promise((r) => requestAnimationFrame(r));

  const prevViewport = rf.getViewport();
  rf.setViewport({ x: -minX * scale, y: -minY * scale, zoom: scale }, { duration: 0 });

  // 等视口变换写入 DOM
  await new Promise((r) => requestAnimationFrame(r));

  const dataUrl = await toPng(flow, {
    backgroundColor: '#fafafa',
    width: imgW,
    height: imgH,
    pixelRatio,
    skipFonts: true,
    filter: (node) => {
      const className = node?.classList;
      if (!className) return true;
      return !className.contains('react-flow__minimap')
        && !className.contains('react-flow__controls')
        && !className.contains('react-flow__attribution');
    },
  });

  // 恢复视口，移除遮罩
  rf.setViewport(prevViewport, { duration: 0 });
  container.removeChild(overlay);
  if (!prevPos || prevPos === 'static') container.style.position = prevPos;

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = pngFileName(title);
  link.click();
}

function AtlasCanvasApp({ data }) {
  const meta = data.meta || {};
  const t = useMemo(() => resolveI18n(meta), [meta]);
  const streams = Array.isArray(data.streams) ? data.streams : [];

  const depth = resolveDepth(meta);
  // 浅图收起用不上的控件：两跳就讲完的主题不需要搜索与小地图
  const isCompact = depth <= 2;
  // 图例只列出这张地图实际用到的角色
  const usedRoles = useMemo(() => {
    const set = new Set();
    for (const n of data.nodes || []) {
      set.add(ROLE_DOT_COLORS[n.role] ? n.role : 'core');
      for (const sn of n.detailGraph?.nodes || []) {
        set.add(ROLE_DOT_COLORS[sn.role] ? sn.role : 'core');
      }
    }
    return set;
  }, [data.nodes]);

  const [activeStream, setActiveStream] = useState(() => _savedState?.activeStream || 'all');
  const [expandedIds, setExpandedIds] = useState(() => new Set(_savedState?.expandedIds || []));
  const [isLocked, setIsLocked] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const canvasRef = useRef(null);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => _savedState?.selectedId || null);
  const [deepDiveTarget, setDeepDiveTarget] = useState(null);
  const [resetEpoch, setResetEpoch] = useState(0);

  const rf = useReactFlow();
  // onInit 回调拿到的实例是 ReactFlow 完成挂载后的稳定引用，
  // 专用于 exportVisibleCanvas（避免 context 时序问题导致 rf 为 undefined）
  const rfInitRef = useRef(null);
  const pendingFocusRef = useRef(null);

  const handleToggleExpand = useCallback((nodeId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleOpenDeepDive = useCallback((payload) => {
    setDeepDiveTarget(payload);
  }, []);

  const handleSelectNode = useCallback((flowNodeId) => {
    setSelectedId(flowNodeId);
  }, []);

  const handlers = useMemo(
    () => ({
      onToggleExpand: handleToggleExpand,
      onOpenDeepDive: handleOpenDeepDive,
      onSelectNode: handleSelectNode,
    }),
    [handleToggleExpand, handleOpenDeepDive, handleSelectNode]
  );

  const computed = useMemo(
    () => buildGraphElements(data, activeStream, expandedIds, t, handlers),
    [data, activeStream, expandedIds, t, handlers, resetEpoch]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computed.edges);

  // 初始状态已经是 computed：挂载时不再重复写入。重复写入会用未测量的节点对象覆盖
  // React Flow 刚量好的尺寸与连接点，偶发地让所有连线不再渲染。
  const appliedComputedRef = useRef(computed);
  useEffect(() => {
    if (appliedComputedRef.current === computed) return;
    appliedComputedRef.current = computed;
    setNodes(computed.nodes);
    setEdges(computed.edges);
  }, [computed, setNodes, setEdges]);

  // 选中状态没有变化时返回原数组，避免无谓地替换节点对象
  useEffect(() => {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const isSel = n.id === selectedId;
        if (Boolean(n.selected) === isSel) return n;
        changed = true;
        return { ...n, selected: isSel };
      });
      return changed ? next : prev;
    });
  }, [selectedId, setNodes]);

  useEffect(() => {
    if (pendingFocusRef.current) {
      const targetId = pendingFocusRef.current;
      const exists = nodes.some((n) => n.id === targetId);
      if (exists) {
        pendingFocusRef.current = null;
        requestAnimationFrame(() => {
          rf.fitView({ nodes: [{ id: targetId }], padding: 0.45, duration: 0 });
        });
      }
    }
  }, [nodes, rf]);

  // 页面跳转前（进入子图）保存当前视口与交互状态
  useEffect(() => {
    const save = () => {
      _saveState({
        selectedId,
        expandedIds: [...expandedIds],
        activeStream,
        viewport: rfInitRef.current?.getViewport() ?? null,
      });
    };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [selectedId, expandedIds, activeStream]);

  const handleFitViewOnly = useCallback(() => {
    rf.fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
  }, [rf]);

  const handleFullReset = useCallback(() => {
    setActiveStream('all');
    setExpandedIds(new Set());
    setSearchQuery('');
    setSelectedId(null);
    setDeepDiveTarget(null);
    setShowScopeModal(false);
    setIsLocked(true);
    setResetEpoch((c) => c + 1);
    // 清除缓存，确保下次访问不会误恢复旧状态
    try { sessionStorage.removeItem(_STATE_KEY); } catch {}
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rf.fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
      });
    });
  }, [rf]);

  const searchIndex = useMemo(() => {
    const entries = [];
    for (const n of data.nodes || []) {
      const anchorText = (n.anchors || [])
        .map((a) => [a.label, a.filePath, a.symbol, a.content, a.citation, a.url].filter(Boolean).join(' '))
        .join(' ');
      const promptText = (n.deepDive?.askPrompts || []).map((p) => `${p.title} ${p.prompt}`).join(' ');
      entries.push({
        flowId: n.id,
        parentId: null,
        title: n.title,
        summary: n.summary || '',
        isSub: false,
        haystack: `${n.title} ${n.summary || ''} ${n.whyItMatters || ''} ${anchorText} ${promptText}`.toLowerCase(),
      });
      for (const sn of n.detailGraph?.nodes || []) {
        const subAnchorText = (sn.anchors || [])
          .map((a) => [a.label, a.filePath, a.symbol, a.content, a.citation, a.url].filter(Boolean).join(' '))
          .join(' ');
        entries.push({
          flowId: `${n.id}::${sn.id}`,
          parentId: n.id,
          title: sn.title,
          summary: `${n.title} → ${sn.summary || ''}`,
          isSub: true,
          haystack: `${sn.title} ${sn.summary || ''} ${n.title} ${subAnchorText}`.toLowerCase(),
        });
      }
    }
    return entries;
  }, [data.nodes]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchIndex.filter((item) => item.haystack.includes(q)).slice(0, 12);
  }, [searchQuery, searchIndex]);

  const focusSearchMatch = (match) => {
    if (activeStream !== 'all') {
      setActiveStream('all');
    }
    if (match.parentId && !expandedIds.has(match.parentId)) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(match.parentId);
        return next;
      });
    }
    setSelectedId(match.flowId);
    pendingFocusRef.current = match.flowId;
    setSearchQuery('');
    const alreadyRendered = nodes.some((n) => n.id === match.flowId);
    if (alreadyRendered) {
      pendingFocusRef.current = null;
      requestAnimationFrame(() => {
        rf.fitView({ nodes: [{ id: match.flowId }], padding: 0.45, duration: 0 });
      });
    }
  };

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId.includes('::')) {
      const [pId, sId] = selectedId.split('::');
      const parent = (data.nodes || []).find((n) => n.id === pId);
      const sub = (parent?.detailGraph?.nodes || []).find((sn) => sn.id === sId);
      return sub ? { ...sub, _parentTitle: parent?.title } : null;
    }
    return (data.nodes || []).find((n) => n.id === selectedId) || null;
  }, [selectedId, data.nodes]);

  const currentStreamObj = useMemo(() => {
    if (activeStream === 'all') return streams[0] || null;
    return streams.find((s) => s.id === activeStream) || null;
  }, [activeStream, streams]);

  const nodeTitleMap = useMemo(() => {
    const m = new Map();
    for (const n of data.nodes || []) m.set(n.id, n.title);
    return m;
  }, [data.nodes]);

  const uncoveredScopes = Array.isArray(meta.uncoveredScopes) ? meta.uncoveredScopes : [];
  const unverifiedNotes = Array.isArray(meta.unverifiedNotes) ? meta.unverifiedNotes : [];
  const scopeCount = uncoveredScopes.length + unverifiedNotes.length;

  return (
    <div className="atlas-shell-root">
      <a href="#atlas-main" className="atlas-skip-link">{t.skipToCanvas}</a>

      <header className="atlas-topbar" data-testid="atlas-topbar">
        <div className="atlas-topbar-left">
           <div className="atlas-title-row">
            <h1 className="atlas-main-title">{meta.title}</h1>
            {meta.subtitle && <p className="atlas-subtitle">{meta.subtitle}</p>}
          </div>
          <div className="atlas-top-badges">
            {meta.parentMapHtml && (
              <a
                href={meta.parentMapHtml}
                data-testid="parent-map-link"
                className="atlas-parent-link"
              >
                <IconArrowLeft />
                <span>{t.backParent}</span>
              </a>
            )}
            {meta.subjectTag && <span className="atlas-subject-badge">{meta.subjectTag}</span>}
            <span className="atlas-level-badge" data-testid="level-badge">
              {meta.level && Number(meta.level) > 0 && meta.drillDownTarget
                ? `${t.levelSubPrefix}${meta.drillDownTarget}`
                : t.levelOverview}
            </span>
            <span
              className="atlas-level-badge"
              data-testid="depth-badge"
              data-depth={depth}
              title={meta.depthReason || undefined}
            >
              {t.depthPrefix}
              {depth}
              {t.hopsUnit}
            </span>
            {meta.audience && (
              <span className="atlas-level-badge" data-testid="audience-badge">
                {t.audiencePrefix}
                {meta.audience}
              </span>
            )}
          </div>
        </div>

        <div className="atlas-topbar-right">
          <div className="atlas-model-pill" data-testid="model-badge">
            <span>{t.modelPrefix}</span>
            <span translate="no">{meta.generatedByModel}</span>
          </div>
          {scopeCount > 0 && (
            <button
              type="button"
              data-testid="btn-scope-notes"
              className="atlas-scope-btn"
              onClick={() => setShowScopeModal(true)}
            >
              {t.scopeNotes} ({scopeCount})
            </button>
          )}
        </div>
      </header>
      <div className="atlas-toolbar-row">
        <div className="atlas-streams-bar" data-testid="stream-filter-bar">
          {streams.length > 1 && (
            <button
              type="button"
              data-testid="stream-btn-all"
              data-active={activeStream === 'all' ? 'true' : 'false'}
              className={`atlas-stream-pill ${activeStream === 'all' ? 'active' : ''}`}
              onClick={() => setActiveStream('all')}
            >
              {t.allStreams}
            </button>
          )}
          {streams.map((st) => {
            const isActive = activeStream === st.id;
            const hasStreamDive = Boolean(
              st.deepDive &&
                ((st.deepDive.askPrompts && st.deepDive.askPrompts.length > 0) ||
                  st.deepDive.subAtlasPrompt ||
                  st.deepDive.childAtlasUrl)
            );
            return (
              <div key={st.id} className={`atlas-stream-pill-group ${isActive ? 'active' : ''}`}>
                {streams.length > 1 ? (
                  <button
                    type="button"
                    data-testid={`stream-btn-${st.id}`}
                    data-active={isActive ? 'true' : 'false'}
                    className={`atlas-stream-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveStream(st.id)}
                  >
                    {st.title}
                  </button>
                ) : (
                  <span className="atlas-stream-pill static" data-testid={`stream-label-${st.id}`}>
                    {st.title}
                  </span>
                )}
                {hasStreamDive && (
                  <button
                    type="button"
                    aria-label={`${t.deepDiveBadgeTitle}: ${st.title}`}
                    title={st.deepDive.hoverHint || t.deepDiveBadgeTitle}
                    data-testid={`stream-deep-dive-${st.id}`}
                    className="atlas-stream-help-btn"
                    onClick={() =>
                      setDeepDiveTarget({
                        title: st.title,
                        deepDive: st.deepDive,
                      })
                    }
                  >
                    <IconDeepDive />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="atlas-controls-group">
          {!isCompact && (
            <div className="atlas-search-box">
              <label htmlFor="atlas-search-input" className="atlas-search-field">
                <span className="sr-only">{t.searchLabel}</span>
                <IconSearch />
                <input
                  id="atlas-search-input"
                  name="q"
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  data-testid="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="atlas-search-input"
                />
              </label>
              {searchQuery.trim() !== '' && (
                <div className="atlas-search-dropdown" data-testid="search-results" aria-live="polite">
                  {searchMatches.length === 0 ? (
                    <div className="atlas-search-empty">{t.noSearchMatches}</div>
                  ) : (
                    searchMatches.map((m) => (
                      <button
                        key={m.flowId}
                        type="button"
                        data-testid="search-result-item"
                        data-target-id={m.flowId}
                        className="atlas-search-item"
                        onClick={() => focusSearchMatch(m)}
                      >
                        <div className="atlas-search-item-title">
                          <span>{m.title}</span>
                          {m.isSub && <span className="atlas-sub-pill">{t.nestedBadge}</span>}
                        </div>
                        {m.summary && <div className="atlas-search-item-sub">{m.summary}</div>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="atlas-canvas-btns">
            <button
              type="button"
              data-testid="btn-zoom-in"
              aria-label={t.zoomIn}
              title={t.zoomIn}
              className="atlas-ctrl-btn"
              onClick={() => rf.zoomIn({ duration: 0 })}
            >
              <IconZoomIn />
            </button>
            <button
              type="button"
              data-testid="btn-zoom-out"
              aria-label={t.zoomOut}
              title={t.zoomOut}
              className="atlas-ctrl-btn"
              onClick={() => rf.zoomOut({ duration: 0 })}
            >
              <IconZoomOut />
            </button>
            <button
              type="button"
              data-testid="btn-lock"
              data-locked={isLocked ? 'true' : 'false'}
              aria-pressed={isLocked}
              aria-label={isLocked ? t.unlock : t.lock}
              title={isLocked ? t.unlock : t.lock}
              className={`atlas-ctrl-btn ${isLocked ? 'locked' : ''}`}
              onClick={() => setIsLocked((v) => !v)}
            >
              <IconLock locked={isLocked} />
            </button>
            <button
              type="button"
              data-testid="btn-fit-view"
              aria-label={t.fitView}
              title={t.fitView}
              className="atlas-ctrl-btn"
              onClick={handleFitViewOnly}
            >
              <IconFit />
            </button>
            <button
              type="button"
              data-testid="btn-reset"
              aria-label={t.reset}
              title={t.reset}
              className="atlas-ctrl-btn"
              onClick={handleFullReset}
            >
              <IconReset />
            </button>
            <button
              type="button"
              data-testid="btn-legend"
              aria-pressed={showLegend}
              aria-label={t.legend}
              title={t.legend}
              className={`atlas-ctrl-btn ${showLegend ? 'active' : ''}`}
              onClick={() => setShowLegend((v) => !v)}
            >
              <IconLegend />
            </button>
            <button
              type="button"
              data-testid="btn-minimap"
              aria-pressed={showMiniMap}
              aria-label={t.miniMap}
              title={t.miniMap}
              className={`atlas-ctrl-btn ${showMiniMap ? 'active' : ''}`}
              onClick={() => setShowMiniMap((v) => !v)}
            >
              <IconMiniMap />
            </button>
            <button
              type="button"
              data-testid="btn-export-png"
              aria-label={t.exportPng}
              title={t.exportPng}
              className="atlas-ctrl-btn"
              disabled={exporting}
              onClick={async () => {
                if (!canvasRef.current || exporting) return;
                setExporting(true);
                try {
                  await exportVisibleCanvas(canvasRef.current, meta.title, rfInitRef.current ?? rf);
                } finally {
                  setExporting(false);
                }
              }}
            >
              <IconExportPng />
            </button>
            <button
              type="button"
              data-testid="btn-export-zip"
              aria-label={t.exportZip}
              title={t.exportZip}
              className="atlas-ctrl-btn"
              disabled={exportingZip}
              onClick={async () => {
                if (exportingZip) return;
                setExportingZip(true);
                try { await _exportZip(data, meta); }
                catch (error) {
                  console.error('[Atlas] ZIP export failed:', error);
                  window.alert(t.exportZipFailed);
                }
                finally { setExportingZip(false); }
              }}
            >
              <IconExport />
            </button>
          </div>
        </div>
      </div>

      {currentStreamObj && Array.isArray(currentStreamObj.learningOrder) && currentStreamObj.learningOrder.length > 0 && (
        <nav className="atlas-reading-bar" aria-label={t.learningPath} data-testid="learning-order-bar">
          <span className="atlas-reading-label">{t.learningPath}</span>
          <div className="atlas-reading-steps">
            {currentStreamObj.learningOrder.map((nid, idx) => {
              const title = nodeTitleMap.get(nid) || nid;
              return (
                <button
                  key={nid}
                  type="button"
                  data-testid={`learning-step-${idx}`}
                  className={`atlas-step-chip ${selectedId === nid ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedId(nid);
                    rf.fitView({ nodes: [{ id: nid }], padding: 0.45, duration: 0 });
                  }}
                >
                  <span className="atlas-step-num">{idx + 1}</span>
                  <span>{title}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main id="atlas-main" className="atlas-main-workspace">
        <div className="atlas-canvas-container" data-testid="atlas-canvas-wrap" ref={canvasRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            nodesDraggable={!isLocked}
            nodesConnectable={false}
            elementsSelectable={true}
            fitView={!_savedState?.viewport}
            fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            onInit={(inst) => {
              rfInitRef.current = inst;
              // 从子图返回时恢复视口，不执行 fitView
              if (_savedState?.viewport) {
                requestAnimationFrame(() => inst.setViewport(_savedState.viewport, { duration: 0 }));
              }
            }}
          >
            <Background gap={22} size={1} color="#e4e4e7" />
            {showMiniMap && (
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(244, 244, 245, 0.7)"
                nodeColor={(n) => {
                  const r = n.data?.item?.role;
                  return ROLE_DOT_COLORS[r] || '#71717a';
                }}
              />
            )}
          </ReactFlow>

          {showLegend && (
            <div className="atlas-legend-card" data-testid="legend-panel">
              {Object.entries(ROLE_DOT_COLORS)
                .filter(([rKey]) => usedRoles.has(rKey))
                .map(([rKey, color]) => (
                <div key={rKey} className="atlas-legend-row">
                  <span className="atlas-legend-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span>{t.roles[rKey] || rKey}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedItem && (
          <aside className="atlas-inspector" data-testid="inspector-panel">
            <div className="atlas-inspector-head">
              <div className="atlas-inspector-head-text">
                {selectedItem._parentTitle && (
                  <div className="atlas-inspector-parent">{selectedItem._parentTitle}</div>
                )}
                <h2 className="atlas-inspector-title">{selectedItem.title}</h2>
              </div>
              <button
                type="button"
                data-testid="btn-close-inspector"
                aria-label={t.close}
                className="atlas-icon-close"
                onClick={() => setSelectedId(null)}
              >
                {t.close}
              </button>
            </div>

            <div className="atlas-inspector-meta">
              <span className="atlas-conf-badge">
                <span
                  className="atlas-role-dot"
                  style={{
                    backgroundColor: selectedItem.confidence === 'unverified' ? '#b45309' : '#15803d',
                  }}
                  aria-hidden="true"
                />
                <span>{selectedItem.confidence === 'unverified' ? t.unverifiedTag : t.verifiedTag}</span>
              </span>
              {selectedItem.unverifiedReason && (
                <p className="atlas-unverified-note">{selectedItem.unverifiedReason}</p>
              )}
            </div>

            {selectedItem.summary && (
              <section className="atlas-sec">
                <h4>{t.whatItDoes}</h4>
                <p>{selectedItem.summary}</p>
              </section>
            )}

            {selectedItem.whyItMatters && (
              <section className="atlas-sec">
                <h4>{t.whyItMatters}</h4>
                <p>{selectedItem.whyItMatters}</p>
              </section>
            )}

            {(selectedItem.keyFactors?.inputs || selectedItem.keyFactors?.outputs) && (
              <section className="atlas-sec">
                {selectedItem.keyFactors.inputs && (
                  <div className="atlas-kv">
                    <strong>{t.inputsLabel}：</strong>
                    <span>{selectedItem.keyFactors.inputs}</span>
                  </div>
                )}
                {selectedItem.keyFactors.outputs && (
                  <div className="atlas-kv">
                    <strong>{t.outputsLabel}：</strong>
                    <span>{selectedItem.keyFactors.outputs}</span>
                  </div>
                )}
              </section>
            )}

            {selectedItem.mechanismsAndEffects && (
              <section className="atlas-sec">
                <h4>{t.mechanismsLabel}</h4>
                <p>{selectedItem.mechanismsAndEffects}</p>
              </section>
            )}

            {selectedItem.watchouts && (
              <section className="atlas-sec atlas-watchout-box">
                <h4>{t.watchoutsLabel}</h4>
                <p>{selectedItem.watchouts}</p>
              </section>
            )}

            {Array.isArray(selectedItem.anchors) && selectedItem.anchors.length > 0 && (
              <section className="atlas-sec">
                <h4>{t.anchorsLabel}</h4>
                <div className="atlas-anchor-list">
                  {selectedItem.anchors.map((anc, i) => (
                    <div key={i} className="atlas-anchor-card" data-testid="anchor-item">
                      <div className="atlas-anchor-label">{anc.label}</div>

                      {anc.kind === 'editor' && (
                        <div className="atlas-anchor-editor">
                          <code translate="no">
                            {anc.filePath}:{anc.line || 1}
                            {anc.symbol ? ` (${anc.symbol})` : ''}
                          </code>
                          {anc.unsupportedNote ? (
                            <div className="atlas-unverified-note">{anc.unsupportedNote}</div>
                          ) : (
                            <>
                              <a
                                href={anc.editorUri}
                                data-testid="editor-jump-link"
                                className="atlas-editor-btn"
                              >
                                {t.openInEditor} ({(anc.editor || 'vscode').toUpperCase()})
                              </a>
                              <div className="atlas-editor-hint">{t.editorConfirmHint}</div>
                            </>
                          )}
                        </div>
                      )}

                      {anc.kind === 'snippet' && (
                        <div className="atlas-anchor-snippet">
                          <pre translate="no">{anc.content}</pre>
                          <CopyButton
                            text={anc.content || ''}
                            label={t.copySnippet}
                            copiedLabel={t.copiedBtn}
                            testId={`btn-copy-snippet-${i}`}
                            small
                          />
                        </div>
                      )}

                      {anc.kind === 'link' && (
                        <a
                          href={anc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="atlas-ext-link"
                          translate="no"
                        >
                          {anc.url}
                        </a>
                      )}

                      {anc.kind === 'source' && (
                        <div className="atlas-source-cite">{anc.citation}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedItem.deepDive && (
              <section className="atlas-sec">
                <button
                  type="button"
                  data-testid="inspector-open-deep-dive"
                  className="atlas-open-dive-btn"
                  onClick={() =>
                    setDeepDiveTarget({
                      title: selectedItem.title,
                      deepDive: selectedItem.deepDive,
                    })
                  }
                >
                  ? {t.openDeepDiveBtn}
                </button>
              </section>
            )}
          </aside>
        )}
      </main>

      <DeepDiveModal
        target={deepDiveTarget}
        t={t}
        onClose={() => setDeepDiveTarget(null)}
      />

      <ScopeModal
        open={showScopeModal}
        uncoveredScopes={uncoveredScopes}
        unverifiedNotes={unverifiedNotes}
        t={t}
        onClose={() => setShowScopeModal(false)}
      />
    </div>
  );
}

function mountAtlas() {
  const el = document.getElementById('atlas-data-json');
  const data = el ? JSON.parse(el.textContent) : window.__ATLAS_DATA__ || {};
  const rootEl = document.getElementById('root');
  const root = createRoot(rootEl);
  root.render(
    <ReactFlowProvider>
      <AtlasCanvasApp data={data} />
    </ReactFlowProvider>
  );
}

mountAtlas();
