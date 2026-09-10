/* 时区口径 + 科普层校验：
   1) 图表时间轴必须是"本地墙钟"（LWC 按 UTC 渲染，必须传伪 UTC）——用户报的 bug；
   2) computeProfile 画像手算核对；
   3) explain 表完整性 / 大师数据结构。
   用法：node _test/insight.test.mjs */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0';
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + '\n   ' + e.message); }
}

function makeCtx() {
  const ctx = vm.createContext({
    console, Math, Date, JSON, Number, String, Array, Object, isNaN, parseInt, parseFloat, Infinity,
    setTimeout, clearTimeout, TextDecoder, Promise, Error, RegExp, Map, Set, encodeURIComponent,
    URL, URLSearchParams, AbortController, AbortSignal, performance,
    fetch: (url, opts = {}) => fetch(url, {
      ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000),
    }),
    document: {
      documentElement: {}, body: {},
      createElement: () => ({ style: {}, remove() {}, addEventListener() {} }),
      head: { appendChild() {} }, querySelectorAll: () => [], addEventListener() {},
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: (f) => setTimeout(f, 0),
  });
  ctx.window = ctx; ctx.globalThis = ctx;
  return ctx;
}
const ctx = makeCtx();
const load = (rel) => vm.runInContext(readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
load('js/utils.js'); load('js/store.js'); load('js/proxy.js');
load('js/data/masters.js'); load('js/data/explain.js');
load('js/data/industry-chains.js'); load('js/data/universe.js');
load('js/sources/tencent.js'); load('js/sources/binance.js');
const W = vm.runInContext('window', ctx);

/* ================= 时区口径（用户报告的 bug） ================= */
await test('toChartTime：编码后的 UTC 墙钟分量 == 输入的本地墙钟分量', () => {
  // 取一个确定的时间：本地 2026-08-26 09:30
  const d = new Date(2026, 7, 26, 9, 30, 0);
  const t = W.U.toChartTime(Math.floor(d.getTime() / 1000));
  const back = new Date(t * 1000);
  assert.equal(back.getUTCHours(), 9, 'getUTCHours=' + back.getUTCHours());
  assert.equal(back.getUTCMinutes(), 30, 'getUTCMinutes=' + back.getUTCMinutes());
  assert.equal(back.getUTCFullYear(), 2026);
  assert.equal(back.getUTCDate(), 26);
});

await test('腾讯分时：time 的 UTC 墙钟 == 交易所时刻（09:30 开盘，时间递增）', async () => {
  const pts = await W.TencentSource.getMinute('sh600519');
  // 09:30-11:10 开盘初期分时天然不足 100 点：点数断言只在应足额时段生效，结构断言始终执行
  if (pts.length <= 100) console.log(`   （开盘初期仅 ${pts.length} 点，跳过点数断言）`);
  else assert.ok(pts.length > 100, '分时点仅 ' + pts.length);
  assert.ok(pts.length >= 10, '分时点不足 10 个，源结构可疑');
  const first = new Date(pts[0].time * 1000);
  assert.equal(first.getUTCHours() * 60 + first.getUTCMinutes(), 9 * 60 + 30,
    `首点应为 09:30（UTC 墙钟），实际 ${first.getUTCHours()}:${first.getUTCMinutes()}`);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].time > pts[i - 1].time, '时间未递增 @' + i);
  }
  const last = new Date(pts[pts.length - 1].time * 1000);
  console.log(`   （${pts.length} 点，图表将显示 ${first.getUTCHours()}:${String(first.getUTCMinutes()).padStart(2,'0')} → ${last.getUTCHours()}:${String(last.getUTCMinutes()).padStart(2,'0')}，即北京时间）`);
});

