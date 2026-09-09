/* lhb.js —— A股龙虎榜（东财数据中心 datacenter-web，免密钥）
   实测（2026-09）：该接口带 Access-Control-Allow-Origin: *，浏览器可直连——
   与 GDELT/SEC 不同，它是国内源，不需要采集层。
   口径（诚实标注）：龙虎榜是交易所披露的营业部/机构席位汇总，日频，不是任何
   个人账户的实时交易；D1/D5 字段是该股历史次日/5日涨跌统计，不是预测。
   降级链：东财 → localStorage 缓存。 */

const LhbSource = (() => {
  const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
  const COLUMNS = 'SECURITY_CODE,SECURITY_NAME_ABBR,SECUCODE,CHANGE_RATE,BILLBOARD_NET_AMT,' +
    'BILLBOARD_BUY_AMT,BILLBOARD_SELL_AMT,BILLBOARD_DEAL_AMT,DEAL_NET_RATIO,EXPLANATION,' +
    'TRADE_DATE,MARKET,D1_CLOSE_ADJCHRATE,D5_CLOSE_ADJCHRATE,CLOSE_PRICE';

  // EM secid：m=1 沪，m=0 深北（与 tencentOfSecid 的映射互为镜像）
  function secidOf(row) {
    const code = String(row.SECURITY_CODE || '');
    return (String(row.MARKET).toUpperCase() === 'SH' ? '1.' : '0.') + code;
  }

  async function fetchDate(date) {
    const qs = new URLSearchParams({
      reportName: 'RPT_DAILYBILLBOARD_DETAILSNEW',
      columns: COLUMNS,
      filter: `(TRADE_DATE='${date}')`,
      pageNumber: '1', pageSize: '60',
      sortTypes: '-1', sortColumns: 'BILLBOARD_NET_AMT',
      source: 'WEB', client: 'WEB',
    });
    const j = await window.U.request(API + '?' + qs.toString(), { timeout: 9000 });
    const rows = (j && j.result && j.result.data) || [];
    return rows.map(r => {
      const secid = secidOf(r);
      return {
        secid,
        symbol: 'EM:' + secid,
        code: String(r.SECURITY_CODE || ''),
        name: String(r.SECURITY_NAME_ABBR || r.SECURITY_CODE || ''),
        changePct: window.U.num(r.CHANGE_RATE),
        netAmt: window.U.num(r.BILLBOARD_NET_AMT),
        buyAmt: window.U.num(r.BILLBOARD_BUY_AMT),
        sellAmt: window.U.num(r.BILLBOARD_SELL_AMT),
        dealAmt: window.U.num(r.BILLBOARD_DEAL_AMT),
        netRatio: window.U.num(r.DEAL_NET_RATIO),
        close: window.U.num(r.CLOSE_PRICE),
        d1: window.U.num(r.D1_CLOSE_ADJCHRATE),
        d5: window.U.num(r.D5_CLOSE_ADJCHRATE),
        reason: String(r.EXPLANATION || ''),
        tradeDate: String(r.TRADE_DATE || '').slice(0, 10),
      };
    }).filter(r => r.netAmt !== null);
  }

  /* 取"最近一个有数据的披露日"。节假日/清仓日返回空表就往前找（最多 6 天）。 */
  async function getLhb() {
    const tried = new Set();
    for (let i = 0; i < 6; i++) {
      const date = window.Events.latestLhbDate(Date.now() - i * 86400000);
      if (!date || tried.has(date)) continue;
      tried.add(date);
      let rows = [];
      try { rows = await fetchDate(date); } catch { /* 当日失败继续往前找 */ }
      if (rows.length) {
        window.SourceState.ok('lhb');
        return { rows, tradeDate: date, via: 'em', at: Date.now() };
      }
    }
    window.SourceState.fail('lhb', '东财龙虎榜不可达');
    return { rows: [], tradeDate: null, via: null, at: Date.now() };
  }

  return { getLhb, fetchDate, secidOf };
})();

window.LhbSource = LhbSource;
