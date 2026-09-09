#!/usr/bin/env node
/* collect-events.mjs —— 全球事件采集任务（跑在 GitHub Actions / 本地，浏览器永远不执行）
   流程：GDELT DOC 2.0 (artlist) → 清洗 → 去重 → 地理定位 → 重要性评分 → relatedSymbols
        → data/events/global-events.json（随仓库提交，前端只读这份静态 JSON）。
   原则：宁缺毋假——所有查询都失败时退出码 1 且绝不改写旧文件；定位不到的事件坐标为
   null（列表可见、地球不画点），不猜测。复用 js/events.js 的纯函数（去重键/标的映射）。 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Events = require('../js/events.js');

const OUT = path.join(ROOT, 'data', 'events', 'global-events.json');
const API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const WINDOW_HOURS = 6;
const CAP = 220;

/* 六类查询，覆盖第一版重点：macro / geopolitics / policy / central_bank / trade / conflict */
const QUERIES = [
  { type: 'central_bank', q: '("federal reserve" OR FOMC OR "rate decision" OR "european central bank" OR "bank of japan" OR "people\'s bank of china" OR "central bank") sourcelang:english' },
  { type: 'macro', q: '(inflation OR CPI OR "gross domestic product" OR recession OR "rate hike" OR "rate cut" OR unemployment) sourcelang:english' },
  { type: 'trade', q: '(tariff OR "trade war" OR "export controls" OR embargo OR "trade agreement" OR customs) sourcelang:english' },
  { type: 'conflict', q: '(airstrike OR "missile strike" OR ceasefire OR invasion OR "military offensive" OR "drone attack") sourcelang:english' },
  { type: 'geopolitics', q: '(sanctions OR summit OR "peace talks" OR NATO OR treaty OR diplomacy) sourcelang:english' },
  { type: 'macro', q: '(OPEC OR "crude output" OR "oil production" OR "natural gas prices" OR "energy prices") sourcelang:english' },
];

/* 地理定位：标题正则 → (国家, 首都/代表城市坐标)。按特异性排序（先长词后短词），
   命中即止。覆盖第一版重点地区；匹配不到 → lat/lng = null（不编位置）。 */
const PLACES = [
  [/hong kong/i, '香港', 22.32, 114.17],
  [/taiwan|taipei/i, '台湾', 25.03, 121.57],
  [/ukraine|kyiv|kiev/i, '乌克兰', 50.45, 30.52],
  [/russia|moscow|kremlin|putin/i, '俄罗斯', 55.76, 37.62],
  [/israel|gaza|tel aviv|jerusalem/i, '以色列', 32.08, 34.78],
  [/iran|tehran/i, '伊朗', 35.69, 51.39],
  [/saudi|riyadh/i, '沙特', 24.71, 46.68],
  [/opec|vienna/i, '奥地利', 48.21, 16.37],
  [/united states|u\.s\.|washington|white house|new york|federal reserve|wall street/i, '美国', 38.895, -77.036],
  [/canada|ottawa/i, '加拿大', 45.42, -75.70],
  [/mexico/i, '墨西哥', 19.43, -99.13],
  [/brazil|brasilia/i, '巴西', -15.79, -47.88],
  [/argentina/i, '阿根廷', -34.60, -58.38],
  [/united kingdom|britain|london|boe|bank of england/i, '英国', 51.51, -0.13],
  [/france|paris/i, '法国', 48.86, 2.35],
  [/germany|berlin|bundesbank/i, '德国', 52.52, 13.40],
  [/european union|eurozone|brussels|ecb|european central bank|frankfurt/i, '欧元区', 50.11, 8.68],
  [/switzerland|swiss|davos/i, '瑞士', 46.94, 7.45],
  [/spain|madrid/i, '西班牙', 40.42, -3.70],
  [/italy|rome/i, '意大利', 41.90, 12.50],
  [/poland|warsaw/i, '波兰', 52.23, 21.01],
  [/turkey|ankara|istanbul/i, '土耳其', 39.93, 32.86],
  [/india|delhi|mumbai|reserve bank of india/i, '印度', 28.61, 77.21],
  [/japan|tokyo|bank of japan|boj/i, '日本', 35.68, 139.69],
  [/south korea|seoul|korea/i, '韩国', 37.57, 126.98],
  [/north korea|pyongyang/i, '朝鲜', 39.02, 125.75],
  [/australia|canberra|reserve bank of australia/i, '澳大利亚', -35.28, 149.13],
  [/singapore/i, '新加坡', 1.35, 103.82],
  [/indonesia|jakarta/i, '印度尼西亚', -6.21, 106.85],
  [/vietnam|hanoi/i, '越南', 21.03, 105.85],
  [/pakistan|islamabad/i, '巴基斯坦', 33.68, 73.05],
  [/nigeria|abuja/i, '尼日利亚', 9.06, 7.49],
  [/egypt|cairo/i, '埃及', 30.04, 31.24],
  [/south africa|pretoria/i, '南非', -25.75, 28.19],
  [/china|chinese|beijing|shanghai|shenzhen|pboc|yuan|renminbi/i, '中国', 39.904, 116.407],
];

