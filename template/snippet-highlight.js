// 按需加载 highlight.js。首屏包不包含任何语法；打开代码片段时才取核心和对应语言。
import { resolveSnippetPlan } from './snippet-lang.mjs';

const moduleLoads = new Map();
const languageLoads = new Map();
let manifestPromise = null;
let corePromise = null;

export { resolveSnippetPlan };

function inlineSource(id) {
  const el = document.getElementById(`atlas-hljs-${id}`);
  if (!el) return '';
  return el.textContent || '';
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  const chunkSize = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

function evalInlineModule(source) {
  const match = String(source || '').match(/export\s*\{\s*([\w$]+)\s+as\s+default\s*\}\s*;?\s*$/);
  if (!match) {
    throw new Error('内联模块导出格式不支持回退求值');
  }
  const body = `${source.slice(0, match.index)}\nreturn ${match[1]};`;
  const exported = new Function(body)();
  return { default: exported };
}

function devModuleUrl(id) {
  if (id === 'core') return '/__hljs/core.js';
  if (id.startsWith('lang-')) return `/__hljs/lang/${id.slice(5)}.js`;
  return '';
}

function loadModule(id) {
  if (moduleLoads.has(id)) return moduleLoads.get(id);
  const pending = (async () => {
    const inline = inlineSource(id);
    if (inline.trim()) {
      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(new Blob([inline], { type: 'text/javascript' }));
        return await import(blobUrl);
      } catch {
        // Safari / WebKit file:// 下 blob: 创建或动态 import 可能被拦截，依次尝试 data: URL 与直接求值
      } finally {
        if (blobUrl) {
          try { URL.revokeObjectURL(blobUrl); } catch {}
        }
      }
      try {
        return await import(`data:text/javascript;base64,${toBase64Utf8(inline)}`);
      } catch {
        // 某些受限环境禁用 data: 模块时回退到隔离函数求值
      }
      return evalInlineModule(inline);
    }

    const url = devModuleUrl(id);
    if (!url) throw new Error(`缺少高亮模块 ${id}`);
    return await import(url);
  })().catch((error) => {
    moduleLoads.delete(id);
    throw error;
  });
  moduleLoads.set(id, pending);
  return pending;
}

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const inline = inlineSource('manifest');
      if (inline.trim()) return JSON.parse(inline);
      const response = await fetch('/__hljs/manifest.json');
      if (!response.ok) throw new Error('无法读取高亮语言清单');
      return response.json();
    })().catch((error) => {
      manifestPromise = null;
      throw error;
    });
  }
  return manifestPromise;
}

function loadCore() {
  if (!corePromise) {
    corePromise = loadModule('core')
      .then((mod) => {
        const hljs = mod.default?.highlight ? mod.default : mod.default?.default;
        if (!hljs) throw new Error('高亮核心无效');
        return hljs;
      })
      .catch((error) => {
        corePromise = null;
        throw error;
      });
  }
  return corePromise;
}

function collectDeps(manifest, roots) {
  const visited = new Set();
  const queue = [];
  for (const raw of roots) {
    const canonical = manifest.aliases?.[raw] || raw;
    if (canonical && manifest.languages?.includes(canonical) && !visited.has(canonical)) {
      visited.add(canonical);
      queue.push(canonical);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i];
    for (const dep of manifest.deps?.[name] || []) {
      const canonicalDep = manifest.aliases?.[dep] || dep;
      if (canonicalDep && manifest.languages?.includes(canonicalDep) && !visited.has(canonicalDep)) {
        visited.add(canonicalDep);
        queue.push(canonicalDep);
      }
    }
  }
  return queue;
}

function registerOneLanguage(hljs, canonical) {
  if (hljs.getLanguage(canonical)) return Promise.resolve(canonical);
  if (languageLoads.has(canonical)) return languageLoads.get(canonical);

  const pending = loadModule(`lang-${canonical}`)
    .then((mod) => {
      if (!hljs.getLanguage(canonical)) {
        const factory = typeof mod.default === 'function' ? mod.default : mod.default?.default;
        if (typeof factory !== 'function') return null;
        hljs.registerLanguage(canonical, factory);
      }
      return hljs.getLanguage(canonical) ? canonical : null;
    })
    .catch((error) => {
      languageLoads.delete(canonical);
      throw error;
    });

  languageLoads.set(canonical, pending);
  return pending;
}

async function ensureLanguage(hljs, manifest, name) {
  const canonical = manifest.aliases?.[name] || name;
  if (!manifest.languages?.includes(canonical)) return null;
  const group = collectDeps(manifest, [canonical]);
  // 并行独立加载整个依赖闭包，避免 javascript <-> xml 等双向依赖引发并发死锁
  await Promise.all(group.map((lang) => registerOneLanguage(hljs, lang).catch(() => null)));
  return hljs.getLanguage(canonical) ? canonical : null;
}

async function ensureCommon(hljs, manifest) {
  const group = collectDeps(manifest, manifest.common || []);
  await Promise.all(group.map((lang) => registerOneLanguage(hljs, lang).catch(() => null)));
}

export async function highlightSnippet(plan) {
  if (!plan || plan.mode === 'plain') return null;
  try {
    const manifest = await loadManifest();
    const hljs = await loadCore();
    const code = String(plan.display ?? '');
    if (plan.mode === 'auto') {
      await ensureCommon(hljs, manifest);
      const result = hljs.highlightAuto(code);
      if (!result?.language || result.relevance < 2 || !result.value) return null;
      return { html: result.value, language: result.language };
    }
    const hint = String(plan.language || '').toLowerCase();
    const canonical = manifest.aliases?.[hint];
    if (!canonical) return null;
    const ready = await ensureLanguage(hljs, manifest, canonical);
    if (!ready) return null;
    const result = hljs.highlight(code, { language: ready, ignoreIllegals: true });
    if (!result?.value) return null;
    return { html: result.value, language: ready };
  } catch {
    return null;
  }
}
