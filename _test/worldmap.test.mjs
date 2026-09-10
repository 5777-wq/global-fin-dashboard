/* worldmap.js 平面世界地图：纯几何离线单测（node _test/worldmap.test.mjs）
   覆盖：跨 180° 经线 unwrap（防 equirect 投影把多边形拉成横条）、
   缩放→聚类粒度阈值、模块加载形状（window.WorldMapView API 表面）。 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + '\n   ' + e.message); }
}

function loadModule(rel, globalName, extraCtx = {}) {
  const ctx = vm.createContext({ console, Math, Date, Number, String, Array, Object, isNaN, RegExp, Set, Map, ...extraCtx });
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInContext(readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  return ctx.window[globalName];
}

const WM = loadModule('js/worldmap.js', 'WorldMapView', {
  U: { escapeHTML: (s) => String(s == null ? '' : s) },   // utils.js 的最小 stub
});

await test('unwrapRing：普通环不漂移，跨 180° 环展开为连续经度', () => {
  const norm = (v) => JSON.stringify(v);   // vm realm 数组原型不同，按值比较
  // 普通环：原样
  assert.equal(norm(WM.geo.unwrapRing([[100, 10], [102, 12], [104, 10], [100, 10]])),
    JSON.stringify([[100, 10], [102, 12], [104, 10], [100, 10]]));
  // 俄罗斯东端：179 → -179 应展开为 179 → 181（而非拉到地球另一侧）
  assert.equal(norm(WM.geo.unwrapRing([[178, 65], [179, 66], [-179, 66], [-178, 65], [178, 65]])),
    JSON.stringify([[178, 65], [179, 66], [181, 66], [182, 65], [178, 65]]));
  // 反方向跨线：-179 → 179 应展开为 -179 → -181
  assert.equal(norm(WM.geo.unwrapRing([[-180, 0], [-179, 1], [179, 1], [-180, 0]])),
    JSON.stringify([[-180, 0], [-179, 1], [-181, 1], [-180, 0]]));
  // 多次跨线持续累积（斐济群岛式锯齿）：经度在 179/181 间来回，不再瞬移对侧
  const zig = WM.geo.unwrapRing([[179, 0], [-179, 0], [179, 1], [-179, 1], [179, 0]]);
  assert.equal(zig[1][0], 181);
  assert.equal(zig[2][0], 179);
  assert.equal(zig[3][0], 181);
});

await test('bucketForZoomAt：缩放阈值决定聚类粒度（10/6/3/0 度）', () => {
  assert.equal(WM.geo.bucketForZoomAt(0.9), 10);   // 远景：10° 粗聚类
  assert.equal(WM.geo.bucketForZoomAt(1.49), 10);
  assert.equal(WM.geo.bucketForZoomAt(1.5), 6);    // 边界：进入 6° 档
  assert.equal(WM.geo.bucketForZoomAt(2.59), 6);
  assert.equal(WM.geo.bucketForZoomAt(2.6), 3);
  assert.equal(WM.geo.bucketForZoomAt(4.99), 3);
  assert.equal(WM.geo.bucketForZoomAt(5), 0);      // 近景：不聚类
  assert.equal(WM.geo.bucketForZoomAt(12), 0);
});

await test('模块形状：API 表面与 GlobeView 同形，初始未就绪', () => {
  for (const k of ['create', 'setEvents', 'select', 'focus', 'resize', 'dispose', 'isReady']) {
    assert.equal(typeof WM[k], 'function', 'missing api: ' + k);
  }
  assert.equal(WM.isReady(), false);   // 测试环境无 DOM，create 不可调，但模块须无害加载
});

console.log(`\nworldmap: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
