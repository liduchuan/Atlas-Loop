#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.1.0';
  } catch (_) {
    return '0.1.0';
  }
}

function printHelp() {
  console.log(`@liduchuan/atlas-loop v${readVersion()}

Usage:
  npx @liduchuan/atlas-loop install [--dir <skills-dir>]
  npx @liduchuan/atlas-loop build --data <graph-data.json> [--out <output.html>]
  npx @liduchuan/atlas-loop verify --html <output.html>

Commands:
  install   Copy the atlas-loop skill into an Agent skills directory (default: ~/.agents/skills/atlas-loop)
  build     Validate AtlasGraphData JSON and synthesize a standalone offline HTML learning map
  verify    Run headless Playwright verification against a generated HTML learning map
`);
}

function copySkillFiles(destDir) {
  const items = ['SKILL.md', 'assets', 'references', 'scripts'];
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of items) {
    const src = path.join(PKG_ROOT, name);
    const dst = path.join(destDir, name);
    if (!fs.existsSync(src)) continue;
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
  }
}

function resolveInstallDir(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      const given = path.resolve(args[++i]);
      return path.basename(given) === 'atlas-loop' ? given : path.join(given, 'atlas-loop');
    }
  }
  return path.join(os.homedir(), '.agents', 'skills', 'atlas-loop');
}

function runScript(scriptName, forwardArgs) {
  const scriptPath = path.join(PKG_ROOT, 'scripts', scriptName);
  const res = spawnSync(process.execPath, [scriptPath, ...forwardArgs], { stdio: 'inherit' });
  process.exit(res.status ?? 1);
}

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
  printHelp();
  process.exit(0);
}

if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
  console.log(readVersion());
  process.exit(0);
}

if (cmd === 'install') {
  const dest = resolveInstallDir(argv.slice(1));
  copySkillFiles(dest);
  console.log(`Installed atlas-loop skill to: ${dest}`);
  process.exit(0);
}

if (cmd === 'build') {
  runScript('build_atlas.mjs', argv.slice(1));
}

if (cmd === 'verify') {
  runScript('verify_atlas.mjs', argv.slice(1));
}

console.error(`Unknown command: ${cmd}\n`);
printHelp();
process.exit(1);