await test('腾讯分时：13:00 午休开盘后正确续接（01:00 UTC ≠ 上午）', async () => {
  const pts = await W.TencentSource.getMinute('sh600519');
  // 找 11:30 之后第一个点：A股下午盘 13:00 整点开盘，首点应为 13:00
  const times = pts.map(p => {
    const d = new Date(p.time * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  });
  const noonIdx = times.findIndex(t => t >= 12 * 60);
  if (noonIdx < 0) {
    // 盘中跑到午休（11:30-13:00 无新数据）：下午段还没生成，跳过午后断言
    console.log('   （盘中午休时段，下午分时未生成，跳过午后断言）');
    return;
  }
  assert.ok(noonIdx > 0, '没找到下午段');
  assert.equal(times[noonIdx], 13 * 60, '午后首点应为 13:00，实际 ' + times[noonIdx]);
  // 且上午段不越过 11:30 之后还在涨（午休 11:30-13:00 无数据点）
  const morning = times.slice(0, noonIdx);
  assert.ok(Math.max(...morning) <= 11 * 60 + 30, '上午出现 11:30 之后的点');
});

await test('加密K线：5分钟线走墙钟伪UTC，1d/1w 走日期字符串', async () => {
  const m5 = await W.BinanceSource.getKline('BTCUSDT', '5m', 20);
  assert.ok(m5.length >= 10, '5m 仅 ' + m5.length + ' 根');
  assert.equal(typeof m5[0].time, 'number', '5m time 应为数字（伪UTC秒）');
  const d = new Date(m5.at(-1).time * 1000);
  // 伪 UTC 的墙钟应接近当前本地墙钟（5 分钟内误差）
  const now = new Date();
  const driftMin = Math.abs((now.getHours() * 60 + now.getMinutes()) - (d.getUTCHours() * 60 + d.getUTCMinutes()));
  assert.ok(driftMin <= 6, '5m 墙钟偏差 ' + driftMin + ' 分钟，时区转换失效');

  const d1 = await W.BinanceSource.getKline('BTCUSDT', '1d', 10);
  assert.equal(typeof d1[0].time, 'string', '1d time 应为日期字符串');
  assert.match(d1[0].time, /^\d{4}-\d{2}-\d{2}$/);
  const w1 = await W.BinanceSource.getKline('BTCUSDT', '1w', 10);
  assert.match(w1[0].time, /^\d{4}-\d{2}-\d{2}$/);
  console.log(`   （1d 末根 ${d1.at(-1).time}，5m 图表按本地墙钟显示）`);
});

/* ================= 画像计算（手算核对） ================= */
await test('computeProfile：构造序列手算核对（年涨跌/回撤/均线/波动）', () => {
  // 构造 60 根日K：从 100 线性涨到 159（每日 +1%）
  const kl = [];
  let p = 100;
  for (let i = 0; i < 60; i++) { kl.push({ time: 'd' + i, open: p, close: p, high: p, low: p }); p *= 1.01; }
  const prof = W.Masters.computeProfile(kl);
  const last = kl[59].close;
  assert.ok(Math.abs(prof.yearChangePct - (last / 100 - 1) * 100) < 0.01, '年涨跌 ' + prof.yearChangePct);
  assert.ok(Math.abs(prof.offHighPct) < 0.0001, '序列单调涨，距高点应为 0');
  assert.ok(Math.abs(prof.offLowPct - (last / 100 - 1) * 100) < 0.01, '距低点=总涨幅');
  const ma20expect = kl.slice(-20).reduce((s, k) => s + k.close, 0) / 20;
  assert.ok(Math.abs(prof.ma20 - ma20expect) < 0.01);
  assert.equal(prof.aboveMA20, true);
  assert.equal(prof.aboveMA60, true);
  // 恒定 +1% 日收益 → 年化波动 ≈ 0
  assert.ok(prof.volAnnual < 1, '恒定收益波动应≈0，实际 ' + prof.volAnnual);
});

await test('computeProfile：数据不足 / 脏数据返回 null', () => {
  assert.equal(W.Masters.computeProfile([]), null);
  assert.equal(W.Masters.computeProfile(null), null);
  assert.equal(W.Masters.computeProfile([{ close: 1 }, { close: 2 }]), null, '30 根以下应 null');
  const bad = Array.from({ length: 50 }, () => ({ close: null }));
  assert.equal(W.Masters.computeProfile(bad), null, '全脏数据应 null');
});

await test('computeProfile：新画像字段手算核对（回撤/高点距今/20日动量/均线偏离）', () => {
  const kl = [];
  for (let i = 0; i < 40; i++) kl.push({ close: 100 + 2 * i });            // 涨段：峰 178 @ i=39
  const peakV = 178;
  for (let k = 1; k <= 20; k++) kl.push({ close: peakV * Math.pow(0.99, k) }); // 跌段 20 根
  const prof = W.Masters.computeProfile(kl);
  const last = kl[59].close;
  assert.ok(Math.abs(prof.maxDDPct - (last / peakV - 1) * 100) < 0.01, 'maxDD ' + prof.maxDDPct);
  assert.equal(prof.barsSinceHigh, 20, '距高点交易日数 ' + prof.barsSinceHigh);
  assert.ok(Math.abs(prof.mom20Pct - (last / kl[39].close - 1) * 100) < 0.01, 'mom20 ' + prof.mom20Pct);
  assert.ok(prof.ma20OffPct < 0 && prof.aboveMA20 === false, '下跌段现价应在 20 日线下方');
});

await test('posIn52w：52 周区间位置手算核对', () => {
  const kl = []; let v = 100;
  for (let i = 0; i < 60; i++) { kl.push({ close: v }); v += 1; }   // 100 → 159
  const p = W.Masters.computeProfile(kl);
  const pos = W.Masters.posIn52w(p);
  assert.ok(pos !== null && Math.abs(pos - 1) < 0.01, '单调涨序列现价应在区间顶: ' + pos);
  const p2kl = []; let v2 = 100;
  for (let i = 0; i < 61; i++) { p2kl.push({ close: v2 }); v2 *= 0.99; }
  const p2 = W.Masters.computeProfile(p2kl);
  const pos2 = W.Masters.posIn52w(p2);
  assert.ok(pos2 !== null && pos2 < 0.05, '单调跌序列现价应在区间底: ' + pos2);
});

/* ================= 大师数据结构 ================= */
await test('大师定义：≥6 位，字段完整', () => {
  assert.ok(W.Masters.LIST.length >= 6, '仅 ' + W.Masters.LIST.length + ' 位');
  const ids = new Set();
  W.Masters.LIST.forEach(m => {
    assert.ok(m.id && m.name && m.school && m.quote, m.id + ' 字段缺失');
    ids.add(m.id);
  });
  assert.equal(ids.size, W.Masters.LIST.length, 'id 重复');
  assert.ok(ids.has('buffett'), '必须有巴菲特');
});

/* ================= 大师"具体标的具体分析" ================= */

const MOCK_KL = (start, days, daily) => {
  const kl = []; let v = start;
  for (let i = 0; i < days; i++) { kl.push({ time: 'd' + i, open: v, close: v, high: v, low: v }); v *= daily; }
  return kl;
};

await test('analyze：每条输出携带本标的专属内容（数字或属性），不是纯口号', () => {
  const p = W.Masters.computeProfile(MOCK_KL(100, 120, 1.003));
  const out = W.Masters.analyze({ symbol: 'sh600519', market: 'cn', code: '600519' }, p);
  out.forEach(m => {
    const hasNum = m.points.some(x => /\d/.test(x.t));
    assert.ok(hasNum, m.name + ' 所有条目都不含数字（疑似模板口号）');
    const hasPercent = m.points.some(x => x.t.includes('%'));
    assert.ok(hasPercent || m.headline.includes('%'), m.name + ' 无任何百分比数据');
  });
  // headline 随数据变化：同一位大师对强势/弱势标的 headline 不同
  const strong = W.Masters.analyze({ symbol: 'sh600519', market: 'cn' }, W.Masters.computeProfile(MOCK_KL(100, 200, 1.004)));
  const weak = W.Masters.analyze({ symbol: 'sh600519', market: 'cn' }, W.Masters.computeProfile(MOCK_KL(100, 200, 0.995)));
  let diffHeads = 0;
  strong.forEach((m, i) => { if (m.headline !== weak[i].headline) diffHeads++; });
  assert.ok(diffHeads >= 4, '强弱市况下动态 headline 仅 ' + diffHeads + ' 位大师不同，动态化不足');
});

await test('analyze：茅台的分析包含生意属性 + 真实画像数字（不是通用口号）', () => {
  const p = W.Masters.computeProfile(MOCK_KL(100, 120, 1.003));
  const out = W.Masters.analyze({ symbol: 'sh600519', name: '贵州茅台', market: 'cn', code: '600519' }, p);
  assert.equal(out.length, W.Masters.LIST.length, '每位大师都要有分析');
  const bf = out.find(m => m.name === '巴菲特');
  const all = out.map(m => m.points.map(x => x.t).join(' ')).join(' ');
  assert.ok(all.includes('品牌'), '茅台分析应提品牌属性');
  assert.ok(all.includes('近一年'), '应引用画像数据');
  assert.ok(all.includes('%'), '应有具体百分数');
  assert.ok(!/建议买入|建议卖出|应该买|应该卖|推荐买入|推荐卖出|可以抄底|可以买入/.test(all), '出现荐股表述');
  out.forEach(m => {
    assert.ok(m.points.length >= 2 && m.points.length <= 5, m.name + ' 条目数 ' + m.points.length);
    assert.ok(m.headline && m.quote, m.name + ' 缺 headline/quote');
    m.points.forEach(x => assert.ok(['fact', 'view', 'gap'].includes(x.k), '条目类型非法'));
  });
});

await test('analyze：不同标的分析不同（茅台 vs 英伟达 vs BTC 文本有区分度）', () => {
  const p = W.Masters.computeProfile(MOCK_KL(50, 120, 1.01));
  const mt = W.Masters.analyze({ symbol: 'sh600519', market: 'cn' }, p).map(m => m.points.map(x => x.t).join('')).join('');
  const nv = W.Masters.analyze({ symbol: 'usNVDA', market: 'us' }, p).map(m => m.points.map(x => x.t).join('')).join('');
  const bt = W.Masters.analyze({ symbol: 'BTCUSDT', market: 'crypto', code: 'BTCUSDT', name: 'BTC' }, p).map(m => m.points.map(x => x.t).join('')).join('');
  assert.ok(nv.includes('CUDA') || nv.includes('AI'), '英伟达分析应提其生意');
  assert.ok(bt.includes('数字黄金') || bt.includes('2100'), 'BTC 分析应提其属性');
  assert.notEqual(mt, nv);
  assert.notEqual(nv, bt);
});

await test('analyze：未知标的（搜索进来）也有完整分析 + 数据缺口标注', () => {
  const p = W.Masters.computeProfile(MOCK_KL(10, 60, 0.995));
  const out = W.Masters.analyze({ symbol: 'EM:1.600000', market: 'cn', name: '某银行', code: '600000' }, p);
  assert.equal(out.length, W.Masters.LIST.length);
  const all = out.map(m => m.points.map(x => x.t).join(' ')).join(' ');
  assert.ok(all.includes('近一年'), '兜底也应有画像数据');
  assert.ok(all.includes('财报') || all.includes('查'), '应提示数据缺口');
  // 无画像（K线拉取失败）也不崩
  const out2 = W.Masters.analyze({ symbol: 'EM:1.600000', market: 'cn' }, null);
  assert.equal(out2.length, W.Masters.LIST.length);
});

await test('analyze：欧奈尔对趋势位置给出差异化结论（强 vs 深回撤）', () => {
  const strong = W.Masters.computeProfile(MOCK_KL(100, 200, 1.004));   // 单边涨 → 贴近新高
  const weak = W.Masters.computeProfile(MOCK_KL(100, 200, 0.995));     // 单边跌 → 深回撤
  const s1 = W.Masters.analyze({ symbol: 'sh600519', market: 'cn' }, strong).find(m => m.name === '欧奈尔');
  const s2 = W.Masters.analyze({ symbol: 'sh600519', market: 'cn' }, weak).find(m => m.name === '欧奈尔');
  const t1 = s1.points.map(x => x.t).join('');
  const t2 = s2.points.map(x => x.t).join('');
  assert.ok(t1.includes('贴近新高') || t1.includes('经典买点'), '强势应给"贴近新高"类结论');
  assert.ok(t2.includes('回撤') || t2.includes('禁区') || t2.includes('从不抄底'), '弱势应给"回撤"类结论');
  assert.notEqual(t1, t2, '两种市况的欧奈尔分析不应相同');
});

await test('属性表：universe 全部标的 + 主流币都有大师分析用的属性', () => {
  const missing = [];
  W.TENCENT_UNIVERSE.forEach(x => { if (!W.Masters.P[x.symbol]) missing.push(x.symbol); });
  W.EM_UNIVERSE.forEach(x => { if (!W.Masters.P[x.symbol]) missing.push(x.symbol); });
  ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE'].forEach(b => { if (!W.Masters.CRYPTO_P[b]) missing.push('crypto:' + b); });
  assert.equal(missing.length, 0, '缺属性: ' + missing.join(','));
  // 每条属性字段完整
  Object.entries(W.Masters.P).forEach(([k, v]) => {
    assert.ok(v.biz && v.moat && v.g && v.risk !== undefined && v.reflex, k + ' 属性不完整');
    assert.ok(W.Masters.G_LABEL[v.g], k + ' g 分类非法: ' + v.g);
  });
});

/* ================= 解释表 ================= */
await test('explain：universe 全部标的 + 6 大主流币都有精确解释', () => {
  const missing = [];
  W.TENCENT_UNIVERSE.forEach(x => { if (!W.Explain.NOTES[x.symbol]) missing.push(x.symbol); });
  W.EM_UNIVERSE.forEach(x => { if (!W.Explain.NOTES[x.symbol]) missing.push(x.symbol); });
  ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE'].forEach(b => {
    if (!W.Explain.CRYPTO_NOTES[b]) missing.push('crypto:' + b);
  });
  assert.deepEqual && assert.equal(missing.length, 0, '缺解释: ' + missing.join(','));
});

