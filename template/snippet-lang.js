// 片段语言判断。纯函数，查看器与 build_atlas 共用，避免首屏加载语法包。

export const PLAIN_LANGUAGES = new Set(['text', 'plain', 'plaintext', 'txt', 'none', 'raw']);

const LANGUAGE_GUESSES = [
  ['dockerfile', [
    [/^\s*FROM\s+\S+/m, 2],
    [/^\s*(RUN|CMD|ENTRYPOINT|COPY|WORKDIR)\s+/m, 1],
  ]],
  ['powershell', [
    [/\$PSVersionTable\b/, 2],
    [/\bWrite-Host\b/, 2],
    [/^\s*param\s*\(/m, 2],
  ]],
  ['php', [
    [/<\?php\b/, 2],
    [/\$this->/, 2],
  ]],
  ['rust', [
    [/\bfn\s+\w+\s*\(/, 2],
    [/\blet\s+mut\b/, 2],
    [/\bprintln!/, 2],
    [/\bimpl\s+/, 1],
  ]],
  ['go', [
    [/^\s*func\s+(\([^)]+\)\s*)?\w+\s*\(/m, 2],
    [/\bpackage\s+[a-z]\w*/, 2],
    [/\bfmt\./, 1],
  ]],
  ['kotlin', [
    [/^\s*fun\s+\w+/m, 2],
    [/\bdata\s+class\b/, 2],
  ]],
  ['swift', [
    [/\bguard\s+let\b/, 2],
    [/\bimport\s+(Foundation|SwiftUI|UIKit)\b/, 2],
  ]],
  ['dart', [
    [/^\s*(void|Future)\s+main\s*\(/m, 2],
    [/^\s*import\s+'package:/m, 2],
  ]],
  ['scala', [
    [/^\s*object\s+\w+\s*(extends|\{)/m, 2],
    [/\bdef\s+\w+[^(]*\([^)]*\)\s*:/, 2],
  ]],
  ['haskell', [
    [/^\s*module\s+[A-Z]\w*/m, 2],
    [/^\s*[a-z]\w*\s*::\s*[A-Z]/m, 2],
  ]],
  ['elixir', [
    [/^\s*defmodule\s+/, 2],
    [/^\s*def\s+\w+.*\bdo\b/m, 2],
  ]],
  ['clojure', [
    [/^\s*\(ns\s+/, 2],
    [/^\s*\(defn\s+/, 2],
  ]],
  ['python', [
    [/^\s*def\s+\w+\s*\(/m, 2],
    [/^\s*elif\s+/, 2],
    [/^\s*from\s+\S+\s+import\s+/m, 2],
    [/__name__\s*==\s*['"]__main__['"]/, 2],
  ]],
  ['ruby', [
    [/^\s*class\s+[A-Z]\w*\s*<\s*[A-Z]/m, 2],
    [/^\s*def\s+\w+[\s?!]/m, 1],
    [/^\s*end\s*$/m, 1],
  ]],
  ['java', [
    [/\bpublic\s+class\b/, 2],
    [/\bSystem\.out\.println\b/, 2],
    [/\bimport\s+java\./, 2],
  ]],
  ['csharp', [
    [/\bnamespace\s+[\w.]+/, 2],
    [/\bConsole\.Write(Line)?\b/, 2],
    [/\busing\s+System\b/, 2],
  ]],
  ['cpp', [
    [/\bstd::\w+/, 2],
    [/\btemplate\s*</, 2],
    [/#include\s*<[\w.]+>/, 1],
  ]],
  ['c', [
    [/\bprintf\s*\(/, 2],
    [/#include\s*<[\w./]+>/, 1],
  ]],
  ['sql', [
    [/\bSELECT\b[\s\S]{0,240}\bFROM\b/i, 2],
    [/\bINSERT\s+INTO\b/i, 2],
    [/\bCREATE\s+TABLE\b/i, 2],
  ]],
  ['graphql', [
    [/^\s*(type|query|mutation|subscription)\s+\w+/m, 2],
  ]],
  ['scss', [
    [/\$[\w-]+\s*:/, 2],
    [/@mixin\s+/, 2],
  ]],
  ['css', [
    [/^\s*[.#]?[\w-]+\s*\{[^}]*:[^}]+;/m, 2],
  ]],
  ['html', [
    [/<!DOCTYPE\s+html>/i, 2],
    [/^\s*<(html|div|span|section|button|script)\b/im, 2],
  ]],
  ['xml', [
    [/<\?xml\b/, 2],
    [/<\/[\w:.-]+>/, 1],
  ]],
  ['json', [
    [/^\s*\{[\s\n]*"[^"]+"\s*:/, 2],
    [/^\s*\[[\s\n]*[\[{"0-9-]/, 2],
  ]],
  ['yaml', [
    [/^\s*---\s*$/m, 2],
    [/^[\w.-]+:\s+\S+.*\n[\w.-]+:\s+\S+/m, 2],
  ]],
  ['bash', [
    [/^#!.*\b(bash|sh|zsh)\b/m, 2],
    [/^\s*(echo|export|sudo|cd|npm|pnpm|yarn|bun|git|curl)\s+\S+/m, 2],
  ]],
  ['typescript', [
    [/:\s*(string|number|boolean|any|void|never)\b/, 2],
    [/\binterface\s+[A-Z]\w*/, 2],
    [/\btype\s+[A-Z]\w*\s*=/, 2],
  ]],
  ['javascript', [
    [/^\s*(import|export)\s+/m, 2],
    [/\bfunction\s+\w+\s*\(/, 2],
    [/^\s*(const|let|var)\s+\w+\s*=/m, 2],
    [/=>\s*[{(]/, 1],
  ]],
  ['lua', [
    [/^\s*local\s+function\b/m, 2],
    [/^\s*function\s+\w+\s*\(/m, 1],
  ]],
  ['protobuf', [
    [/^\s*syntax\s*=\s*["']proto/m, 2],
    [/^\s*message\s+\w+\s*\{/m, 2],
  ]],
  ['cmake', [
    [/^\s*cmake_minimum_required\s*\(/m, 2],
    [/^\s*(add_executable|add_library|project)\s*\(/m, 2],
  ]],
  ['nginx', [
    [/^\s*(server|location|upstream)\s*\{/m, 2],
  ]],
  ['makefile', [
    [/^[A-Za-z0-9_.-]+:\s*$\n^\t\S/m, 2],
  ]],
  ['diff', [
    [/^@@\s+-\d+/m, 2],
    [/^\+\+\+\s+/m, 1],
  ]],
  ['ini', [
    [/^\[[^\]]+\]\s*$/m, 1],
    [/^\s*[\w.-]+\s*=\s*\S+/m, 1],
  ]],
];

export function normalizeLanguageHint(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase().replace(/^\./, '');
}

export function extractFence(content) {
  const match = String(content || '').match(/^```([\w#+.-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/);
  if (!match) return null;
  return { language: normalizeLanguageHint(match[1]), code: match[2] };
}

export function guessLanguage(content) {
  const text = String(content || '');
  if (!text.trim()) return null;
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const [language, patterns] of LANGUAGE_GUESSES) {
    let score = 0;
    for (const [pattern, weight] of patterns) {
      if (pattern.test(text)) score += weight;
    }
    if (score > bestScore) {
      best = language;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  if (!best || tie || bestScore < 2) return null;
  return best;
}

export function looksLikeCode(content) {
  const text = String(content || '').trim();
  if (!text) return false;
  if (extractFence(text)) return true;
  return Boolean(guessLanguage(text));
}

export function resolveSnippetPlan(content, languageHint) {
  const raw = String(content ?? '');
  const hint = normalizeLanguageHint(languageHint);
  if (!raw.trim() || PLAIN_LANGUAGES.has(hint)) {
    return { mode: 'plain', display: raw };
  }

  const fence = extractFence(raw);
  const body = fence ? fence.code : raw;
  const fencedLang = fence ? fence.language : '';
  const lang = hint || fencedLang;
  const display = fence && (lang || looksLikeCode(body)) ? body : raw;

  if (PLAIN_LANGUAGES.has(lang)) return { mode: 'plain', display: raw };
  if (lang && lang !== 'auto') return { mode: 'language', language: lang, display };

  if (!looksLikeCode(body)) return { mode: 'plain', display: raw };
  const guessed = guessLanguage(body);
  if (guessed) return { mode: 'language', language: guessed, display };
  return { mode: 'auto', display };
}

export function walkSnippetAnchors(data, visit) {
  const walk = (nodes) => {
    for (const node of nodes || []) {
      for (const anchor of node?.anchors || []) {
        if (anchor && anchor.kind === 'snippet') visit(anchor, node);
      }
      if (node?.detailGraph) walk(node.detailGraph.nodes);
    }
  };
  walk(data?.nodes);
}
