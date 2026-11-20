#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLAIN_LANGUAGES, normalizeLanguageHint, resolveSnippetPlan, walkSnippetAnchors } from '../template/snippet-lang.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const SHELL_PATH = path.join(SKILL_ROOT, 'assets', 'viewer-shell.html');

export const VALID_ROLES = new Set([
  'entry',
  'core',
  'branch',
  'foundation',
  'context',
  'extension',
  'outcome',
]);

export const VALID_EDGE_KINDS = new Set(['progression', 'feedback']);

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{24,}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

// 深度 = 认知阶梯的推进阶数。评分 → 深度：depth = score / 2 + 1（2 分→2 阶，10 分→6 阶）
const MIN_DEPTH = 2;
const MAX_DEPTH = 6;
const TOP_NODE_SOFT_CAP = 20;

// 泛泛填充的伪追问：没有锚定任何具体机制，读者点开也问不出东西
const LAZY_PROMPT_PATTERNS = [
  /^\s*(请)?(详细|仔细|全面|系统)(地)?(解释|介绍|说明|讲讲|说说)/,
  /^\s*(解释|介绍|说明|讲讲|说说)(一下)?\s*\S{0,12}\s*$/,
  /^\s*(tell me|explain|describe)\b.{0,24}$/i,
  /^\s*more (details|info)\b/i,
];

// 顶层图上的最长认知阶梯（推进边数，排除 kind === 'feedback' 的反馈回路）。推进边成环时返回 null
export function longestChain(nodes, edges) {
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if ((e.kind || 'progression') === 'feedback') continue;
    if (out.has(e.source)) out.get(e.source).push(e.target);
  }
  const state = new Map();
  let cycle = false;
  const memo = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) {
      cycle = true;
      return 0;
    }
    if (state.get(id) === 2) return memo.get(id) || 0;
    state.set(id, 1);
    let best = 0;
    for (const next of out.get(id) || []) {
      best = Math.max(best, 1 + visit(next));
    }
    state.set(id, 2);
    memo.set(id, best);
    return best;
  };
  let longest = 0;
  for (const n of nodes) longest = Math.max(longest, visit(n.id));
  return cycle ? null : longest;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--data') args.data = argv[++i];
    else if (k === '--out') args.out = argv[++i];
  }
  return args;
}

