#!/usr/bin/env node
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  MIN_DEPTH,
  MAX_DEPTH,
  SCORE_OPTIONS,
  scoreToDepth,
  depthToScore,
  ancestorKeys,
  writeBackWeight,
  nearestOption,
  resolveEstimate,
  recordScore,
  loadProfile,
  saveProfile,
} from './profile.mjs';

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-profile-test-'));
  return { dir, file: path.join(dir, 'profile.json'), profile: { version: 1, entries: {} } };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('深度与评分互为反函数，且夹在 2–6 跳', () => {
  for (const s of SCORE_OPTIONS) {
    const d = scoreToDepth(s);
    assert.ok(d >= MIN_DEPTH && d <= MAX_DEPTH, `${s} 分 → ${d} 跳越界`);
    assert.equal(d, s / 2 + 1);
  }
  assert.equal(scoreToDepth(0), MIN_DEPTH);
  assert.equal(scoreToDepth(99), MAX_DEPTH);
  assert.equal(depthToScore(3), 4);
});

test('祖先链由细到粗，单段 key 只有自身', () => {
  assert.deepEqual(ancestorKeys('餐饮/厨师/粤菜'), ['餐饮/厨师/粤菜', '餐饮/厨师', '餐饮']);
  assert.deepEqual(ancestorKeys('编程'), ['编程']);
  assert.deepEqual(ancestorKeys(' / '), []);
});

test('回写权重每上一级折半', () => {
  assert.equal(writeBackWeight(0), 1);
  assert.equal(writeBackWeight(1), 0.5);
  assert.equal(writeBackWeight(2), 0.25);
});

test('吸附到最近的合法档位，中点取下限', () => {
  assert.equal(nearestOption(5.33), 6);
  assert.equal(nearestOption(3.4), 4);
  assert.equal(nearestOption(5), 4);
  assert.equal(nearestOption(0), 2);
  assert.equal(nearestOption(99), 10);
});

test('恰好测到上限不算顶格：这张图对学习者偏难', () => {
  const { profile } = fresh();
  // depth 3 → 上限 4 分
  const { censored } = recordScore(profile, { key: '餐饮/厨师/粤菜', score: 4, depth: 3 });
  assert.equal(censored, false);
  const est = resolveEstimate(profile, '餐饮/厨师/粤菜');
  assert.equal(est.estimate, 4);
  assert.equal(est.recommendedDepth, 3, '恰好测到上限应保持原深度');
});

test('超过上限才算顶格，且只加深一跳', () => {
  const { profile } = fresh();
  const { censored } = recordScore(profile, { key: '餐饮/厨师/粤菜', score: 6, depth: 3 });
  assert.equal(censored, true);
  const est = resolveEstimate(profile, '餐饮/厨师/粤菜');
  assert.equal(est.estimate, 6);
  assert.equal(est.recommendedDepth, 4, '6 分反解就是 4 跳，不能叠加成 5');
  assert.equal(est.censored, true);
});

test('连续两次评分能读出进步（回归：中位数锁死）', () => {
  const { profile } = fresh();
  recordScore(profile, { key: '餐饮/厨师/粤菜', score: 4, depth: 3, at: '2026-01-01T00:00:00Z' });
  recordScore(profile, { key: '餐饮/厨师/粤菜', score: 6, depth: 3, at: '2026-02-01T00:00:00Z' });
  const est = resolveEstimate(profile, '餐饮/厨师/粤菜');
  assert.equal(est.estimate, 6, '最近一次高分应主导估计');
  assert.equal(est.recommendedDepth, 4);
});

test('单次跳涨不会一步到顶，历史压住幅度', () => {
  const { profile } = fresh();
  recordScore(profile, { key: '编程', score: 2, depth: 2, at: '2026-01-01T00:00:00Z' });
  recordScore(profile, { key: '编程', score: 10, depth: 2, at: '2026-02-01T00:00:00Z' });
  const est = resolveEstimate(profile, '编程');
  // (2*0.5 + 10*1) / 1.5 = 7.33 → 8
  assert.equal(est.estimate, 8, '一次跳涨只到 8，需要连续两次才到 10');
});

