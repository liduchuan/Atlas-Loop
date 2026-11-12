#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const SHELL_PATH = path.join(SKILL_ROOT, 'assets', 'viewer-shell.html');

const VALID_ROLES = new Set([
  'entry',
  'core',
  'branch',
  'foundation',
  'context',
  'extension',
  'outcome',
]);

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{24,}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--data') args.data = argv[++i];
    else if (k === '--out') args.out = argv[++i];
  }
  return args;
}

function slugify(input, fallback = 'subject') {
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

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateAndEnrich(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    throw new Error('Graph data must be a JSON object.');
  }
  const meta = data.meta || {};
  if (!meta.title || typeof meta.title !== 'string') errors.push('Missing meta.title');
  if (!meta.language || typeof meta.language !== 'string') errors.push('Missing meta.language');
  if (!meta.generatedByModel || typeof meta.generatedByModel !== 'string') {
    errors.push('Missing meta.generatedByModel (must carry the active model name)');
  }

  const streams = Array.isArray(data.streams) ? data.streams : [];
  if (streams.length === 0) errors.push('At least one stream is required in data.streams');
  const streamIds = new Set(streams.map((s) => s.id));

  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  if (nodes.length === 0) errors.push('At least one node is required in data.nodes');

  const nodeIds = new Set();
  let deepDiveNodeCount = 0;

  const verifyAnchors = (anchors, ownerLabel) => {
    if (!Array.isArray(anchors)) return;
    for (const anc of anchors) {
      if (!anc || typeof anc !== 'object') continue;
      if (!['editor', 'snippet', 'link', 'source'].includes(anc.kind)) {
        errors.push(`${ownerLabel}: invalid anchor.kind "${anc.kind}"`);
        continue;
      }
      if (anc.kind === 'editor') {
        if (!anc.absPath || !path.isAbsolute(anc.absPath)) {
          errors.push(`${ownerLabel}: editor anchor requires verified absolute path in absPath`);
          continue;
        }
        if (!fs.existsSync(anc.absPath) || !fs.statSync(anc.absPath).isFile()) {
          errors.push(`${ownerLabel}: editor anchor file does not exist: ${anc.absPath}`);
          continue;
        }
        const totalLines = fs.readFileSync(anc.absPath, 'utf8').split(/\r?\n/).length;
        const lineNum = Number(anc.line || 1);
        if (lineNum < 1 || lineNum > totalLines) {
          errors.push(
            `${ownerLabel}: editor anchor line ${lineNum} out of range (1..${totalLines}) for ${anc.absPath}`
          );
          continue;
        }
        const ed = anc.editor === 'zed' ? 'zed' : meta.editor === 'zed' ? 'zed' : 'vscode';
        anc.editor = ed;
        anc.editorUri = encodeEditorUri(anc.absPath, lineNum, ed);
        if (anc.editorUri.startsWith('file://')) {
          errors.push(`${ownerLabel}: plain file:// link is forbidden for editor jump`);
        }
      }
    }
  };

  for (const n of nodes) {
    if (!n.id) errors.push('Every node must have an id');
    if (nodeIds.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    nodeIds.add(n.id);

    if (!n.title) errors.push(`Node ${n.id}: missing title`);
    if (!VALID_ROLES.has(n.role)) {
      errors.push(`Node ${n.id}: invalid role "${n.role}". Must be one of ${[...VALID_ROLES].join(', ')}`);
    }
    if (!Array.isArray(n.streamIds) || n.streamIds.length === 0) {
      errors.push(`Node ${n.id}: streamIds must reference at least one stream`);
    } else {
      for (const sid of n.streamIds) {
        if (!streamIds.has(sid)) errors.push(`Node ${n.id}: unknown streamId "${sid}"`);
      }
    }

    verifyAnchors(n.anchors, `Node ${n.id}`);

    if (n.deepDive) {
      const asks = Array.isArray(n.deepDive.askPrompts) ? n.deepDive.askPrompts : [];
      if (asks.length > 0 || n.deepDive.subAtlasPrompt) deepDiveNodeCount++;
      for (const ap of asks) {
        if (!ap.prompt || String(ap.prompt).trim().length < 20) {
          errors.push(`Node ${n.id}: askPrompts must be specific, non-trivial questions (>= 20 chars)`);
        }
      }
    }

    if (n.detailGraph) {
      const subNodes = Array.isArray(n.detailGraph.nodes) ? n.detailGraph.nodes : [];
      const subIds = new Set();
      for (const sn of subNodes) {
        if (!sn.id || !sn.title) errors.push(`Node ${n.id} detailGraph subnode missing id/title`);
        if (subIds.has(sn.id)) errors.push(`Node ${n.id} detailGraph duplicate subnode id "${sn.id}"`);
        subIds.add(sn.id);
        verifyAnchors(sn.anchors, `Subnode ${n.id}::${sn.id}`);
      }
      for (const se of n.detailGraph.edges || []) {
        if (!subIds.has(se.source) || !subIds.has(se.target)) {
          errors.push(`Node ${n.id} detailGraph edge references unknown subnode: ${se.source} -> ${se.target}`);
        }
      }
    }
  }

  if (deepDiveNodeCount === 0) {
    errors.push('At least one core node must provide deepDive prompts (? Loop Prompts)');
  }

  for (const s of streams) {
    for (const lid of s.learningOrder || []) {
      if (!nodeIds.has(lid)) {
        errors.push(`Stream ${s.id}: learningOrder references unknown node "${lid}"`);
      }
    }
  }

  for (const e of data.edges || []) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      errors.push(`Edge references unknown node: ${e.source} -> ${e.target}`);
    }
    if (!e.label || !String(e.label).trim()) {
      errors.push(`Edge ${e.source} -> ${e.target}: edge label is required to clarify relationship/branch`);
    }
  }

  const rawJsonString = JSON.stringify(data);
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(rawJsonString)) {
      errors.push(`Security check failed: detected potential secret matching ${pat}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`AtlasGraphData validation failed:\n- ${errors.join('\n- ')}`);
  }

  return data;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.data) {
    console.error('Usage: node build_atlas.mjs --data <graph-data.json> [--out <output.html>]');
    process.exit(1);
  }
  if (!fs.existsSync(SHELL_PATH)) {
    console.error(`Missing viewer shell template at ${SHELL_PATH}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(args.data, 'utf8'));
  const validated = validateAndEnrich(raw);
  const meta = validated.meta;

  let outPath = args.out;
  if (!outPath) {
    const baseSlug = slugify(meta.title, 'learning');
    if (Number(meta.level) > 0 && meta.drillDownTarget) {
      const subSlug = slugify(meta.drillDownTarget, 'detail');
      outPath = path.resolve(process.cwd(), `${baseSlug}-sub-${subSlug}-atlas.html`);
    } else {
      outPath = path.resolve(process.cwd(), `${baseSlug}-atlas.html`);
    }
  } else {
    outPath = path.resolve(outPath);
  }

  const shellHtml = fs.readFileSync(SHELL_PATH, 'utf8');
  const safeJsonPayload = JSON.stringify(validated).replace(/</g, '\\u003c');

  const finalHtml = shellHtml
    .replace('__ATLAS_HTML_LANG__', escapeHtml(meta.language || 'en'))
    .replace('__ATLAS_HTML_TITLE__', escapeHtml(`${meta.title} — AtlasLoop`))
    .replace('__ATLAS_DATA_JSON__', () => safeJsonPayload);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, finalHtml, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputHtml: outPath,
        bytes: fs.statSync(outPath).size,
        nodeCount: validated.nodes.length,
        streamCount: validated.streams.length,
      },
      null,
      2
    )
  );
}

main();