export function slugify(input, fallback = 'subject') {
  const s = String(input || '')
    .trim()
    .replace(/[\/\\:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return s || fallback;
}

function encodeEditorUri(absPath, line = 1, editor = 'vscode') {
  const normalized = absPath.replace(/\\/g, '/');
  const encodedSegments = normalized
    .split('/')
    .map((seg, idx) => {
      if (idx === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
      return encodeURIComponent(seg);
    })
    .join('/');
  const pathPart = encodedSegments.startsWith('/') ? encodedSegments : `/${encodedSegments}`;
  const scheme = editor === 'zed' ? 'zed' : 'vscode';
  return `${scheme}://file${pathPart}:${Math.max(1, Number(line) || 1)}:1`;
}

function escapeScript(source) {
  return String(source || '').replace(/<\/script/gi, '<\\/script');
}

function hljsPayloadFor(data) {
  const dir = path.join(SKILL_ROOT, 'assets', 'hljs');
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return '';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const needed = new Set();
  let auto = false;
  walkSnippetAnchors(data, (anchor) => {
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

  const parts = [
    `<script type="text/plain" id="atlas-hljs-manifest">${JSON.stringify(manifest).replace(/</g, '\\u003c')}</script>`,
    `<script type="text/plain" id="atlas-hljs-core">${escapeScript(fs.readFileSync(path.join(dir, 'core.js'), 'utf8'))}</script>`,
  ];
  for (const name of [...needed].sort()) {
    const file = path.join(dir, 'lang', `${name}.js`);
    if (!fs.existsSync(file)) continue;
    parts.push(
      `<script type="text/plain" id="atlas-hljs-lang-${name}">${escapeScript(fs.readFileSync(file, 'utf8'))}</script>`
    );
  }
  return parts.join('\n');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function validateAndEnrich(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    throw new Error('图数据必须是 JSON 对象。');
  }
  const meta = data.meta || {};
  if (!meta.title || typeof meta.title !== 'string') errors.push('缺少 meta.title');
  if (!meta.language || typeof meta.language !== 'string') errors.push('缺少 meta.language');
  if (!meta.generatedByModel || typeof meta.generatedByModel !== 'string') {
    errors.push('缺少 meta.generatedByModel（必须填写当前模型名称）');
  }

  const streams = Array.isArray(data.streams) ? data.streams : [];
  if (streams.length === 0) errors.push('data.streams 中至少需要一条脉络');
  const streamIds = new Set(streams.map((s) => s.id));

  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  if (nodes.length === 0) errors.push('data.nodes 中至少需要一个节点');

  const depth = Number(meta.depth);
  if (!Number.isInteger(depth) || depth < MIN_DEPTH || depth > MAX_DEPTH) {
    errors.push(
      `缺少或无效的 meta.depth "${meta.depth}"：必须是 ${MIN_DEPTH}–${MAX_DEPTH} 的整数（认知阶梯允许的推进阶数）`
    );
  }
  if (!meta.depthReason || !String(meta.depthReason).trim()) {
    errors.push('缺少 meta.depthReason（用一句话写明深度判断依据：学习者能自行补足几阶跨度）');
  }

  const nodeIds = new Set();
  let deepDiveNodeCount = 0;
  let manifestAliases = null;
  try {
    const manifestPath = path.join(SKILL_ROOT, 'assets', 'hljs', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      manifestAliases = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).aliases || null;
    }
  } catch {
    manifestAliases = null;
  }

  const verifyAnchors = (anchors, ownerLabel) => {
    if (!Array.isArray(anchors)) return;
    for (const anc of anchors) {
      if (!anc || typeof anc !== 'object') continue;
      if (!['editor', 'snippet', 'link', 'source'].includes(anc.kind)) {
        errors.push(`${ownerLabel}：无效的 anchor.kind "${anc.kind}"`);
        continue;
      }
      if (anc.kind === 'snippet' && anc.language != null && anc.language !== '') {
        const hint = normalizeLanguageHint(anc.language);
        if (typeof anc.language !== 'string' || !/^[\w#+.-]{1,64}$/.test(hint)) {
          errors.push(`${ownerLabel}：snippet.language 必须是语言 id 或别名`);
        } else if (manifestAliases && !PLAIN_LANGUAGES.has(hint) && hint !== 'auto' && !manifestAliases[hint]) {
          warnings.push(`${ownerLabel}：snippet.language "${anc.language}" 没有对应语法，片段会保持纯文本`);
        }
      }
      if (anc.kind === 'editor') {
        if (!anc.absPath || !path.isAbsolute(anc.absPath)) {
          errors.push(`${ownerLabel}：editor 锚点的 absPath 必须是已验证的绝对路径`);
          continue;
        }
        if (!fs.existsSync(anc.absPath) || !fs.statSync(anc.absPath).isFile()) {
          errors.push(`${ownerLabel}：editor 锚点指向的文件不存在：${anc.absPath}`);
          continue;
        }
        const totalLines = fs.readFileSync(anc.absPath, 'utf8').split(/\r?\n/).length;
        const lineNum = Number(anc.line || 1);
        if (lineNum < 1 || lineNum > totalLines) {
          errors.push(
            `${ownerLabel}：editor 锚点行号 ${lineNum} 超出 ${anc.absPath} 的范围（1..${totalLines}）`
          );
          continue;
        }
        const ed = anc.editor === 'zed' ? 'zed' : meta.editor === 'zed' ? 'zed' : 'vscode';
        anc.editor = ed;
        anc.editorUri = encodeEditorUri(anc.absPath, lineNum, ed);
        if (anc.editorUri.startsWith('file://')) {
          errors.push(`${ownerLabel}：编辑器跳转禁止使用裸 file:// 链接`);
        }
      }
    }
  };

  for (const n of nodes) {
    if (!n.id) errors.push('每个节点都必须有 id');
    if (nodeIds.has(n.id)) errors.push(`节点 id 重复：${n.id}`);
    nodeIds.add(n.id);

    if (!n.title) errors.push(`节点 ${n.id}：缺少 title`);
    if (!VALID_ROLES.has(n.role)) {
      errors.push(`节点 ${n.id}：无效的 role "${n.role}"，必须是以下之一：${[...VALID_ROLES].join(', ')}`);
    }
    if (!Array.isArray(n.streamIds) || n.streamIds.length === 0) {
      errors.push(`节点 ${n.id}：streamIds 必须至少引用一条脉络`);
    } else {
      for (const sid of n.streamIds) {
        if (!streamIds.has(sid)) errors.push(`节点 ${n.id}：未知的 streamId "${sid}"`);
      }
    }

    verifyAnchors(n.anchors, `节点 ${n.id}`);

    if (n.deepDive) {
      const asks = Array.isArray(n.deepDive.askPrompts) ? n.deepDive.askPrompts : [];
      if (asks.length > 0 || n.deepDive.subAtlasPrompt || n.deepDive.childAtlasUrl) deepDiveNodeCount++;
      for (const ap of asks) {
        const text = String(ap.prompt || '').trim();
        if (text.length < 20) {
          errors.push(`节点 ${n.id}：askPrompts 必须是具体、有实质内容的问题（不少于 20 个字符）`);
        } else if (LAZY_PROMPT_PATTERNS.some((p) => p.test(text))) {
          errors.push(
            `节点 ${n.id}：askPrompts "${text.slice(0, 24)}…" 是泛泛填充，必须锚定具体机制、边界情况或权衡`
          );
        }
      }
    }

    if (n.detailGraph) {
      const subNodes = Array.isArray(n.detailGraph.nodes) ? n.detailGraph.nodes : [];
      const subIds = new Set();
      for (const sn of subNodes) {
        if (!sn.id || !sn.title) errors.push(`节点 ${n.id} 的 detailGraph 子节点缺少 id/title`);
        if (subIds.has(sn.id)) errors.push(`节点 ${n.id} 的 detailGraph 子节点 id 重复："${sn.id}"`);
        if (sn.role !== undefined && !VALID_ROLES.has(sn.role)) {
          errors.push(
            `子节点 ${n.id}::${sn.id}：无效的 role "${sn.role}"，必须是以下之一：${[...VALID_ROLES].join(', ')}`
          );
        }
        subIds.add(sn.id);
        verifyAnchors(sn.anchors, `子节点 ${n.id}::${sn.id}`);
      }
      for (const se of n.detailGraph.edges || []) {
        if (!subIds.has(se.source) || !subIds.has(se.target)) {
          errors.push(`节点 ${n.id} 的 detailGraph 边引用了未知子节点：${se.source} -> ${se.target}`);
        }
        if (se.kind !== undefined && !VALID_EDGE_KINDS.has(se.kind)) {
          errors.push(
            `节点 ${n.id} 的 detailGraph 边 ${se.source} -> ${se.target}：无效的 edge.kind "${se.kind}"，必须是 progression 或 feedback`
          );
        }
        if (!se.label || !String(se.label).trim()) {
          errors.push(`节点 ${n.id} 的 detailGraph 边 ${se.source} -> ${se.target}：必须填写 label`);
        }
      }
    }
  }

  // 深度检查：顶层最长认知阶梯必须真的连到 meta.depth 阶。深度是可证伪的，节点数不是
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const chain = longestChain(nodes, edges);
  if (chain === null) {
    errors.push(
      '顶层推进边构成了环，无法确定认知阶梯深度：若表达系统真实反馈或迭代回流，请在该边标注 "kind": "feedback"；否则请改为单向递进或收进 detailGraph'
    );
  } else if (Number.isInteger(depth)) {
    if (chain < depth) {
      errors.push(
        `meta.depth 为 ${depth} 阶，但顶层最长认知阶梯只有 ${chain} 阶：主干推进未达到目标深度。请补足更深层的机理/跃迁节点，或下调 depth`
      );
    } else if (chain > MAX_DEPTH + 2) {
      warnings.push(
        `顶层最长认知阶梯有 ${chain} 阶：超过 ${MAX_DEPTH + 2} 阶后读者很难一次消化，考虑收进 detailGraph`
      );
    }
  }
  if (nodes.length > TOP_NODE_SOFT_CAP) {
    warnings.push(
      `有 ${nodes.length} 个顶层节点（软上限 ${TOP_NODE_SOFT_CAP}）：节点数不决定档位，但过宽会稀释视线，考虑把细节收进 detailGraph`
    );
  }

  if (deepDiveNodeCount === 0) {
    const streamDiveCount = streams.filter((s) => {
      const asks = Array.isArray(s.deepDive?.askPrompts) ? s.deepDive.askPrompts : [];
      return asks.length > 0 || s.deepDive?.subAtlasPrompt || s.deepDive?.childAtlasUrl;
    }).length;
    if (streamDiveCount === 0) {
      errors.push('至少要有一个节点或一条脉络提供 deepDive 提示（↳ 循环提示）');
    }
  }

  for (const s of streams) {
    for (const lid of s.learningOrder || []) {
      if (!nodeIds.has(lid)) {
        errors.push(`脉络 ${s.id}：learningOrder 引用了未知节点 "${lid}"`);
      }
    }
  }

  let feedbackEdgeCount = 0;
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      errors.push(`边引用了未知节点：${e.source} -> ${e.target}`);
    }
    if (e.kind !== undefined && !VALID_EDGE_KINDS.has(e.kind)) {
      errors.push(
        `边 ${e.source} -> ${e.target}：无效的 edge.kind "${e.kind}"，必须是 progression 或 feedback`
      );
    }
    if (e.kind === 'feedback') feedbackEdgeCount++;
    if (!e.label || !String(e.label).trim()) {
      errors.push(`边 ${e.source} -> ${e.target}：必须填写 label，以说明推进关系、反馈机制或分支条件`);
    }
  }

  const rawJsonString = JSON.stringify(data);
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(rawJsonString)) {
      errors.push(`安全检查未通过：检测到疑似密钥，匹配 ${pat}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`AtlasGraphData 校验失败：\n- ${errors.join('\n- ')}`);
  }

  return { data, warnings, feedbackEdgeCount };
}

export function buildAtlasHtml({ data, dataPath, outPath, write = true } = {}) {
  if (!fs.existsSync(SHELL_PATH)) {
    throw new Error(`缺少查看器外壳模板：${SHELL_PATH}`);
  }
  const raw = data !== undefined ? data : JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const { data: validated, warnings, feedbackEdgeCount } = validateAndEnrich(raw);
  const meta = validated.meta;

  let resolvedOut = outPath;
  if (!resolvedOut) {
    const baseSlug = slugify(meta.title, 'learning');
    if (Number(meta.level) > 0 && meta.drillDownTarget) {
      const subSlug = slugify(meta.drillDownTarget, 'detail');
      resolvedOut = path.resolve(process.cwd(), `${baseSlug}-sub-${subSlug}-atlas.html`);
    } else {
      resolvedOut = path.resolve(process.cwd(), `${baseSlug}-atlas.html`);
    }
  } else {
    resolvedOut = path.resolve(resolvedOut);
  }

  const shellHtml = fs.readFileSync(SHELL_PATH, 'utf8');
  const safeJsonPayload = JSON.stringify(validated).replace(/</g, '\\u003c');

  const finalHtml = shellHtml
    .replace('__ATLAS_HTML_LANG__', escapeHtml(meta.language || 'en'))
    .replace('__ATLAS_HTML_TITLE__', escapeHtml(`${meta.title} — Atlas Loop`))
    .replace('__ATLAS_DATA_JSON__', () => safeJsonPayload)
    .replace('<!--__ATLAS_HLJS_PAYLOAD__-->', () => hljsPayloadFor(validated));

  if (write) {
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, finalHtml, 'utf8');
  }

  return {
    ok: true,
    outputHtml: resolvedOut,
    bytes: write ? fs.statSync(resolvedOut).size : Buffer.byteLength(finalHtml, 'utf8'),
    nodeCount: validated.nodes.length,
    streamCount: validated.streams.length,
    depth: meta.depth,
    feedbackEdgeCount,
    warnings,
    html: finalHtml,
    data: validated,
  };
}

export function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (!args.data) {
    console.error('用法：node build_atlas.mjs --data <graph-data.json> [--out <output.html>]');
    process.exit(1);
  }
  if (!fs.existsSync(SHELL_PATH)) {
    console.error(`缺少查看器外壳模板：${SHELL_PATH}`);
    process.exit(1);
  }

  const res = buildAtlasHtml({ dataPath: args.data, outPath: args.out, write: true });
  console.log(
    JSON.stringify(
      {
        ok: res.ok,
        outputHtml: res.outputHtml,
        bytes: res.bytes,
        nodeCount: res.nodeCount,
        streamCount: res.streamCount,
        depth: res.depth,
        feedbackEdgeCount: res.feedbackEdgeCount,
        ...(res.warnings.length > 0 ? { warnings: res.warnings } : {}),
      },
      null,
      2
    )
  );
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
  main();
}