/* 重要性：同事件跨源重复 ≥3 = high；白名单大社 = 至少 med；其余 low/med */
const TOP_SOURCES = /reuters|bloomberg|apnews|associated press|wsj|wall street journal|ft\.com|financial times|cnbc|bbc|nytimes|cnn|aljazeera/i;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchQuery(item, attempt = 0) {
  const qs = new URLSearchParams({
    query: item.q, mode: 'artlist', maxrecords: '75',
    format: 'json', timespan: WINDOW_HOURS + 'h', sort: 'datedesc',
  });
  const url = API + '?' + qs.toString();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'openfinlens-collector/1.0' } });
    if (res.status === 429 && attempt < 3) {
      await sleep(5000 * (attempt + 1));
      return fetchQuery(item, attempt + 1);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return j.articles || [];
  } finally {
    clearTimeout(timer);
  }
}

function seenToMs(s) {
  return Events.toMs(s);
}

async function main() {
  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  const raw = [];
  const fails = [];
  for (const item of QUERIES) {
    try {
      const arts = await fetchQuery(item);
      arts.forEach(a => raw.push({ ...a, type: item.type }));
      console.log(`  [${item.type}] ${arts.length} 条`);
    } catch (e) {
      fails.push(item.type + ': ' + e.message);
      console.error(`  [${item.type}] 失败 ${e.message}`);
    }
    await sleep(1200);   // GDELT 礼貌间隔
  }

  if (!raw.length) {
    console.error('所有查询均失败，保留旧数据不动。\n' + fails.join('\n'));
    process.exit(1);
  }

  // 跨源重复计数（去重前）→ 重要性；seen 时间窗过滤
  const dupCount = new Map();
  raw.forEach(a => {
    const k = Events.dedupeKey(a.title);
    if (k) dupCount.set(k, (dupCount.get(k) || 0) + 1);
  });

  const events = [];
  const seen = new Set();
  raw.forEach(a => {
    const publishedAt = seenToMs(a.seendate);
    if (publishedAt === null || publishedAt < cutoff) return;
    const key = Events.dedupeKey(a.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const dups = dupCount.get(key) || 1;
    const topSource = TOP_SOURCES.test(a.domain || '') || TOP_SOURCES.test(a.title || '');
    const importance = dups >= 3 ? 'high' : (topSource || dups >= 2) ? 'med' : 'low';
    const place = PLACES.find(([re]) => re.test(a.title || ''));
    events.push({
      id: key + '|' + publishedAt,
      type: a.type,
      title: String(a.title || '').trim(),
      source: String(a.domain || a.sourcecountry || ''),
      sourceUrl: /^https?:\/\//i.test(a.url || '') ? a.url : '',
      publishedAt: new Date(publishedAt).toISOString(),
      lat: place ? place[2] : null,
      lng: place ? place[3] : null,
      country: place ? place[1] : null,
      importance,
      relatedSymbols: Events.matchSymbols(a.title || ''),
    });
  });

  // 排序：重要度 → 新鲜度；截断
  events.sort((x, y) =>
    (Events.impRank(y.importance) - Events.impRank(x.importance)) ||
    (Date.parse(y.publishedAt) - Date.parse(x.publishedAt)));
  const out = events.slice(0, CAP);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'GDELT DOC 2.0 (artlist)',
    windowHours: WINDOW_HOURS,
    count: out.length,
    license: 'GDELT 免费开放数据（gdeltproject.org），坐标为本项目关键词地理定位，精度为国家/地区级',
    events: out,
  };

  // 体积守门：JSON 超过 1.5MB 说明脏了（正常 ~200KB），拒绝写入
  const body = JSON.stringify(payload);
  if (body.length > 1.5 * 1024 * 1024) {
    console.error('产物体积异常（' + body.length + 'B），拒绝写入');
    process.exit(1);
  }

  // 与旧文件对比：内容没变就不写（Action 提交才不会空转）
  let old = null;
  try { old = readFileSync(OUT, 'utf8'); } catch { /* 首次生成 */ }
  if (old === body + '\n') {
    console.log('内容无变化，不写文件');
    return;
  }
  writeFileSync(OUT, body + '\n');
  console.log(`写入 ${OUT}：${out.length} 条事件（high ${out.filter(e => e.importance === 'high').length}）`);
}

main().catch(e => { console.error(e); process.exit(1); });
