/* sec.js —— SEC EDGAR 采集产物只读适配器（伯克希尔·哈撒韦 13F-HR）
   采集跑在 GitHub Actions / 本地（_scripts/collect-brk.mjs），产物是随仓库提交的静态 JSON；
   浏览器只读自己的数据，永不直连 SEC（与 gdelt.js 同一原则）。
   口径：13F 为季度披露的美股多头持仓（REPORTED），环比是与上一期同 CUSIP 的股数对比。 */

const SecSource = (() => {

  async function getBerkshire() {
    const j = await window.U.request('data/actors/berkshire.json', { timeout: 9000 });
    if (!j || !Array.isArray(j.holdings)) throw new Error('bad payload');
    return j;
  }

  return { getBerkshire };
})();

window.SecSource = SecSource;
