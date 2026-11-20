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

function moduleUrl(id) {
  const inline = inlineSource(id);
  if (inline.trim()) {
    return URL.createObjectURL(new Blob([inline], { type: 'text/javascript' }));
  }
  if (id === 'core') return '/__hljs/core.js';
  if (id.startsWith('lang-')) return `/__hljs/lang/${id.slice(5)}.js`;
  return '';
}

function loadModule(id) {
  if (moduleLoads.has(id)) return moduleLoads.get(id);
  const pending = (async () => {
    const url = moduleUrl(id);
    if (!url) throw new Error(`缺少高亮模块 ${id}`);
    return import(url);
  })();
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

function ensureLanguage(hljs, manifest, name, stack) {
  const canonical = manifest.aliases?.[name] || name;
  if (!manifest.languages?.includes(canonical)) return Promise.resolve(null);
  if (hljs.getLanguage(canonical)) return Promise.resolve(canonical);
  // xml 与 javascript 等语法互相引用。遇到调用栈上已有的语言就先返回，避免死循环。
  if (stack?.has(canonical)) return Promise.resolve(null);
  if (languageLoads.has(canonical)) return languageLoads.get(canonical);

  let resolveLoad;
  let rejectLoad;
  const pending = new Promise((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });
  languageLoads.set(canonical, pending);
  const childStack = new Set(stack || []);
  childStack.add(canonical);

  (async () => {
    for (const dep of manifest.deps?.[canonical] || []) {
      await ensureLanguage(hljs, manifest, dep, childStack);
    }
    if (!hljs.getLanguage(canonical)) {
      const mod = await loadModule(`lang-${canonical}`);
      const factory = typeof mod.default === 'function' ? mod.default : mod.default?.default;
      if (typeof factory !== 'function') {
        resolveLoad(null);
        return;
      }
      hljs.registerLanguage(canonical, factory);
    }
    resolveLoad(hljs.getLanguage(canonical) ? canonical : null);
  })().catch((error) => {
    languageLoads.delete(canonical);
    rejectLoad(error);
  });

  return pending;
}

async function ensureCommon(hljs, manifest) {
  const names = [];
  const seen = new Set();
  for (const name of manifest.common || []) {
    for (const dep of manifest.deps?.[name] || []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        names.push(dep);
      }
    }
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  await Promise.all(names.map((name) => loadModule(`lang-${name}`).catch(() => null)));
  for (const name of names) {
    if (!hljs.getLanguage(name)) await ensureLanguage(hljs, manifest, name);
  }
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
