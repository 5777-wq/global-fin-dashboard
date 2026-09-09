#!/usr/bin/env node
/* run-all.mjs —— 一键跑全部测试组（纯 Node，无需依赖）
   用法：node _test/run-all.mjs            全部（含实网组）
         node _test/run-all.mjs --offline  只跑不依赖网络的组（logic/insight/breadth）
   退出码：全部通过 0；任一组失败 1。 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const offlineOnly = process.argv.includes('--offline');

const groups = [
  { file: 'logic.test.mjs', net: false },
  { file: 'insight.test.mjs', net: false },
  { file: 'evolve.test.mjs', net: false },  // 市场时段/情绪历史/请求去重（纯函数）
  { file: 'technical.test.mjs', net: false }, // 技术面指标手算核对（纯函数）
  { file: 'breadth.test.mjs', net: true },  // 结构断言为主，但取数需联网
  { file: 'detail.test.mjs', net: true },
  { file: 'degrade.test.mjs', net: true },
  { file: 'boards.test.mjs', net: true },   // 今日热门概念：榜单/成分股接口 + 链条匹配
  { file: 'live.test.mjs', net: true },
];

let failed = 0;
for (const g of groups) {
  if (offlineOnly && g.net) { console.log(`-- 跳过 ${g.file}（--offline 模式，需联网）`); continue; }
  console.log(`\n===== ${g.file} =====`);
  const r = spawnSync(process.execPath, [path.join(dir, g.file)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.log(`✗ ${g.file} 失败（exit ${r.status}）`); }
}

console.log('\n===== 汇总 =====');
if (failed) { console.log(`✗ ${failed} 组未通过`); process.exit(1); }
console.log('✓ 全部测试组通过');
