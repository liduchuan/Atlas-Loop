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

// 一张 depth 阶的图最多只能测到 depthToScore(depth) 分：再往上问不出来
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
  if (!fs.existsSync(file)) return { version: 2, entries: {}, atlases: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { version: 2, entries: {}, atlases: [] };
    if (!parsed.entries || typeof parsed.entries !== 'object') parsed.entries = {};
    if (!Array.isArray(parsed.atlases)) parsed.atlases = [];
    parsed.version = Math.max(2, Number(parsed.version) || 2);
    return parsed;
  } catch {
    // 档案损坏时另存一份再重建，不静默吞掉用户数据
    const backup = `${file}.corrupt-${Date.now()}`;
    fs.renameSync(file, backup);
    return { version: 2, entries: {}, atlases: [], recoveredFrom: backup };
  }
}

export function saveProfile(profile, file = profilePath()) {
  const normalized = {
    ...profile,
    version: Math.max(2, Number(profile?.version) || 2),
    entries: profile?.entries && typeof profile.entries === 'object' ? profile.entries : {},
    atlases: Array.isArray(profile?.atlases) ? profile.atlases : [],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function observationsOf(profile, key) {
  const entry = profile.entries?.[key];
  if (!entry || !Array.isArray(entry.observations)) return [];
  return entry.observations;
}

function domainRelated(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function findRelatedAtlases(profile, key, matchedKey = null) {
  const atlases = Array.isArray(profile.atlases) ? profile.atlases : [];
  return atlases
    .map((a) => {
      let tier = 0;
      if (a.domain === key) tier = 3;
      else if (domainRelated(a.domain, key)) tier = 2;
      else if (matchedKey && domainRelated(a.domain, matchedKey)) tier = 1;
      return { a, tier };
    })
    .filter((x) => x.tier > 0)
    .sort((x, y) => {
      if (y.tier !== x.tier) return y.tier - x.tier;
      const ta = String(x.a.updatedAt || x.a.createdAt || '');
      const tb = String(y.a.updatedAt || y.a.createdAt || '');
      return tb.localeCompare(ta);
    })
    .slice(0, 8)
    .map((x) => x.a);
}

function extractKnownConcepts(relatedAtlases) {
  const seen = new Set();
  const out = [];
  for (const a of relatedAtlases) {
    for (const c of a.concepts || []) {
      const name = String(c || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
      if (out.length >= 20) return out;
    }
  }
  return out;
}

export function findSimilarKeys(profile, key, limit = 8) {
  const allKeys = new Set(Object.keys(profile.entries || {}));
  for (const a of profile.atlases || []) {
    if (a?.domain) allKeys.add(a.domain);
  }
  allKeys.delete(key);
  if (allKeys.size === 0) return [];

  const targetParts = splitKey(key).map((p) => p.toLowerCase());
  const targetFull = String(key || '').toLowerCase();

  return [...allKeys]
    .map((cand) => {
      const candParts = splitKey(cand).map((p) => p.toLowerCase());
      const candFull = cand.toLowerCase();
      let score = 0;
      if (candParts[0] && targetParts[0] && candParts[0] === targetParts[0]) score += 3;
      for (const tp of targetParts) {
        if (candParts.includes(tp)) score += 2;
        else if (candFull.includes(tp) || targetFull.includes(candParts[candParts.length - 1] || '')) score += 1;
      }
      return { cand, score };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.cand.localeCompare(b.cand)))
    .slice(0, limit)
    .map((x) => x.cand);
}

/**
 * 解析某个领域的当前档位与已学知识版图。
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

  const relatedAtlases = findRelatedAtlases(profile, key, matched);
  const knownConcepts = extractKnownConcepts(relatedAtlases);

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
      relatedAtlases,
      knownConcepts,
      similarKeys: findSimilarKeys(profile, key),
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
  // 深度是分数的反函数：反解即可。分数集离散，顶格时反解必然比实测图深一阶，
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
    relatedAtlases,
    knownConcepts,
    similarKeys: [],
  };
}

export function recordScore(
  profile,
  { key, score, depth, model, at = new Date().toISOString(), source = 'self', originKey = null, htmlPath = null }
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

  if (htmlPath && Array.isArray(profile.atlases)) {
    const resolved = path.resolve(htmlPath);
    for (const a of profile.atlases) {
      if (a.htmlPath && path.resolve(a.htmlPath) === resolved) {
        a.lastScore = s;
        a.updatedAt = at;
      }
    }
  }

  return { written, censored, ceiling };
}

function parseAtlasJsonFromHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script\b[^>]*\bid=["']atlas-data-json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match || !match[1] || match[1].includes('__ATLAS_DATA_JSON__')) {
    throw new Error(`未在 ${htmlPath} 中找到有效的 #atlas-data-json`);
  }
  return JSON.parse(match[1]);
}

export function catalogAtlas(
  profile,
  { domain, htmlPath, data = null, at = new Date().toISOString() } = {}
) {
  if (splitKey(domain).length === 0) throw new Error('domain 不能为空');
  if (!htmlPath && !data) throw new Error('必须提供 --html <atlas.html> 或图数据');

  const resolvedHtml = htmlPath ? path.resolve(htmlPath) : null;
  if (resolvedHtml && !data && (!fs.existsSync(resolvedHtml) || !fs.statSync(resolvedHtml).isFile())) {
    throw new Error(`地图文件不存在：${resolvedHtml}`);
  }
  const graph = data || parseAtlasJsonFromHtml(resolvedHtml);
  const meta = graph.meta || {};
  const title = String(meta.title || '').trim();
  if (!title) throw new Error('地图数据缺少 meta.title');

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const streams = Array.isArray(graph.streams) ? graph.streams : [];
  const concepts = [];
  const conceptSeen = new Set();
  const unexploredTargets = [];
  const targetSeen = new Set();
  let unverifiedNodes = 0;

  for (const n of nodes) {
    if (n.title && !conceptSeen.has(n.title)) {
      conceptSeen.add(n.title);
      concepts.push(n.title);
    }
    if (n.confidence === 'unverified') unverifiedNodes++;
    if (n.deepDive?.subAtlasPrompt && !n.deepDive?.childAtlasUrl && n.title && !targetSeen.has(n.title)) {
      targetSeen.add(n.title);
      unexploredTargets.push(n.title);
    }
    for (const sn of n.detailGraph?.nodes || []) {
      if (sn.confidence === 'unverified') unverifiedNodes++;
    }
  }
  for (const st of streams) {
    if (st.deepDive?.subAtlasPrompt && !st.deepDive?.childAtlasUrl && st.title && !targetSeen.has(st.title)) {
      targetSeen.add(st.title);
      unexploredTargets.push(st.title);
    }
  }

  const unverifiedNotesCount = Array.isArray(meta.unverifiedNotes) ? meta.unverifiedNotes.length : 0;
  const unverifiedCount = unverifiedNodes > 0 ? unverifiedNodes : unverifiedNotesCount;

  if (!Array.isArray(profile.atlases)) profile.atlases = [];
  const existingIdx = profile.atlases.findIndex((a) => {
    if (resolvedHtml && a.htmlPath && path.resolve(a.htmlPath) === resolvedHtml) return true;
    return a.domain === domain && a.title === title;
  });

  const prev = existingIdx >= 0 ? profile.atlases[existingIdx] : null;
  const entry = {
    id: prev?.id || `atlas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    domain,
    title,
    subjectTag: meta.subjectTag || null,
    level: Number(meta.level || 0),
    depth: Number(meta.depth || 3),
    audience: meta.audience || null,
    model: meta.generatedByModel || 'unknown',
    htmlPath: resolvedHtml,
    parentMapHtml: meta.parentMapHtml || null,
    concepts,
    unexploredTargets,
    unverifiedCount,
    createdAt: prev?.createdAt || at,
    updatedAt: at,
    ...(prev?.lastScore !== undefined ? { lastScore: prev.lastScore } : {}),
  };

  if (existingIdx >= 0) profile.atlases[existingIdx] = entry;
  else profile.atlases.push(entry);

  return entry;
}

export function listEntries(profile) {
  return Object.entries(profile.entries || {})
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderDashboardHtml(profile, { profileFile = '' } = {}) {
  const entries = profile?.entries && typeof profile.entries === 'object' ? profile.entries : {};
  const atlases = Array.isArray(profile?.atlases) ? profile.atlases : [];

  const allDomains = new Set(Object.keys(entries));
  for (const a of atlases) {
    if (a?.domain) allDomains.add(a.domain);
  }

  let directReviewCount = 0;
  let totalObsFallback = 0;
  const domainSeries = [];
  for (const [key, entry] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const obs = Array.isArray(entry.observations) ? entry.observations : [];
    totalObsFallback += obs.length;
    const directObs = obs.filter((o) => o.source !== 'write-back');
    directReviewCount += directObs.length;
    const seriesObs = directObs.length > 0 ? directObs : obs;
    const est = resolveEstimate(profile, key);
    domainSeries.push({
      key,
      estimate: est.estimate,
      censored: est.censored,
      recommendedDepth: est.recommendedDepth,
      models: est.models,
      observationCount: obs.length,
      directCount: directObs.length,
      hasDirect: directObs.length > 0,
      points: seriesObs.map((o, idx) => ({
        idx: idx + 1,
        at: String(o.at || '').slice(0, 10),
        score: Number(o.score),
        depth: scoreToDepth(o.score),
        mapDepth: Number(o.depth || scoreToDepth(o.score)),
        model: o.model || 'unknown',
        censored: Boolean(o.censored),
        source: o.source || 'self',
      })),
    });
  }

  // 把直接评分过的具体领域排在前面，祖先回写节点排在后面
  domainSeries.sort((a, b) => {
    if (a.hasDirect !== b.hasDirect) return a.hasDirect ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  const maxDepthAchieved = Math.max(
    0,
    ...domainSeries.map((d) => d.recommendedDepth || 0),
    ...atlases.map((a) => Number(a.depth || 0))
  );

  const shelfItems = [...atlases]
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .map((a) => ({
      ...a,
      fileHref: a.htmlPath ? pathToFileURL(path.resolve(a.htmlPath)).href : null,
    }));

  const nextLoops = [];
  for (const a of shelfItems) {
    for (const target of a.unexploredTargets || []) {
      nextLoops.push({
        type: 'sub-atlas',
        title: target,
        atlasTitle: a.title,
        domain: a.domain,
        level: Number(a.level || 0) + 1,
        prompt: `使用 Atlas Loop 递归生成 L${Number(a.level || 0) + 1} 专题子地图，目标：「${target}」，父级地图 ${a.htmlPath ? path.basename(a.htmlPath) : a.title}`,
      });
    }
    if (Number(a.unverifiedCount) > 0) {
      nextLoops.push({
        type: 'unverified',
        title: `${a.title}（${a.unverifiedCount} 处待核实边界）`,
        atlasTitle: a.title,
        domain: a.domain,
        level: Number(a.level || 0),
        prompt: `核实并深化学习地图「${a.title}」中标记为待确认的机制与边界，并重新验证构建。`,
      });
    }
  }

  const payload = {
    stats: {
      domainCount: allDomains.size,
      atlasCount: atlases.length,
      reviewCount: directReviewCount || totalObsFallback,
      maxDepth: maxDepthAchieved,
    },
    domains: domainSeries,
    atlases: shelfItems,
    nextLoops,
    allDomainKeys: [...allDomains].sort(),
  };
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#fafafa" />
  <title>Atlas Loop · 个人成长总览</title>
  <style>
    :root {
      --bg-canvas: #fafafa;
      --bg-surface: #ffffff;
      --bg-subtle: #f4f4f5;
      --bg-active: #18181b;
      --text-primary: #09090b;
      --text-secondary: #52525b;
      --text-muted: #71717a;
      --text-inverse: #fafafa;
      --border-subtle: #e4e4e7;
      --border-strong: #d4d4d8;
      --accent-ok: #15803d;
      --accent-warn: #b45309;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 10px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg-canvas);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .dash-header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      padding: 18px 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }
    .dash-title { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
    .dash-sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
    .dash-meta-pill {
      font-size: 11.5px;
      color: var(--text-secondary);
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      font-variant-numeric: tabular-nums;
    }
    .dash-main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 22px 24px 48px;
      display: flex;
      flex-direction: column;
      gap: 26px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }
    .stat-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 14px 16px;
    }
    .stat-label { font-size: 11.5px; color: var(--text-muted); }
    .stat-value { font-size: 24px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .section-title { margin: 0; font-size: 14.5px; font-weight: 600; }
    .section-note { font-size: 11.5px; color: var(--text-muted); }
    .domain-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .domain-name { font-weight: 600; font-size: 13.5px; word-break: break-word; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .pill-dark {
      background: var(--bg-active);
      border-color: var(--bg-active);
      color: var(--text-inverse);
    }
    .pill-warn {
      background: #fffbeb;
      border-color: #fde68a;
      color: var(--accent-warn);
    }
    .chart-wrap {
      background: var(--bg-canvas);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 8px 10px 4px;
    }
    .chart-svg { width: 100%; height: 92px; display: block; overflow: visible; }
    .filter-bar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .input, .select {
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-size: 12px;
      font-family: inherit;
    }
    .input { min-width: 220px; }
    .shelf-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
      gap: 12px;
    }
    .concept-list { display: flex; flex-wrap: wrap; gap: 5px; }
    .concept-chip {
      font-size: 11px;
      padding: 1px 6px;
      background: var(--bg-canvas);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      color: var(--text-secondary);
    }
    .card-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid var(--border-subtle);
      font-size: 11.5px;
      color: var(--text-muted);
    }
    .btn-link, .btn-copy {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      font-size: 11.5px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      border: 1px solid var(--bg-active);
      background: var(--bg-active);
      color: var(--text-inverse);
      text-decoration: none;
      cursor: pointer;
    }
    .btn-copy.copied {
      background: var(--accent-ok);
      border-color: var(--accent-ok);
    }
    .loop-list { display: flex; flex-direction: column; gap: 8px; }
    .loop-item {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .empty-box {
      background: var(--bg-surface);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      padding: 24px;
      color: var(--text-secondary);
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="dash-header">
    <div>
      <h1 class="dash-title">Atlas Loop · 个人成长总览</h1>
      <p class="dash-sub">随学习者进化的认知阶梯轨迹、知识版图与待探索线索队列（纯离线单文件）</p>
    </div>
    ${profileFile ? `<div class="dash-meta-pill">档案源：${escapeHtml(profileFile)}</div>` : ''}
  </header>

  <main class="dash-main">
    <section class="stats-grid" id="stats-grid" data-testid="dashboard-stats"></section>

    <section>
      <div class="section-head">
        <h2 class="section-title">领域认知阶梯轨迹</h2>
        <span class="section-note">纵轴为认知深度（2–6 阶），实点为各次评估</span>
      </div>
      <div class="domain-grid" id="domain-grid" data-testid="domain-growth-list"></div>
    </section>

    <section>
      <div class="section-head">
        <h2 class="section-title">个人知识地图书架</h2>
        <div class="filter-bar">
          <select id="shelf-domain-filter" data-testid="shelf-domain-filter" class="select" aria-label="按领域筛选"></select>
          <input id="shelf-search" data-testid="shelf-search" class="input" type="search" placeholder="搜索标题、概念或模型…" />
        </div>
      </div>
      <div class="shelf-grid" id="shelf-grid" data-testid="atlas-shelf"></div>
    </section>

    <section>
      <div class="section-head">
        <h2 class="section-title">待探索线索队列（Next Loops）</h2>
        <span class="section-note">尚未下钻的子图提示词与待核实边界</span>
      </div>
      <div class="loop-list" id="next-loops" data-testid="next-loops-list"></div>
    </section>
  </main>

  <script id="atlas-dashboard-data" type="application/json">${safePayload}</script>
  <script>
    (function () {
      const raw = document.getElementById('atlas-dashboard-data').textContent || '{}';
      const data = JSON.parse(raw);

      function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
      }

      function renderStats() {
        const grid = document.getElementById('stats-grid');
        const items = [
          ['已探索领域', data.stats.domainCount + ' 个'],
          ['累计知识地图', data.stats.atlasCount + ' 张'],
          ['累计成长评估', data.stats.reviewCount + ' 次'],
          ['最高认知阶梯', data.stats.maxDepth > 0 ? data.stats.maxDepth + ' 阶' : '-'],
        ];
        items.forEach(([label, val]) => {
          const card = el('div', 'stat-card');
          card.appendChild(el('div', 'stat-label', label));
          card.appendChild(el('div', 'stat-value', val));
          grid.appendChild(card);
        });
      }

      function createSvgCurve(points) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 300 84');
        svg.setAttribute('class', 'chart-svg');

        const yForTier = (t) => 72 - ((Math.max(2, Math.min(6, t)) - 2) / 4) * 56;
        [2, 4, 6].forEach((tier) => {
          const y = yForTier(tier);
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', '22');
          line.setAttribute('x2', '292');
          line.setAttribute('y1', String(y));
          line.setAttribute('y2', String(y));
          line.setAttribute('stroke', '#e4e4e7');
          line.setAttribute('stroke-dasharray', '3 3');
          svg.appendChild(line);

          const label = document.createElementNS(ns, 'text');
          label.setAttribute('x', '0');
          label.setAttribute('y', String(y + 3));
          label.setAttribute('font-size', '9');
          label.setAttribute('fill', '#71717a');
          label.textContent = tier + '阶';
          svg.appendChild(label);
        });

        if (points.length === 0) return svg;
        const coords = points.map((p, i) => {
          const x = points.length === 1 ? 156 : 28 + (i / (points.length - 1)) * 258;
          const y = yForTier(p.depth);
          return { x, y, p };
        });

        if (coords.length > 1) {
          const poly = document.createElementNS(ns, 'polyline');
          poly.setAttribute('fill', 'none');
          poly.setAttribute('stroke', '#18181b');
          poly.setAttribute('stroke-width', '1.8');
          poly.setAttribute('points', coords.map((c) => c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' '));
          svg.appendChild(poly);
        }

        coords.forEach(({ x, y, p }) => {
          const c = document.createElementNS(ns, 'circle');
          c.setAttribute('cx', x.toFixed(1));
          c.setAttribute('cy', y.toFixed(1));
          c.setAttribute('r', '3.5');
          c.setAttribute('fill', p.censored ? '#b45309' : '#18181b');
          const title = document.createElementNS(ns, 'title');
          title.textContent = (p.at || ('#' + p.idx)) + ' · ' + p.score + '分（' + p.depth + '阶）· ' + p.model;
          c.appendChild(title);
          svg.appendChild(c);
        });

        return svg;
      }

      function renderDomains() {
        const container = document.getElementById('domain-grid');
        if (!data.domains.length) {
          container.appendChild(el('div', 'empty-box', '尚无能力成长记录。完成一次学习地图评估后，这里会绘出你的认知阶梯演进曲线。'));
          return;
        }
        data.domains.forEach((d) => {
          const card = el('article', 'card');
          const top = el('div', 'card-top');
          top.appendChild(el('div', 'domain-name', d.key));
          const badges = el('div', 'badge-row');
          badges.appendChild(el('span', 'pill pill-dark', '建议 ' + d.recommendedDepth + ' 阶'));
          badges.appendChild(el('span', 'pill', d.estimate + ' 分' + (d.censored ? '+' : '')));
          if (!d.hasDirect) badges.appendChild(el('span', 'pill', '上级汇聚'));
          top.appendChild(badges);
          card.appendChild(top);

          const chartWrap = el('div', 'chart-wrap');
          chartWrap.appendChild(createSvgCurve(d.points));
          card.appendChild(chartWrap);

          const foot = el('div', 'badge-row');
          foot.appendChild(el('span', 'pill', d.observationCount + ' 条观测'));
          if (d.models.length) foot.appendChild(el('span', 'pill', '模型：' + d.models.join(', ')));
          card.appendChild(foot);
          container.appendChild(card);
        });
      }

      function renderShelf() {
        const select = document.getElementById('shelf-domain-filter');
        const search = document.getElementById('shelf-search');
        const grid = document.getElementById('shelf-grid');

        const allOpt = el('option', '', '全部领域 (' + data.atlases.length + ')');
        allOpt.value = '';
        select.appendChild(allOpt);
        data.allDomainKeys.forEach((k) => {
          const opt = el('option', '', k);
          opt.value = k;
          select.appendChild(opt);
        });

        function update() {
          const dom = select.value;
          const q = search.value.trim().toLowerCase();
          grid.innerHTML = '';
          const filtered = data.atlases.filter((a) => {
            if (dom && a.domain !== dom && !String(a.domain || '').startsWith(dom + '/')) return false;
            if (!q) return true;
            const hay = [a.title, a.domain, a.subjectTag, a.model, ...(a.concepts || [])].join(' ').toLowerCase();
            return hay.includes(q);
          });
          if (!filtered.length) {
            grid.appendChild(el('div', 'empty-box', data.atlases.length ? '没有匹配当前筛选条件的地图。' : '尚未归档知识地图。运行 atlas-loop profile catalog 后将在此展示。'));
            return;
          }
          filtered.forEach((a) => {
            const card = el('article', 'card');
            const top = el('div', 'card-top');
            top.appendChild(el('div', 'domain-name', a.title));
            const badges = el('div', 'badge-row');
            badges.appendChild(el('span', 'pill pill-dark', Number(a.level) > 0 ? 'L' + a.level : 'L0'));
            badges.appendChild(el('span', 'pill', a.depth + ' 阶'));
            if (a.lastScore !== undefined) badges.appendChild(el('span', 'pill', '自评 ' + a.lastScore + ' 分'));
            top.appendChild(badges);
            card.appendChild(top);

            const metaRow = el('div', 'badge-row');
            metaRow.appendChild(el('span', 'pill', a.domain));
            if (a.subjectTag) metaRow.appendChild(el('span', 'pill', a.subjectTag));
            if (a.unverifiedCount > 0) metaRow.appendChild(el('span', 'pill pill-warn', a.unverifiedCount + ' 待核实'));
            card.appendChild(metaRow);

            if (a.concepts && a.concepts.length) {
              const chips = el('div', 'concept-list');
              a.concepts.slice(0, 6).forEach((c) => chips.appendChild(el('span', 'concept-chip', c)));
              if (a.concepts.length > 6) chips.appendChild(el('span', 'concept-chip', '+' + (a.concepts.length - 6)));
              card.appendChild(chips);
            }

            const actions = el('div', 'card-actions');
            actions.appendChild(el('span', '', String(a.updatedAt || '').slice(0, 10) + (a.model ? ' · ' + a.model : '')));
            if (a.fileHref) {
              const link = el('a', 'btn-link', '打开地图');
              link.href = a.fileHref;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              actions.appendChild(link);
            }
            card.appendChild(actions);
            grid.appendChild(card);
          });
        }

        select.addEventListener('change', update);
        search.addEventListener('input', update);
        update();
      }

      function renderNextLoops() {
        const list = document.getElementById('next-loops');
        if (!data.nextLoops.length) {
          list.appendChild(el('div', 'empty-box', '暂无未下钻的待探索线索。'));
          return;
        }
        data.nextLoops.forEach((item) => {
          const row = el('div', 'loop-item');
          const left = el('div');
          left.appendChild(el('div', 'domain-name', item.title));
          left.appendChild(el('div', 'section-note', item.domain + ' · 来源：' + item.atlasTitle));
          row.appendChild(left);

          const btn = el('button', 'btn-copy', '复制探索提示词');
          btn.type = 'button';
          btn.addEventListener('click', () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(item.prompt).catch(() => {});
            }
            btn.textContent = '已复制';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = '复制探索提示词';
              btn.classList.remove('copied');
            }, 1800);
          });
          row.appendChild(btn);
          list.appendChild(row);
        });
      }

      renderStats();
      renderDomains();
      renderShelf();
      renderNextLoops();
    })();
  </script>
</body>
</html>
`;
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
    else if (a === '--html') args.html = argv[++i];
    else if (a === '--data') args.data = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else args._.push(a);
  }
  return args;
}

export function main(argv = process.argv) {
  const args = parseArgs(argv);
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
      console.log(`没有「${args.domain}」的记录：按 ${result.recommendedDepth} 阶起步，学完请回来评估。`);
      if (result.relatedAtlases.length > 0) {
        console.log(
          `已关联 ${result.relatedAtlases.length} 张历史地图；已学核心概念：${result.knownConcepts.slice(0, 8).join('、')}`
        );
      }
      if (result.similarKeys.length > 0) {
        console.log(`档案中已有领域：${result.similarKeys.join('、')}（如属同一本领请优先复用）`);
      }
      return;
    }
    const src = result.inherited ? `（继承自 ${result.matchedKey}）` : '';
    const bound = result.censored ? '（下界，真实能力更高）' : '';
    console.log(
      `${args.domain} 估计 ${result.estimate} 分${bound}${src}，` +
        `建议知识深度 ${result.recommendedDepth} 阶；共 ${result.observationCount} 条观测。`
    );
    if (result.relatedAtlases.length > 0) {
      console.log(
        `已关联 ${result.relatedAtlases.length} 张历史地图；已学核心概念：${result.knownConcepts.slice(0, 8).join('、')}`
      );
    }
    return;
  }

  if (cmd === 'record') {
    if (!args.domain || !args.score || !args.depth) {
      console.error(
        '用法：node profile.mjs record --domain "餐饮/厨师/粤菜" --score 6 --depth 3 [--model X] [--html <atlas.html>] [--json]'
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
      htmlPath: args.html || null,
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
      `已记录 ${args.domain} = ${args.score} 分（${args.depth} 阶，测到上限 ${ceiling}${
        censored ? '，顶格：这张图不够测' : ''
      }）；下张图建议 ${next.recommendedDepth} 阶`
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

  if (cmd === 'catalog') {
    if (!args.domain || (!args.html && !args.data)) {
      console.error(
        '用法：node profile.mjs catalog --domain "餐饮/厨师/粤菜" --html <atlas.html> [--data <graph-data.json>] [--json]'
      );
      process.exit(1);
    }
    const profile = loadProfile(file);
    const graphData = args.data ? JSON.parse(fs.readFileSync(path.resolve(args.data), 'utf8')) : null;
    const entry = catalogAtlas(profile, {
      domain: args.domain,
      htmlPath: args.html || null,
      data: graphData,
    });
    saveProfile(profile, file);
    if (args.json) {
      console.log(JSON.stringify({ ok: true, entry, file }, null, 2));
      return;
    }
    console.log(
      `已归档地图「${entry.title}」（${entry.domain} · L${entry.level} · ${entry.depth} 阶 · ${entry.concepts.length} 个核心概念）`
    );
    return;
  }

  if (cmd === 'dashboard') {
    const profile = loadProfile(file);
    const outPath = args.out ? path.resolve(args.out) : path.join(path.dirname(file), 'dashboard.html');
    const html = renderDashboardHtml(profile, { profileFile: file });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, 'utf8');
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            outputHtml: outPath,
            bytes: fs.statSync(outPath).size,
            domainCount: Object.keys(profile.entries).length,
            atlasCount: (profile.atlases || []).length,
          },
          null,
          2
        )
      );
      return;
    }
    console.log(`已生成个人成长总览页：${outPath}`);
    return;
  }

  if (cmd === 'list') {
    const profile = loadProfile(file);
    const rows = listEntries(profile);
    if (args.json) {
      console.log(JSON.stringify({ file, entries: rows, atlases: profile.atlases || [] }, null, 2));
      return;
    }
    if (rows.length === 0 && (profile.atlases || []).length === 0) {
      console.log(`档案为空：${file}`);
      return;
    }
    for (const r of rows) {
      console.log(
        `${r.key}\t${r.estimate === null ? '-' : r.estimate} 分${
          r.censored ? '+' : ''
        }\t深度 ${r.depth} 阶\t${r.observations} 条\t${r.models.join(', ')}`
      );
    }
    if ((profile.atlases || []).length > 0) {
      console.log(`\n已归档地图：${profile.atlases.length} 张`);
    }
    return;
  }

  console.error('用法：node profile.mjs <read|record|catalog|dashboard|list> [选项]');
  process.exit(1);
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
  try {
    main();
  } catch (err) {
    console.error(`profile.mjs：${err.message}`);
    process.exit(1);
  }
}
