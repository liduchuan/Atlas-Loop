#!/usr/bin/env node
// 把 highlight.js 拆成「核心 + 每种语言一个模块」。
// 产物写入 assets/hljs，供开发服务器按需下发，也供 build_atlas 按图里用到的语言内联进单文件。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const HLJS_ROOT = path.join(REPO_ROOT, 'node_modules', 'highlight.js');
const OUT_DIR = path.join(REPO_ROOT, 'assets', 'hljs');

const FRIENDLY_ALIASES = {
  html: 'xml',
  htm: 'xml',
  xhtml: 'xml',
  svg: 'xml',
  vue: 'xml',
  svelte: 'xml',
  astro: 'xml',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  jsonc: 'json',
  json5: 'json',
  toml: 'ini',
  env: 'ini',
  dotenv: 'ini',
  zsh: 'bash',
  fish: 'bash',
  shellscript: 'bash',
  golang: 'go',
  rs: 'rust',
  py: 'python',
  py3: 'python',
  python3: 'python',
  rb: 'ruby',
  docker: 'dockerfile',
  proto: 'protobuf',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  ps1: 'powershell',
  kt: 'kotlin',
  kts: 'kotlin',
  hs: 'haskell',
  ex: 'elixir',
  exs: 'elixir',
  clj: 'clojure',
  cljs: 'clojure',
  fs: 'fsharp',
  fsx: 'fsharp',
  ml: 'ocaml',
  makefile: 'makefile',
  mk: 'makefile',
};

function listLanguages() {
  const dir = path.join(HLJS_ROOT, 'lib', 'languages');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.js.js'))
    .map((file) => file.slice(0, -3))
    .sort();
}

function registrationOrder(names) {
  const indexSrc = fs.readFileSync(path.join(HLJS_ROOT, 'lib', 'index.js'), 'utf8');
  const seen = new Set();
  const order = [];
  for (const match of indexSrc.matchAll(/registerLanguage\('([^']+)'/g)) {
    const name = match[1];
    if (!names.has(name) || seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  for (const name of [...names].sort()) {
    if (!seen.has(name)) order.push(name);
  }
  return order;
}

function commonLanguages(names) {
  const src = fs.readFileSync(path.join(HLJS_ROOT, 'lib', 'common.js'), 'utf8');
  const list = [];
  for (const match of src.matchAll(/registerLanguage\('([^']+)'/g)) {
    if (names.has(match[1])) list.push(match[1]);
  }
  return list;
}

function extractDeps(source, self, names) {
  const deps = new Set();
  const re = /subLanguage:\s*(?:'([^']+)'|"([^"]+)"|\[([^\]]*)\])/g;
  let match;
  while ((match = re.exec(source))) {
    const found = [];
    if (match[1]) found.push(match[1]);
    else if (match[2]) found.push(match[2]);
    else if (match[3]) {
      for (const part of match[3].matchAll(/'([^']+)'|"([^"]+)"/g)) found.push(part[1] || part[2]);
    }
    for (const name of found) {
      if (name && name !== self && names.has(name)) deps.add(name);
    }
  }
  return [...deps].sort();
}

function collectAliases(names, order) {
  const hljs = require('highlight.js/lib/core');
  const aliases = {};
  for (const name of order) {
    aliases[name] = name;
    try {
      const define = require(path.join(HLJS_ROOT, 'lib', 'languages', `${name}.js`));
      const def = define(hljs);
      for (const alias of def?.aliases || []) {
        const key = String(alias).trim().toLowerCase();
        if (key) aliases[key] = name;
      }
    } catch {
      // 语法函数执行失败时仍保留规范名，运行时再按纯文本回退。
    }
  }
  for (const name of names) aliases[name] = name;
  for (const [alias, target] of Object.entries(FRIENDLY_ALIASES)) {
    if (!aliases[alias] && names.has(target)) aliases[alias] = target;
  }
  return Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)));
}

