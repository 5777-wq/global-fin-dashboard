#!/usr/bin/env node
/* collect-brk.mjs —— 伯克希尔·哈撒韦 13F-HR 持仓采集（SEC EDGAR 官方数据，浏览器永不直连 SEC）
   流程：submissions JSON → 最近两期 13F-HR → 各自 infotable.xml → 聚合 → 环比
        → data/actors/berkshire.json（随仓库提交，前端只读这份静态 JSON）。
   口径（诚实标注）：13F 是季度披露的美股多头持仓（value 原始单位为千美元，已换算），
   滞后最长 45 天，不含空头/衍生品/非美资产；环比 = 与上一期同 CUSIP 股数对比。
   原则：宁缺毋假——SEC 不可达时 exit 1 且绝不改写旧文件；上一期拿不到就不输出环比。 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'actors', 'berkshire.json');
const CIK = '0001067983';   // BERKSHIRE HATHAWAY INC
// SEC 公平访问政策要求"名称 + 可联系邮箱"；实测 noreply 类隐私代理邮箱域名会被 WAF 403
const UA = 'OpenFinLens AdminContact@proton.me';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 部分 WAF（含 SEC 在部分网络下）按 TLS/HTTP 指纹放行 curl、拦 Node fetch：
   fetch 403 时退避重试，仍不行就落到 curl 再试一轮（Actions 上通常用不到）。 */
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '--max-time', '25', '-A', UA, url], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

