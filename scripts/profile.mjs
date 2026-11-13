#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIN_DEPTH = 2;
export const MAX_DEPTH = 6;
export const SCORE_OPTIONS = [2, 4, 6, 8, 10];

// 深度 ↔ 评分互为反函数：depth = score/2 + 1
export function scoreToDepth(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return MIN_DEPTH;
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.round(s / 2) + 1));
}

export function depthToScore(depth) {
  return Math.max(0, (Number(depth) - 1) * 2);
}

// 一张 depth 跳的图最多只能测到 depthToScore(depth) 分：再往上问不出来
export function depthCeiling(depth) {
  return depthToScore(depth);
}

export function splitKey(key) {
  return String(key || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 由细到粗：餐饮/厨师/粤菜 → [餐饮/厨师/粤菜, 餐饮/厨师, 餐饮]
export function ancestorKeys(key) {
  const parts = splitKey(key);
  const out = [];
  for (let i = parts.length; i >= 1; i--) out.push(parts.slice(0, i).join('/'));
  return out;
}

// 回写衰减：每上一级折半，越往上证据越弱
export function writeBackWeight(level) {
  return Math.pow(0.5, level);
}

// 时间衰减与层级衰减共用 0.5：越远的证据越轻。最新一条的权重必然大于
// 所有更早观测之和，所以方向由最近一次评分决定，幅度仍被历史拖住——
// 从 2 分跳到 6 分只会先推到 4 分，要连续两次才到 6 分。
export const RECENCY_DECAY = 0.5;

export function recencyWeights(observations) {
  const ordered = observations
    .map((o, i) => ({ o, at: String(o.at || ''), i }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at < b.at ? -1 : 1))
    .map(({ o }) => o);
  const last = ordered.length - 1;
  return ordered.map((o, idx) => ({
    ...o,
    weight: (Number(o.weight) || 1) * Math.pow(RECENCY_DECAY, last - idx),
  }));
}

// 估计值吸附到最近的合法档位；正好落在中点时取下限——估计本身就是下界
export function nearestOption(value) {
  return SCORE_OPTIONS.reduce(
    (best, opt) => (Math.abs(opt - value) < Math.abs(best - value) ? opt : best),
    SCORE_OPTIONS[0]
  );
}

export function profilePath(env = process.env) {
  const home = env.ATLAS_LOOP_HOME || path.join(os.homedir(), '.atlas-loop');
  return path.join(home, 'profile.json');
}

export function loadProfile(file = profilePath()) {
  if (!fs.existsSync(file)) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { version: 1, entries: {} };
    if (!parsed.entries || typeof parsed.entries !== 'object') parsed.entries = {};
    parsed.version = parsed.version || 1;
    return parsed;
  } catch {
    // 档案损坏时另存一份再重建，不静默吞掉用户数据
    const backup = `${file}.corrupt-${Date.now()}`;
    fs.renameSync(file, backup);
    return { version: 1, entries: {}, recoveredFrom: backup };
  }
}

export function saveProfile(profile, file = profilePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function observationsOf(profile, key) {
  const entry = profile.entries[key];
  if (!entry || !Array.isArray(entry.observations)) return [];
  return entry.observations;
}

/**
 * 解析某个领域的当前档位。
 * - 精确命中优先；否则回溯到最长前缀祖先，并标记 inherited。
 * - model 给定时只统计该模型的观测：同一个学习者在弱模型上测不出高分，
 *   混在一起会把均值拉低，掩盖真实能力。
 */
export function resolveEstimate(profile, key, { model = null } = {}) {
  const chain = ancestorKeys(key);
  let matched = null;
  for (const k of chain) {
    if (observationsOf(profile, k).length > 0) {
      matched = k;
      break;
    }
  }
  if (!matched) {
    return {
      key,
      matchedKey: null,
      inherited: false,
      estimate: null,
      censored: false,
      observationCount: 0,
      models: [],
      recommendedDepth: 3,
    };
  }

  const all = observationsOf(profile, matched);
  const used = model ? all.filter((o) => o.model === model) : all;
  const pool = used.length > 0 ? used : all;

  // 按时间衰减做加权平均，再吸附回合法档位。中位数在两三条观测时会锁死在
  // 低位、读不出进步；加权平均让最近的评分主导方向，历史只压住幅度。
  const weighted = recencyWeights(pool);
  const totalWeight = weighted.reduce((sum, o) => sum + o.weight, 0);
  const raw = weighted.reduce((sum, o) => sum + Number(o.score) * o.weight, 0) / totalWeight;
  const estimate = nearestOption(raw);
  // 有顶格观测且分数不低于估计值时，真实能力只会更高：估计是下界
  const censored = pool.some((o) => o.censored && Number(o.score) >= estimate);
  // 深度是分数的反函数：反解即可。分数集离散，顶格时反解必然比实测图深一跳，
  // 不能再额外 +1，否则同一份证据被抬高两次
  const recommendedDepth = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, scoreToDepth(estimate)));

  return {
    key,
    matchedKey: matched,
    inherited: matched !== key,
    estimate,
    censored,
    observationCount: pool.length,
    models: [...new Set(all.map((o) => o.model).filter(Boolean))],
    usedModel: model && used.length > 0 ? model : null,
    recommendedDepth,
  };
}