async function bundle(esbuild, entryPoints) {
  const result = await esbuild.build({
    entryPoints,
    bundle: true,
    minify: true,
    format: 'esm',
    splitting: false,
    write: false,
    outdir: path.join(REPO_ROOT, 'node_modules', '.cache', 'hljs-out'),
    target: ['es2020'],
    platform: 'browser',
    absWorkingDir: REPO_ROOT,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const files = new Map();
  for (const file of result.outputFiles) {
    files.set(path.basename(file.path), file.text.replace(/<\/script/gi, '<\\/script'));
  }
  return files;
}

async function verifyBundle(coreSource, javascriptSource) {
  const tmp = path.join(REPO_ROOT, 'node_modules', '.cache', 'hljs-verify');
  fs.mkdirSync(tmp, { recursive: true });
  const corePath = path.join(tmp, 'core.js');
  const langPath = path.join(tmp, 'javascript.js');
  fs.writeFileSync(corePath, coreSource);
  fs.writeFileSync(langPath, javascriptSource);
  const core = await import(pathToFileURL(corePath).href);
  const lang = await import(pathToFileURL(langPath).href);
  const hljs = core.default?.highlight ? core.default : core.default?.default;
  const factory = typeof lang.default === 'function' ? lang.default : lang.default?.default;
  if (!hljs || typeof factory !== 'function') {
    throw new Error('highlight.js 打包结果无法在运行时注册语言');
  }
  hljs.registerLanguage('javascript', factory);
  const html = hljs.highlight('const answer = 42;', { language: 'javascript' }).value;
  if (!html.includes('hljs-keyword')) {
    throw new Error(`highlight.js 自检未生成高亮标记：${html}`);
  }
}

export async function buildHljsAssets() {
  if (!fs.existsSync(HLJS_ROOT)) {
    throw new Error('缺少 highlight.js。请在仓库里安装依赖后再构建查看器。');
  }
  const esbuildPath = path.join(REPO_ROOT, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const names = new Set(listLanguages());
  const order = registrationOrder(names);
  const entryDir = path.join(REPO_ROOT, 'node_modules', '.cache', 'hljs-entries');
  fs.rmSync(entryDir, { recursive: true, force: true });
  fs.mkdirSync(entryDir, { recursive: true });

  const coreEntry = path.join(entryDir, 'core.js');
  fs.writeFileSync(coreEntry, "import hljs from 'highlight.js/lib/core';\nexport default hljs;\n");
  const langEntries = {};
  for (const name of names) {
    const entry = path.join(entryDir, `${name}.js`);
    fs.writeFileSync(entry, `import lang from 'highlight.js/lib/languages/${name}';\nexport default lang;\n`);
    langEntries[name] = entry;
  }

  const [coreFiles, langFiles] = await Promise.all([
    bundle(esbuild, { core: coreEntry }),
    bundle(esbuild, langEntries),
  ]);
  const core = coreFiles.get('core.js');
  if (!core) throw new Error('未生成 highlight.js 核心包');

  const langs = {};
  for (const name of [...names].sort()) {
    const source = langFiles.get(`${name}.js`);
    if (!source) throw new Error(`未生成语言包：${name}`);
    langs[name] = source;
  }

  const deps = {};
  const langDir = path.join(HLJS_ROOT, 'lib', 'languages');
  for (const name of names) {
    const source = fs.readFileSync(path.join(langDir, `${name}.js`), 'utf8');
    const list = extractDeps(source, name, names);
    if (list.length > 0) deps[name] = list;
  }

  const manifest = {
    languages: [...names].sort(),
    common: commonLanguages(names),
    aliases: collectAliases(names, order),
    deps,
  };

  await verifyBundle(core, langs.javascript);

  const langOut = path.join(OUT_DIR, 'lang');
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(langOut, { recursive: true });
  fs.copyFileSync(path.join(HLJS_ROOT, 'LICENSE'), path.join(OUT_DIR, 'LICENSE'));
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(OUT_DIR, 'core.js'), core);
  for (const [name, source] of Object.entries(langs)) {
    fs.writeFileSync(path.join(langOut, `${name}.js`), source);
  }
  fs.rmSync(entryDir, { recursive: true, force: true });

  return { manifest, core, langs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildHljsAssets()
    .then((result) => {
      const bytes = result.core.length + Object.values(result.langs).reduce((sum, source) => sum + source.length, 0);
      console.log(
        `已生成 assets/hljs（${result.manifest.languages.length} 种语言，${(bytes / 1024).toFixed(1)} KB）`
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