test('深图低分直接降档，不留情面', () => {
  const { profile } = fresh();
  recordScore(profile, { key: '金融', score: 2, depth: 6 });
  const est = resolveEstimate(profile, '金融');
  assert.equal(est.recommendedDepth, 2);
  assert.equal(est.censored, false);
});

test('模型分层：同一领域不同模型互不污染', () => {
  const { profile } = fresh();
  recordScore(profile, { key: '编程', score: 10, depth: 2, model: 'sonnet', at: '2026-01-01T00:00:00Z' });
  recordScore(profile, { key: '编程', score: 8, depth: 6, model: 'opus', at: '2026-02-01T00:00:00Z' });
  assert.equal(resolveEstimate(profile, '编程', { model: 'sonnet' }).estimate, 10);
  assert.equal(resolveEstimate(profile, '编程', { model: 'opus' }).estimate, 8);
  // 没见过的模型退回全部观测，而不是当成空白重建
  const unknown = resolveEstimate(profile, '编程', { model: 'qwen' });
  assert.equal(unknown.usedModel, null);
  assert.equal(unknown.observationCount, 2);
});

test('前缀回退：子领域无记录时继承最近祖先', () => {
  const { profile } = fresh();
  recordScore(profile, { key: '餐饮/厨师/粤菜', score: 6, depth: 3 });
  const est = resolveEstimate(profile, '餐饮/服务员');
  assert.equal(est.inherited, true);
  assert.equal(est.matchedKey, '餐饮');
  assert.equal(est.estimate, 6);
});

test('回写：上级领域获得折半权重的观测并标注来源', () => {
  const { profile } = fresh();
  const { written } = recordScore(profile, { key: '餐饮/厨师/粤菜', score: 6, depth: 3 });
  assert.equal(written.length, 3);
  const chef = profile.entries['餐饮/厨师'].observations[0];
  const domain = profile.entries['餐饮'].observations[0];
  assert.equal(chef.weight, 0.5);
  assert.equal(chef.source, 'write-back');
  assert.equal(chef.originKey, '餐饮/厨师/粤菜');
  assert.equal(domain.weight, 0.25);
});

test('空档案给出 3 跳起步', () => {
  const { profile } = fresh();
  const est = resolveEstimate(profile, '从未记录');
  assert.equal(est.estimate, null);
  assert.equal(est.recommendedDepth, 3);
  assert.equal(est.matchedKey, null);
});

test('非法评分与非法深度都被拒绝', () => {
  const { profile } = fresh();
  assert.throws(() => recordScore(profile, { key: 'x', score: 7, depth: 3 }), /2 \/ 4 \/ 6 \/ 8 \/ 10/);
  assert.throws(() => recordScore(profile, { key: 'x', score: 6, depth: 9 }), /2–6/);
  assert.throws(() => recordScore(profile, { key: '', score: 6, depth: 3 }), /domain/);
});

test('档案损坏时另存备份并重建，不静默丢数据', () => {
  const { dir, file } = fresh();
  fs.writeFileSync(file, '{broken', 'utf8');
  const loaded = loadProfile(file);
  assert.deepEqual(loaded.entries, {});
  assert.ok(loaded.recoveredFrom && fs.existsSync(loaded.recoveredFrom));
  assert.equal(fs.readdirSync(dir).filter((f) => f.includes('.corrupt-')).length, 1);
});

test('保存是原子写：不留临时文件', () => {
  const { dir, file, profile } = fresh();
  recordScore(profile, { key: '餐饮', score: 4, depth: 3 });
  saveProfile(profile, file);
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
  assert.equal(loadProfile(file).entries['餐饮'].observations.length, 1);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exit(failed === 0 ? 0 : 1);
