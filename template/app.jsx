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
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { highlightSnippet, resolveSnippetPlan } from './snippet-highlight.js';
import { normalizeLanguageHint, walkSnippetAnchors } from './snippet-lang.mjs';

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
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    reset: '重置',
    legend: '图例',
    feedbackEdge: '反馈回路',
    exportPng: '导出 PNG',
    exportZip: '导出 ZIP',
    exportZipFailed: 'ZIP 导出失败，请刷新页面后重试。',
    exportZipFileProtocolHint: '当前以本地 file:// 打开，浏览器安全策略会阻止读取同级子图，已导出当前单图；如需将父子图一起打包，请运行 atlas-loop pack。',
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
    kvColon: '：',
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
    depthPrefix: '知识深度：',
    depthUnit: ' 阶',
    audiencePrefix: '读者档位：',
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
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit Fullscreen',
    reset: 'Reset',
    legend: 'Legend',
    feedbackEdge: 'Feedback Loop',
    exportPng: 'Export PNG',
    exportZip: 'Export ZIP',
    exportZipFailed: 'ZIP export failed. Refresh the page and try again.',
    exportZipFileProtocolHint: 'Browser security blocks reading sibling child HTML files over file://. Exported current map only; run atlas-loop pack to bundle linked sub-atlases offline.',
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
    kvColon: ': ',
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
    depthUnit: ' tiers',
    audiencePrefix: 'Audience: ',
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
    depthUnit: custom.depthUnit ?? custom.hopsUnit ?? base.depthUnit,
    roles: { ...base.roles, ...(custom.roles || {}) },
  };
}

const MIN_DEPTH = 2;
const MAX_DEPTH = 6;

// 知识深度：meta.depth 是构建期已校验过的认知阶梯推进阶数；缺省时退回 3 阶
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
  // 适配全图：四角箭头向内收拢（区别于全屏的向外扩）
  return (
    <StrokeIcon>
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="m14 10 7-7" />
      <path d="m3 21 7-7" />
    </StrokeIcon>
  );
}