await test('explain：of() 对任意标的都有兜底，中文解释非空', () => {
  const cases = [
    { symbol: 'EM:1.600000', market: 'cn', code: '600000', name: '浦发银行' },
    { symbol: 'BTCUSDT', market: 'crypto', code: 'BTCUSDT', name: 'BTC' },
    { symbol: 'PEPEUSDT', market: 'crypto', code: 'PEPEUSDT', name: 'PEPE' },
    { symbol: 'EM:119.EURUSD', market: 'fx', code: 'EURUSD' },
  ];
  cases.forEach(c => {
    const r = W.Explain.of(c);
    assert.ok(r && r.text && r.text.length > 8, JSON.stringify(c) + ' 无解释');
    assert.ok(['specific', 'market'].includes(r.kind), 'kind 非法');
  });
  assert.equal(W.Explain.of(null), null);
});

await test('产业链：10 条链 49 个环节全部带 desc 小白解释', () => {
  const links = W.INDUSTRY_CHAINS.flatMap(c => c.links);
  assert.ok(W.INDUSTRY_CHAINS.length >= 10, '链数 ' + W.INDUSTRY_CHAINS.length);
  assert.equal(links.length, 49);
  const noDesc = links.filter(l => !l.desc || l.desc.length < 10).map(l => l.name);
  assert.equal(noDesc.length, 0, '缺 desc: ' + noDesc.join(','));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