async function get(url, attempt = 0) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    // SEC 公平访问政策：必须带可联系的 User-Agent；限流时退避重试
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } });
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(4000 * (attempt + 1));
      return get(url, attempt + 1);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } catch (e) {
    if (attempt >= 3 || (e.message && !e.message.includes('HTTP 403'))) {
      // fetch 路径彻底失败：最后试一次 curl（403 指纹拦截的兜底）
      try { return await curlGet(url); } catch { throw e; }
    }
    await sleep(4000 * (attempt + 1));
    return get(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

/* 目录里挑 infotable：命名不统一（infotable.xml / Form13FInfoTable.xml / …），
   先按名字匹配，兜底取第一个非 primary_doc/coverpage 的 xml */
function pickInfoTableXml(dirItems) {
  const files = (dirItems || []).map(x => String(x.name || '')).filter(n => /\.xml$/i.test(n));
  return files.find(n => /infotable|form13finfo|informationtable/i.test(n))
    || files.find(n => !/primary_doc|coverpage|signature|submission/i.test(n))
    || files[0];
}

/* infotable xml → [{issuer, cusip, valueUsd, shares}]。命名空间无关的正则解析，
   只取四个必需字段——不上 XML 解析器（零依赖约束）。 */
function parseInfoTable(xml) {
  const blocks = xml.split(/<\/[\w:]*infoTable>/i).slice(0, -1);
  const rows = [];
  for (const b of blocks) {
    const tag = (name) => {
      const m = b.match(new RegExp('<[\\w:]*' + name + '>([^<]*)</[\\w:]*' + name + '>', 'i'));
      return m ? m[1].trim() : '';
    };
    const sharesM = b.match(/<[\w:]*sshPrnamt>([^<]*)<\/[\w:]*sshPrnamt>/i);
    const issuer = tag('nameOfIssuer');
    // SEC 自 2023-01 起 13F value 字段为整美元（此前是千美元）；只抓最近两期，必然都是新口径
    const valueUsd = +tag('value');
    const shares = sharesM ? +sharesM[1].replace(/,/g, '') : NaN;
    if (!issuer || !isFinite(valueUsd)) continue;
    rows.push({
      issuer,
      cusip: tag('cusip'),
      valueUsd,
      shares: isFinite(shares) ? shares : null,
    });
  }
  return rows;
}

/* 同一发行人可能有多行（不同股份类别/多个基金账户），按 CUSIP 聚合 */
function aggregate(rows) {
  const m = new Map();
  rows.forEach(r => {
    const k = r.cusip || r.issuer;
    const prev = m.get(k);
    if (prev) {
      prev.valueUsd += r.valueUsd;
      if (r.shares !== null) prev.shares = (prev.shares || 0) + r.shares;
    } else {
      m.set(k, { issuer: r.issuer, cusip: r.cusip, valueUsd: r.valueUsd, shares: r.shares });
    }
  });
  return Array.from(m.values());
}

async function fetchQuarter(accession) {
  const dir = accession.replace(/-/g, '');
  const idx = JSON.parse(await get(`https://www.sec.gov/Archives/edgar/data/1067983/${dir}/index.json`));
  const xmlName = pickInfoTableXml(idx.directory && idx.directory.item);
  if (!xmlName) throw new Error('infotable xml not found in ' + accession);
  const xml = await get(`https://www.sec.gov/Archives/edgar/data/1067983/${dir}/${encodeURIComponent(xmlName)}`);
  return aggregate(parseInfoTable(xml));
}

async function main() {
  console.log('拉取 SEC submissions …');
  const sub = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${CIK}.json`));
  const f = sub.filings && sub.filings.recent;
  if (!f || !Array.isArray(f.form)) throw new Error('submissions 结构异常');
  const accs = [];
  for (let i = 0; i < f.form.length && accs.length < 2; i++) {
    if (f.form[i] === '13F-HR') {
      accs.push({
        accession: f.accessionNumber[i],
        reportDate: f.reportDate ? f.reportDate[i] : null,
        filedAt: f.filingDate ? f.filingDate[i] : null,
      });
    }
  }
  if (!accs.length) throw new Error('未找到 13F-HR');

  const cur = await fetchQuarter(accs[0].accession);
  let prev = null;
  if (accs[1]) {
    try {
      await sleep(600);   // SEC 礼貌间隔
      prev = await fetchQuarter(accs[1].accession);
    } catch (e) {
      console.error('上一期 13F 获取失败，环比省略: ' + e.message);
    }
  }

  const prevMap = new Map((prev || []).map(h => [h.cusip || h.issuer, h]));
  const totalValueUsd = cur.reduce((s, h) => s + h.valueUsd, 0);
  const holdings = cur.map(h => {
    const p = prevMap.get(h.cusip || h.issuer);
    let change = 'HOLD', sharesChange = null, sharesChangePct = null;
    if (!p) change = 'NEW';
    else if (h.shares !== null && p.shares !== null && p.shares > 0) {
      sharesChange = h.shares - p.shares;
      sharesChangePct = (h.shares - p.shares) / p.shares * 100;
      if (Math.abs(sharesChangePct) < 0.005) change = 'HOLD';
      else change = sharesChange > 0 ? 'ADD' : 'TRIM';
    }
    return {
      issuer: h.issuer, cusip: h.cusip, valueUsd: h.valueUsd, shares: h.shares,
      pctOfTotal: totalValueUsd ? +(h.valueUsd / totalValueUsd * 100).toFixed(2) : null,
      change, sharesChange,
      sharesChangePct: sharesChangePct === null ? null : +sharesChangePct.toFixed(2),
    };
  }).sort((a, b) => b.valueUsd - a.valueUsd);

  const exits = prev
    ? prev.filter(h => !cur.some(c => (c.cusip || c.issuer) === (h.cusip || h.issuer)))
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 12)
      .map(h => ({ issuer: h.issuer, cusip: h.cusip, prevShares: h.shares }))
    : [];

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'SEC EDGAR · 13F-HR（BERKSHIRE HATHAWAY INC，CIK 0001067983）',
    confidence: 'REPORTED',
    reportDate: accs[0].reportDate,
    filedAt: accs[0].filedAt,
    priorReportDate: accs[1] ? accs[1].reportDate : null,
    totalValueUsd,
    holdingsCount: holdings.length,
    note: '13F 为季度披露的美股多头持仓（SEC 2023-01 起 value 为整美元口径），不含空头/衍生品/非美资产；环比为与上一期 13F 的同 CUSIP 股数对比；CUSIP 换码可能误标"新进"。全部为历史事实陈述，不构成任何建议。',
    holdings: holdings.slice(0, 80),
    exits,
  };

  const body = JSON.stringify(payload, null, 1);
  if (body.length > 1.5 * 1024 * 1024) {
    console.error('产物体积异常（' + body.length + 'B），拒绝写入');
    process.exit(1);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  let old = null;
  try { old = readFileSync(OUT, 'utf8'); } catch { /* 首次生成 */ }
  if (old === body + '\n') {
    console.log('内容无变化，不写文件');
    return;
  }
  writeFileSync(OUT, body + '\n');
  console.log(`写入 ${OUT}：报告期 ${accs[0].reportDate} · 持仓 ${holdings.length} 项 · 组合合计 ${(totalValueUsd / 1e9).toFixed(1)} 十亿美元`);
}

main().catch(e => { console.error(e); process.exit(1); });