export function recordScore(
  profile,
  { key, score, depth, model, at = new Date().toISOString(), source = 'self', originKey = null }
) {
  const s = Number(score);
  if (!SCORE_OPTIONS.includes(s)) {
    throw new Error(`评分必须是 ${SCORE_OPTIONS.join(' / ')} 之一，收到 "${score}"`);
  }
  const d = Number(depth);
  if (!Number.isInteger(d) || d < MIN_DEPTH || d > MAX_DEPTH) {
    throw new Error(`depth 必须是 ${MIN_DEPTH}–${MAX_DEPTH} 的整数，收到 "${depth}"`);
  }
  const ceiling = depthCeiling(d);
  // 严格大于才算顶格：恰好测到上限说明这张图对学习者来说偏难，不构成更高能力的证据
  const censored = s > ceiling;

  const targets = ancestorKeys(key);
  if (targets.length === 0) throw new Error('domain 不能为空');

  const written = [];
  targets.forEach((target, level) => {
    if (!profile.entries[target]) profile.entries[target] = { observations: [] };
    const entry = profile.entries[target];
    if (!Array.isArray(entry.observations)) entry.observations = [];
    const obs = {
      at,
      score: s,
      depth: d,
      model: model || 'unknown',
      weight: level === 0 ? 1 : writeBackWeight(level),
      censored,
      ceiling,
    };
    if (level > 0) {
      obs.source = 'write-back';
      obs.originKey = originKey || key;
    } else if (source !== 'self') {
      obs.source = source;
    }
    entry.observations.push(obs);
    entry.updated = at;
    written.push({ key: target, level, weight: obs.weight });
  });

  return { written, censored, ceiling };
}

export function listEntries(profile) {
  return Object.entries(profile.entries)
    .map(([key, entry]) => {
      const obs = Array.isArray(entry.observations) ? entry.observations : [];
      const resolved = resolveEstimate(profile, key);
      return {
        key,
        observations: obs.length,
        estimate: resolved.estimate,
        censored: resolved.censored,
        depth: resolved.recommendedDepth,
        models: resolved.models,
        updated: entry.updated || null,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--score') args.score = argv[++i];
    else if (a === '--depth') args.depth = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  const file = args.file ? path.resolve(args.file) : profilePath();

  if (cmd === 'read') {
    if (!args.domain) {
      console.error('用法：node profile.mjs read --domain "餐饮/厨师/粤菜" [--model X] [--json]');
      process.exit(1);
    }
    const profile = loadProfile(file);
    const result = resolveEstimate(profile, args.domain, { model: args.model || null });
    if (args.json) {
      console.log(JSON.stringify({ ...result, file }, null, 2));
      return;
    }
    if (result.estimate === null) {
      console.log(`没有「${args.domain}」的记录：按 ${result.recommendedDepth} 跳起步，画完请回来打分。`);
      return;
    }
    const src = result.inherited ? `（继承自 ${result.matchedKey}）` : '';
    const bound = result.censored ? '（下界，真实能力更高）' : '';
    console.log(
      `${args.domain} 估计 ${result.estimate} 分${bound}${src}，` +
        `建议脊柱深度 ${result.recommendedDepth} 跳；共 ${result.observationCount} 条观测。`
    );
    return;
  }

  if (cmd === 'record') {
    if (!args.domain || !args.score || !args.depth) {
      console.error(
        '用法：node profile.mjs record --domain "餐饮/厨师/粤菜" --score 6 --depth 3 [--model X] [--json]'
      );
      process.exit(1);
    }
    const profile = loadProfile(file);
    const model = args.model || 'unknown';
    const { written, censored, ceiling } = recordScore(profile, {
      key: args.domain,
      score: args.score,
      depth: args.depth,
      model,
    });
    saveProfile(profile, file);
    const next = resolveEstimate(profile, args.domain, { model });
    if (args.json) {
      console.log(
        JSON.stringify({ ok: true, written, censored, ceiling, nextDepth: next.recommendedDepth, file }, null, 2)
      );
      return;
    }
    console.log(
      `已记录 ${args.domain} = ${args.score} 分（${args.depth} 跳，测到上限 ${ceiling}${
        censored ? '，顶格：这张图不够测' : ''
      }）；下张图建议 ${next.recommendedDepth} 跳`
    );
    if (written.length > 1) {
      const up = written
        .filter((w) => w.level > 0)
        .map((w) => `${w.key} 权重 ${w.weight}`)
        .join('，');
      console.log(`已按权重回写上级领域：${up}`);
    }
    return;
  }

  if (cmd === 'list') {
    const profile = loadProfile(file);
    const rows = listEntries(profile);
    if (args.json) {
      console.log(JSON.stringify({ file, entries: rows }, null, 2));
      return;
    }
    if (rows.length === 0) {
      console.log(`档案为空：${file}`);
      return;
    }
    for (const r of rows) {
      console.log(
        `${r.key}\t${r.estimate === null ? '-' : r.estimate} 分${
          r.censored ? '+' : ''
        }\t深度 ${r.depth} 跳\t${r.observations} 条\t${r.models.join(', ')}`
      );
    }
    return;
  }

  console.error('用法：node profile.mjs <read|record|list> [选项]');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(`profile.mjs：${err.message}`);
    process.exit(1);
  }
}