function IconFullscreen({ active }) {
  // 四角向外扩 = 进入全屏；向内收 = 退出全屏
  return active ? (
    <StrokeIcon>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </StrokeIcon>
  ) : (
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

// ── 视口 & 交互状态缓存（localStorage，关标签页后重开也恢复）──────────
// 工具栏状态由 nuqs 写进 URL query，所以 key 必须剔除 query 才稳定；
// 保留 dev-server 的 ?data= 参数，避免开发预览的父子图共用同一份缓存
const _STATE_KEY = (() => {
  const base = location.href.split(/[?#]/)[0];
  const dataParam = new URLSearchParams(location.search).get('data');
  return 'atlas-state:' + base + (dataParam ? `?data=${dataParam}` : '');
})();
function _loadSavedState() {
  try { return JSON.parse(localStorage.getItem(_STATE_KEY) || 'null'); }
  catch { return null; }
}
function _saveState(s) {
  try { localStorage.setItem(_STATE_KEY, JSON.stringify(s)); } catch {}
}
// 页面加载时读取一次；pagehide 时写入
const _savedState = _loadSavedState();

// 布局指纹：节点位置缓存只在「图结构没变」时有效，
// 展开/收起节点或切换脉络后结构变化，应重新跑 dagre 布局
function _layoutFingerprint(data, activeStream, expandedIds) {
  const nodeIds = (data.nodes || []).map((n) => {
    const expanded = expandedIds.has(n.id) && (n.detailGraph?.nodes?.length || 0) > 0;
    return expanded ? `${n.id}+` : n.id;
  });
  return JSON.stringify([activeStream, nodeIds]);
}

// 用缓存中用户手动拖动过的位置覆盖 dagre 布局结果
function _applyCachedPositions(flowNodes, cachedPositions) {
  if (!cachedPositions) return flowNodes;
  let hit = false;
  const next = flowNodes.map((n) => {
    const p = cachedPositions[n.id];
    if (!p) return n;
    hit = true;
    return { ...n, position: { x: p.x, y: p.y } };
  });
  return hit ? next : flowNodes;
}

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

  function _serializeInlineHljs(doc) {
    const els = Array.from(doc.querySelectorAll('script[id^="atlas-hljs-"]'));
    if (els.length === 0) return '';
    return els
      .map((el) => {
        const text = (el.textContent || '').replace(/<\/script/gi, '<\\/script');
        return `<script type="text/plain" id="${el.id}">${text}</script>`;
      })
      .join('\n  ');
  }

  let devManifestCache = null;
  const devFileCache = new Map();
  async function _fetchDevText(url) {
    if (devFileCache.has(url)) return devFileCache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    devFileCache.set(url, text);
    return text;
  }

  async function _collectHljsPayload(atlasData, sourceDoc) {
    const inline = sourceDoc ? _serializeInlineHljs(sourceDoc) : '';
    if (inline) return inline;
    if (location.protocol === 'file:') return '';
    try {
      if (!devManifestCache) {
        const manifestText = await _fetchDevText('/__hljs/manifest.json');
        devManifestCache = JSON.parse(manifestText);
      }
      const manifest = devManifestCache;
      const needed = new Set();
      let auto = false;
      walkSnippetAnchors(atlasData, (anchor) => {
        const plan = resolveSnippetPlan(anchor.content, anchor.language);
        if (plan.mode === 'auto') auto = true;
        if (plan.mode === 'language') {
          const canonical = manifest.aliases?.[normalizeLanguageHint(plan.language)];
          if (canonical) needed.add(canonical);
        }
      });
      if (auto) {
        for (const name of manifest.common || []) needed.add(name);
      }
      const queue = [...needed];
      for (const name of queue) {
        for (const dep of manifest.deps?.[name] || []) {
          if (!needed.has(dep)) {
            needed.add(dep);
            queue.push(dep);
          }
        }
      }
      if (needed.size === 0) return '';

      const coreSource = await _fetchDevText('/__hljs/core.js');
      const sorted = [...needed].sort();
      const langSources = await Promise.all(
        sorted.map(async (name) => {
          try {
            return { name, source: await _fetchDevText(`/__hljs/lang/${name}.js`) };
          } catch {
            return null;
          }
        })
      );
      const parts = [
        `<script type="text/plain" id="atlas-hljs-manifest">${JSON.stringify(manifest).replace(/</g, '\\u003c')}</script>`,
        `<script type="text/plain" id="atlas-hljs-core">${coreSource.replace(/<\/script/gi, '<\\/script')}</script>`,
      ];
      for (const item of langSources) {
        if (!item) continue;
        parts.push(
          `<script type="text/plain" id="atlas-hljs-lang-${item.name}">${item.source.replace(/<\/script/gi, '<\\/script')}</script>`
        );
      }
      return parts.join('\n  ');
    } catch {
      return '';
    }
  }

  function _buildHtml(atlasData, hljsHtml) {
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
      ...(hljsHtml ? ['  ' + hljsHtml] : []),
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
    sourceDoc: document,
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

  let skippedFileChildren = false;
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
        const child = { url: childUrl, name, data: childData, sourceDoc: childDoc, discoveredFrom: record.url };
        records.push(child);
        byUrl.set(childUrl, child);
      } catch (error) {
        if (location.protocol === 'file:') skippedFileChildren = true;
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
    const hljsHtml = await _collectHljsPayload(record.data, record.sourceDoc);
    files.push({ name: record.name, bytes: enc.encode(_buildHtml(record.data, hljsHtml)) });
  }

  const zipBytes = _buildZip(files);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = curTitle + '.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return { skippedFileChildren };
}

function visualTextUnits(str) {
  let units = 0;
  for (const ch of String(str || '')) {
    units += ch.charCodeAt(0) > 0xff ? 1 : 0.55;
  }
  return units;
}

function estimateNodeHeight(item, detailCount, isSub) {
  const charsPerLine = isSub ? 17 : 20;
  const titleLines = Math.max(1, Math.min(3, Math.ceil(visualTextUnits(item.title) / charsPerLine)));
  const summaryLines = item.summary
    ? Math.min(2, Math.max(1, Math.ceil(visualTextUnits(item.summary) / (isSub ? 20 : 23))))
    : 0;
  const hasChildLink = Boolean(item.deepDive?.childAtlasUrl);
  const hasFooter = detailCount > 0 || (Array.isArray(item.anchors) && item.anchors.length > 0);
  const base =
    (isSub ? 64 : 74) +
    titleLines * 18 +
    summaryLines * 17 +
    (hasChildLink ? 32 : 0) +
    (hasFooter ? 30 : 0);
  return isSub ? Math.max(108, Math.min(200, base)) : Math.max(128, Math.min(240, base));
}

function buildEdgeStyle(label, isFeedback, isSubEdge = false) {
  if (isFeedback) {
    return {
      label: label || '',
      type: 'smoothstep',
      pathOptions: { borderRadius: 12, offset: 28 },
      className: 'atlas-edge-feedback',
      data: { kind: 'feedback' },
      style: { stroke: '#b45309', strokeWidth: 1.5, strokeDasharray: '5 4' },
      labelStyle: { fill: '#92400e', fontSize: isSubEdge ? 10.5 : 11, fontWeight: 500 },
      labelBgStyle: { fill: '#fffbeb', fillOpacity: 0.96 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#b45309' },
    };
  }
  return {
    label: label || '',
    data: { kind: 'progression' },
    style: isSubEdge ? { stroke: '#a1a1aa', strokeWidth: 1.4 } : { stroke: '#71717a', strokeWidth: 1.5 },
    labelStyle: isSubEdge
      ? { fill: '#52525b', fontSize: 10.5, fontWeight: 500 }
      : { fill: '#27272a', fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
    labelBgPadding: isSubEdge ? [5, 2] : [6, 3],
    labelBgBorderRadius: 4,
    markerEnd: { type: MarkerType.ArrowClosed, color: isSubEdge ? '#a1a1aa' : '#71717a' },
  };
}

function buildGraphElements(data, activeStream, expandedIds, t, handlers) {
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data.edges) ? data.edges : [];

  const visibleTopNodes = rawNodes.filter((n) => {
    if (activeStream === 'all') return true;
    return Array.isArray(n.streamIds) && n.streamIds.includes(activeStream);
  });

  const visibleTopSet = new Set(visibleTopNodes.map((n) => n.id));
  let maxLabelPx = 0;
  for (const e of rawEdges) {
    if (!visibleTopSet.has(e.source) || !visibleTopSet.has(e.target)) continue;
    maxLabelPx = Math.max(maxLabelPx, visualTextUnits(e.label) * 11 + 14);
  }
  for (const n of visibleTopNodes) {
    const detailCount = Array.isArray(n.detailGraph?.nodes) ? n.detailGraph.nodes.length : 0;
    if (expandedIds.has(n.id) && detailCount > 0) {
      maxLabelPx = Math.max(maxLabelPx, visualTextUnits(t.detailEdgeLabel) * 10.5 + 12);
      for (const se of n.detailGraph.edges || []) {
        maxLabelPx = Math.max(maxLabelPx, visualTextUnits(se.label) * 10.5 + 12);
      }
    }
  }
  const ranksep = Math.min(220, Math.max(140, Math.round(maxLabelPx + 44)));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 64,
    ranksep,
    marginx: 44,
    marginy: 44,
  });

  const flowNodes = [];
  const flowEdges = [];

  for (const n of visibleTopNodes) {
    const detailCount = Array.isArray(n.detailGraph?.nodes) ? n.detailGraph.nodes.length : 0;
    const isExpanded = expandedIds.has(n.id) && detailCount > 0;
    const width = 296;
    const height = estimateNodeHeight(n, detailCount, false);
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
        if ((se.kind || 'progression') === 'feedback') continue;
        if (incomingCount.has(se.target)) {
          incomingCount.set(se.target, incomingCount.get(se.target) + 1);
        }
      }

      for (const sn of subNodes) {
        const subFlowId = `${n.id}::${sn.id}`;
        const sw = 264;
        const sh = estimateNodeHeight(sn, 0, true);
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
            data: { kind: 'progression' },
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
        const isFeedback = se.kind === 'feedback';
        // 反馈回路不加入 Dagre 有向拓扑，避免倒转从左到右的认知阶梯排布
        if (!isFeedback) g.setEdge(sId, tId);
        flowEdges.push({
          id: `subedge::${n.id}::${se.id || idx}`,
          source: sId,
          target: tId,
          ...buildEdgeStyle(se.label, isFeedback, true),
        });
      }
    }
  }

  for (let idx = 0; idx < rawEdges.length; idx++) {
    const e = rawEdges[idx];
    if (!visibleTopSet.has(e.source) || !visibleTopSet.has(e.target)) continue;
    const isFeedback = e.kind === 'feedback';
    if (!isFeedback) g.setEdge(e.source, e.target);
    flowEdges.push({
      id: e.id || `edge-${idx}`,
      source: e.source,
      target: e.target,
      ...buildEdgeStyle(e.label, isFeedback, false),
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

function AnchorSnippet({ content, language, snippetLabel, copyLabel, copiedLabel, testId }) {
  const plan = useMemo(() => resolveSnippetPlan(content, language), [content, language]);
  const [highlighted, setHighlighted] = useState(null);

  useEffect(() => {
    if (plan.mode === 'plain') {
      setHighlighted(null);
      return undefined;
    }
    let cancelled = false;
    setHighlighted(null);
    highlightSnippet(plan).then((result) => {
      if (!cancelled) setHighlighted(result);
    });
    return () => {
      cancelled = true;
    };
  }, [plan]);

  return (
    <div className="atlas-anchor-snippet" data-testid="anchor-snippet" data-snippet-label={snippetLabel || ''}>
      <pre
        translate="no"
        data-highlighted={highlighted ? 'true' : 'false'}
        data-hljs-lang={highlighted?.language || undefined}
      >
        {highlighted ? (
          <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted.html }} />
        ) : (
          plan.display
        )}
      </pre>
      <CopyButton
        text={content || ''}
        label={copyLabel}
        copiedLabel={copiedLabel}
        testId={testId}
        small
      />
    </div>
  );
}

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

async function exportFullCanvas(container, title, rf) {
  const flow = container.querySelector('.react-flow');
  if (!flow) return;
  if (!rf) { console.error('[Atlas] exportFullCanvas: rf instance is null, export skipped'); return; }

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

  const prevViewport = rf.getViewport();
  let dataUrl = null;
  try {
    // 等遮罩先渲染出来，再改视口
    await new Promise((r) => requestAnimationFrame(r));

    rf.setViewport({ x: -minX * scale, y: -minY * scale, zoom: scale }, { duration: 0 });

    // 等视口变换写入 DOM
    await new Promise((r) => requestAnimationFrame(r));

    dataUrl = await toPng(flow, {
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
  } finally {
    // 无论成功或异常都恢复视口并清理遮罩
    rf.setViewport(prevViewport, { duration: 0 });
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (!prevPos || prevPos === 'static') container.style.position = prevPos;
  }

  if (!dataUrl) return;
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
  // 浅图收起用不上的控件：两阶就讲完的主题不需要搜索与小地图
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

  const hasFeedbackEdges = useMemo(() => {
    if ((data.edges || []).some((e) => e.kind === 'feedback')) return true;
    return (data.nodes || []).some((n) =>
      (n.detailGraph?.edges || []).some((se) => se.kind === 'feedback')
    );
  }, [data.edges, data.nodes]);

  // 工具栏状态绑定到 URL query（nuqs）：刷新/分享链接即恢复
  const [activeStream, setActiveStream] = useQueryState(
    'stream',
    parseAsString.withDefault('all'),
    { history: 'replace' }
  );
  const [expandedIds, setExpandedIds] = useState(() => new Set(_savedState?.expandedIds || []));
  const [isLocked, setIsLocked] = useQueryState(
    'locked',
    parseAsBoolean.withDefault(true),
    { history: 'replace' }
  );
  const [showLegend, setShowLegend] = useQueryState(
    'legend',
    parseAsBoolean.withDefault(false),
    { history: 'replace' }
  );
  const [showMiniMap, setShowMiniMap] = useQueryState(
    'minimap',
    parseAsBoolean.withDefault(false),
    { history: 'replace' }
  );
  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 6000);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);
  const canvasRef = useRef(null);
  // 全屏目标：工具栏 + 画布 + 抽屉的整体容器（不含页头）
  const bodyRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => _savedState?.selectedId || null);
  const [deepDiveTarget, setDeepDiveTarget] = useState(null);
  const [resetEpoch, setResetEpoch] = useState(0);

  // 检视抽屉的滚动位置记忆：按节点 id 记录，切回该节点时恢复
  const inspectorRef = useRef(null);
  const inspectorScrollRef = useRef(_savedState?.inspectorScroll || {});
  // 滚动事件归属的节点 id：只在恢复完成后更新，避免切换瞬间的钳制滚动被记到新节点名下
  const inspectorScrollIdRef = useRef(null);

  const rf = useReactFlow();
  // onInit 回调拿到的实例是 ReactFlow 完成挂载后的稳定引用，
  // 专用于 exportFullCanvas（避免 context 时序问题导致 rf 为 undefined）
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

  // 用户手动拖动过的节点位置（只在布局指纹一致时从缓存恢复）
  const layoutFingerprint = _layoutFingerprint(data, activeStream, expandedIds);
  const movedPositionsRef = useRef(
    _savedState?.layout === layoutFingerprint ? _savedState.positions || null : null
  );
  // 结构变化后旧缓存作废，从空开始重新记录
  const lastFingerprintRef = useRef(layoutFingerprint);
  if (lastFingerprintRef.current !== layoutFingerprint) {
    lastFingerprintRef.current = layoutFingerprint;
    movedPositionsRef.current = null;
  }

  const initialNodes = useMemo(
    () => _applyCachedPositions(computed.nodes, movedPositionsRef.current),
    // 仅在挂载时计算一次；后续 computed 变化由下方 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computed.edges);

  // 节点在画布上被取消选中（点空白处等）时，联动关闭抽屉；
  // 同一批 change 里有新节点被选中（切节点）时不清空，由 onNodeClick 接力
  const handleNodesChange = useCallback(
    (changes) => {
      const deselected = changes.some(
        (c) => c.type === 'select' && c.selected === false && c.id === selectedId
      );
      const hasNewSelection = changes.some((c) => c.type === 'select' && c.selected === true);
      if (deselected && !hasNewSelection) setSelectedId(null);
      onNodesChange(changes);
    },
    [onNodesChange, selectedId]
  );

  // 拖拽兼容：RF 的 click 在拖拽松手后同样会触发，用「按下→松开的位移」区分点按与拖拽。
  // 位移超阈值视为拖拽，不当点击处理（不开/不关抽屉）；键盘激活没有按下坐标，照常生效
  const pressPosRef = useRef(null);
  const recordPressPos = useCallback((e) => {
    pressPosRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);
  const wasDragGesture = useCallback((e) => {
    const d = pressPosRef.current;
    pressPosRef.current = null;
    // 按下坐标超时作废：拖拽在画布外松手时 click 不触发，残留坐标不该误吞下一次点击
    if (!d || Date.now() - d.t > 600) return false;
    return Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4;
  }, []);

  const handleNodeClick = useCallback(
    (e, node) => {
      if (wasDragGesture(e)) return;
      setSelectedId(node.id);
    },
    [wasDragGesture]
  );

  const handlePaneClick = useCallback(
    (e) => {
      if (wasDragGesture(e)) return;
      setSelectedId(null);
    },
    [wasDragGesture]
  );

  // 初始状态已经是 computed：挂载时不再重复写入。重复写入会用未测量的节点对象覆盖
  // React Flow 刚量好的尺寸与连接点，偶发地让所有连线不再渲染。
  const appliedComputedRef = useRef(computed);
  useEffect(() => {
    if (appliedComputedRef.current === computed) return;
    appliedComputedRef.current = computed;
    setNodes(_applyCachedPositions(computed.nodes, movedPositionsRef.current));
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
        viewport: rfInitRef.current?.getViewport() ?? null,
        layout: layoutFingerprint,
        positions: movedPositionsRef.current,
        inspectorScroll: inspectorScrollRef.current,
      });
    };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [selectedId, expandedIds, layoutFingerprint]);

  // 拖动结束时记录节点位置，下次打开（或重新布局）时恢复
  const handleNodeDragStop = useCallback((_, node) => {
    if (!movedPositionsRef.current) movedPositionsRef.current = {};
    movedPositionsRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  const handleFitViewOnly = useCallback(() => {
    rf.fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
  }, [rf]);

  // ESC 等浏览器原生退出也要同步按钮状态
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return;
    }
    const p = bodyRef.current?.requestFullscreen?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, []);

  const handleFullReset = useCallback(() => {
    setActiveStream('all');
    setExpandedIds(new Set());
    setSearchQuery('');
    setSelectedId(null);
    setDeepDiveTarget(null);
    setShowScopeModal(false);
    setIsLocked(true);
    setShowLegend(false);
    setShowMiniMap(false);
    setResetEpoch((c) => c + 1);
    movedPositionsRef.current = null;
    inspectorScrollRef.current = {};
    // 清除缓存，确保下次访问不会误恢复旧状态
    try { localStorage.removeItem(_STATE_KEY); } catch {}
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

  // 抽屉显隐过渡：进入时先挂载再下一帧滑入；退出时等动画播完再卸载
  const [drawerItem, setDrawerItem] = useState(selectedItem);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (selectedItem) {
      setDrawerItem(selectedItem);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setDrawerOpen(true)));
      return () => cancelAnimationFrame(raf);
    }
    setDrawerOpen(false);
    const timer = setTimeout(() => setDrawerItem(null), 240);
    return () => clearTimeout(timer);
  }, [selectedItem]);

  // 切换节点后恢复该节点抽屉的滚动位置；未看过的节点回到顶部。
  // 只有渲染内容真的切到当前节点（drawerItem === selectedItem）才恢复并认领滚动事件，
  // 过渡期间的旧内容既不恢复也不记录，避免钳制滚动串到别的节点名下
  useEffect(() => {
    inspectorScrollIdRef.current = null;
    const el = inspectorRef.current;
    if (!el || !selectedId || drawerItem !== selectedItem) return;
    inspectorScrollIdRef.current = selectedId;
    el.scrollTop = inspectorScrollRef.current[selectedId] || 0;
  }, [selectedId, selectedItem, drawerItem]);

  const handleInspectorScroll = useCallback((e) => {
    const id = inspectorScrollIdRef.current;
    if (id) inspectorScrollRef.current[id] = e.currentTarget.scrollTop;
  }, []);

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
              {t.depthUnit}
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
      <div className="atlas-body" ref={bodyRef}>
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
              data-testid="btn-fullscreen"
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? t.exitFullscreen : t.fullscreen}
              title={isFullscreen ? t.exitFullscreen : t.fullscreen}
              className={`atlas-ctrl-btn ${isFullscreen ? 'active' : ''}`}
              onClick={handleToggleFullscreen}
            >
              <IconFullscreen active={isFullscreen} />
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
            {!isCompact && (
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
            )}
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
                  await exportFullCanvas(canvasRef.current, meta.title, rfInitRef.current ?? rf);
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
                try {
                  const res = await _exportZip(data, meta);
                  if (res?.skippedFileChildren) {
                    showToast(t.exportZipFileProtocolHint);
                  }
                } catch (error) {
                  console.error('[Atlas] ZIP export failed:', error);
                  showToast(t.exportZipFailed);
                } finally {
                  setExportingZip(false);
                }
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
        <div
          className="atlas-canvas-container"
          data-testid="atlas-canvas-wrap"
          ref={canvasRef}
          onPointerDownCapture={recordPressPos}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onNodeDragStop={handleNodeDragStop}
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
            {!isCompact && showMiniMap && (
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
              {hasFeedbackEdges && (
                <div className="atlas-legend-row" data-testid="legend-feedback-row">
                  <span className="atlas-legend-line" aria-hidden="true" />
                  <span>{t.feedbackEdge}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {drawerItem && (
          <aside
            className={`atlas-inspector ${drawerOpen ? 'open' : ''}`}
            data-testid="inspector-panel"
            ref={inspectorRef}
            onScroll={handleInspectorScroll}
          >
            <div className="atlas-inspector-head">
              <div className="atlas-inspector-head-text">
                {drawerItem._parentTitle && (
                  <div className="atlas-inspector-parent">{drawerItem._parentTitle}</div>
                )}
                <h2 className="atlas-inspector-title">{drawerItem.title}</h2>
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
                    backgroundColor: drawerItem.confidence === 'unverified' ? '#b45309' : '#15803d',
                  }}
                  aria-hidden="true"
                />
                <span>{drawerItem.confidence === 'unverified' ? t.unverifiedTag : t.verifiedTag}</span>
              </span>
              {drawerItem.unverifiedReason && (
                <p className="atlas-unverified-note">{drawerItem.unverifiedReason}</p>
              )}
            </div>

            {drawerItem.summary && (
              <section className="atlas-sec">
                <h4>{t.whatItDoes}</h4>
                <p>{drawerItem.summary}</p>
              </section>
            )}

            {drawerItem.whyItMatters && (
              <section className="atlas-sec">
                <h4>{t.whyItMatters}</h4>
                <p>{drawerItem.whyItMatters}</p>
              </section>
            )}

            {(drawerItem.keyFactors?.inputs || drawerItem.keyFactors?.outputs) && (
              <section className="atlas-sec">
                {drawerItem.keyFactors.inputs && (
                  <div className="atlas-kv">
                    <strong>{t.inputsLabel}{t.kvColon}</strong>
                    <span>{drawerItem.keyFactors.inputs}</span>
                  </div>
                )}
                {drawerItem.keyFactors.outputs && (
                  <div className="atlas-kv">
                    <strong>{t.outputsLabel}{t.kvColon}</strong>
                    <span>{drawerItem.keyFactors.outputs}</span>
                  </div>
                )}
              </section>
            )}

            {drawerItem.mechanismsAndEffects && (
              <section className="atlas-sec">
                <h4>{t.mechanismsLabel}</h4>
                <p>{drawerItem.mechanismsAndEffects}</p>
              </section>
            )}

            {drawerItem.watchouts && (
              <section className="atlas-sec atlas-watchout-box">
                <h4>{t.watchoutsLabel}</h4>
                <p>{drawerItem.watchouts}</p>
              </section>
            )}

            {Array.isArray(drawerItem.anchors) && drawerItem.anchors.length > 0 && (
              <section className="atlas-sec">
                <h4>{t.anchorsLabel}</h4>
                <div className="atlas-anchor-list">
                  {drawerItem.anchors.map((anc, i) => (
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
                        <AnchorSnippet
                          content={anc.content}
                          language={anc.language}
                          snippetLabel={anc.label}
                          copyLabel={t.copySnippet}
                          copiedLabel={t.copiedBtn}
                          testId={`btn-copy-snippet-${i}`}
                        />
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

            {drawerItem.deepDive && (
              <section className="atlas-sec">
                <button
                  type="button"
                  data-testid="inspector-open-deep-dive"
                  className="atlas-open-dive-btn"
                  onClick={() =>
                    setDeepDiveTarget({
                      title: drawerItem.title,
                      deepDive: drawerItem.deepDive,
                    })
                  }
                >
                  <IconDeepDive />
                  <span>{t.openDeepDiveBtn}</span>
                </button>
              </section>
            )}
          </aside>
        )}
      </main>
      {toastMsg && (
        <div className="atlas-toast" data-testid="atlas-toast" role="status" aria-live="polite">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="atlas-toast-close"
            aria-label={t.close}
            onClick={() => setToastMsg('')}
          >
            ×
          </button>
        </div>
      )}
      </div>

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
    <NuqsAdapter>
      <ReactFlowProvider>
        <AtlasCanvasApp data={data} />
      </ReactFlowProvider>
    </NuqsAdapter>
  );
}

mountAtlas();
