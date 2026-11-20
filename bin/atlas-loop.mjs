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
    return pkg.version || '0.1.12';
  } catch (_) {
    return '0.1.12';
  }
}

function printHelp() {
  console.log(`Atlas Loop (@liduchuan/atlas-loop v${readVersion()})

用法：
  npx @liduchuan/atlas-loop install [--dir <skills-dir>]
  npx @liduchuan/atlas-loop dev [--port 5179] [--data <graph-data.json>]
  npx @liduchuan/atlas-loop build --data <graph-data.json> [--out <output.html>]
  npx @liduchuan/atlas-loop verify --html <output.html>
  npx @liduchuan/atlas-loop link --parent <parent.html> --child <child.html> (--node <id|title> | --stream <id|title>)
  npx @liduchuan/atlas-loop pack --entry <root.html> [--out <bundle.zip>]
  npx @liduchuan/atlas-loop profile <read|record|catalog|dashboard|list> [选项]
  npx @liduchuan/atlas-loop dashboard [--out <dashboard.html>] [--file <profile.json>]

命令：
  install     将 atlas-loop skill 复制到 Agent skills 目录（默认：~/.agents/skills/atlas-loop）
  dev         启动本地实时重载运行时，用于调试模板与样式
  build       校验 AtlasGraphData JSON 并合成独立的离线 HTML 学习地图
  verify      对生成的 HTML 学习地图运行无头 Playwright 验证
  link        将已生成的 L1+ 子图链接回写到父图 HTML 并重新构建父图
  pack        将父图与递归子图从本地磁盘离线打包为可分享的 ZIP
  profile     读写学习者成长档案与知识版图（read / record / catalog / dashboard / list）
  dashboard   生成离线单文件「个人成长总览」HTML 页面
`);
}

function copySkillFiles(destDir) {
  const items = ['SKILL.md', 'package.json', 'assets', 'references', 'scripts', 'template'];
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

function runNodeFile(relFilePath, forwardArgs) {
  const fullPath = path.join(PKG_ROOT, relFilePath);
  const res = spawnSync(process.execPath, [fullPath, ...forwardArgs], { stdio: 'inherit' });
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
  console.log(`已将 Atlas Loop skill 安装到：${dest}`);
  process.exit(0);
}

if (cmd === 'dev') {
  runNodeFile(path.join('template', 'dev-server.mjs'), argv.slice(1));
}

if (cmd === 'build') {
  runNodeFile(path.join('scripts', 'build_atlas.mjs'), argv.slice(1));
}

if (cmd === 'verify') {
  runNodeFile(path.join('scripts', 'verify_atlas.mjs'), argv.slice(1));
}

if (cmd === 'link') {
  runNodeFile(path.join('scripts', 'link_child.mjs'), argv.slice(1));
}

if (cmd === 'pack') {
  runNodeFile(path.join('scripts', 'pack_atlas.mjs'), argv.slice(1));
}

if (cmd === 'profile') {
  runNodeFile(path.join('scripts', 'profile.mjs'), argv.slice(1));
}

if (cmd === 'dashboard') {
  runNodeFile(path.join('scripts', 'profile.mjs'), ['dashboard', ...argv.slice(1)]);
}

console.error(`未知命令：${cmd}\n`);
printHelp();
process.exit(1);
