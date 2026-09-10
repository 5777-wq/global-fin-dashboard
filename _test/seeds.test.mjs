/* seeds.test.mjs —— 采集产物的数据体检（纯离线，读仓库内静态 JSON）
   全球事件种子与伯克希尔 13F 种子必须满足结构完整 + 数量级合理；
   数据缺失（文件不存在）不算失败，但已有文件绝不能是脏数据。 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + '\n   ' + e.message); }
}

await test('global-events.json：结构完整，坐标只允许 null 或有限数，标题非空', async () => {
  const f = path.join(ROOT, 'data/events/global-events.json');
  if (!existsSync(f)) { console.log('   （种子尚未生成，跳过）'); return; }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(Array.isArray(d.events), true);
  assert.equal(typeof d.generatedAt, 'string');
  assert.ok(d.count === d.events.length, 'count 字段与实际条数一致');
  assert.ok(d.events.length <= 260, '不超过 CAP');
  for (const e of d.events) {
    assert.ok(typeof e.title === 'string' && e.title.length > 4);
    assert.ok(['high', 'med', 'low'].includes(e.importance));
    assert.equal(Number.isFinite(Date.parse(e.publishedAt)), true, 'publishedAt 可解析');
    if (e.lat !== null) {
      assert.ok(Number.isFinite(e.lat) && Math.abs(e.lat) <= 90, '纬度有限');
      assert.ok(Number.isFinite(e.lng) && Math.abs(e.lng) <= 180, '经度有限');
    }
    assert.equal(Array.isArray(e.relatedSymbols), true);
  }
});

await test('berkshire.json：组合量级合理（百亿~万亿美元），占比 ≤100%，环比标签合法', async () => {
  const f = path.join(ROOT, 'data/actors/berkshire.json');
  if (!existsSync(f)) { console.log('   （种子尚未生成，跳过）'); return; }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(typeof d.reportDate, 'string');
  assert.ok(d.totalValueUsd >= 1e10 && d.totalValueUsd <= 1e13,
    `组合合计 ${d.totalValueUsd} 超出合理量级（value 口径 2023 起为整美元）`);
  assert.ok(d.holdings.length > 0);
  let pctSum = 0;
  for (const h of d.holdings) {
    assert.ok(typeof h.issuer === 'string' && h.issuer.length > 1);
    assert.ok(h.valueUsd >= 0 && h.valueUsd <= d.totalValueUsd);
    pctSum += h.pctOfTotal || 0;
    assert.ok(['NEW', 'ADD', 'TRIM', 'HOLD', 'EXIT'].includes(h.change), '环比标签合法');
  }
  assert.ok(pctSum <= 100.5, `占比合计 ${pctSum}% 不该超过 100%`);
});

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(fail ? 1 : 0), 300);
}, 50);
