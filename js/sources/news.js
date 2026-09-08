/* news.js —— 新闻流：新浪滚动(主) + 东财新闻(备)
   实测（2026-08）：
   - 新浪 feed.mix.sina.com.cn/api/roll/get 无 CORS 头 → 但支持 callback= JSONP，走 JSONP 可直连
     字段：result.data[] { title, url, ctime(Unix秒), intro, media_name, docid }
   - 东财 np-listapi 需要 req_trace 参数，否则报 "Required String parameter 'req_trace' is not present"
     字段：data.list[] { title, uniqueUrl, showTime("YYYY-MM-DD HH:mm:ss"), summary, mediaName, code }
   统一输出：{ id, title, url, time(ms), source, summary } */

const NewsSource = (() => {
  const { fetchJSONP, request, num } = window.U;

  // 新浪频道：lid 2516 财经滚动 / 2517 国内 / 2518 国际 / 2519 证券
  const SINA_LIDS = [2516, 2519];

  async function fromSina(num_ = 50) {
    const jobs = SINA_LIDS.map(lid =>
      fetchJSONP(`https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=${num_}&page=1`, 'callback', 9000)
        .then(j => (j && j.result && j.result.data) || [])
        .catch(() => [])
    );
    const parts = await Promise.all(jobs);
    const out = [];
    parts.flat().forEach(it => {
      if (!it || !it.title || !it.url) return;
      out.push({
        id: 'sina:' + (it.docid || it.url),
        title: String(it.title).trim(),
        url: it.url,
        time: (num(it.ctime) || 0) * 1000,
        source: it.media_name || '新浪财经',
        summary: String(it.intro || '').trim(),
      });
    });
    return out;
  }

  async function fromEastmoney(size = 30) {
    // column 348 实测可用（财经要闻）
    const trace = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const url = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col' +
      `&column=348&order=1&needInteractData=0&page_index=1&page_size=${size}&req_trace=${trace}&fields=&types=1,20`;
    const j = await request(url, { timeout: 9000 });
    const list = (j && j.data && j.data.list) || [];
    return list.filter(it => it && it.title).map(it => ({
      id: 'em:' + (it.code || it.uniqueUrl),
      title: String(it.title).trim(),
      url: it.uniqueUrl || it.url,
      time: it.showTime ? new Date(it.showTime.replace(/-/g, '/')).getTime() : Date.now(),
      source: it.mediaName || '东方财富',
      summary: String(it.summary || '').trim(),
    }));
  }

  // 主源 → 备源 → 缓存（60s）
  async function getNews() {
    try {
      const list = await fromSina();
      if (list.length) {
        const merged = dedupe(list);
        window.U.Cache.set('news', merged);
        window.SourceState.ok('news', 'sina');
        return { list: merged, via: 'sina', cachedAt: null };
      }
      throw new Error('sina empty');
    } catch (e1) {
      try {
        const list = await fromEastmoney();
        if (list.length) {
          const merged = dedupe(list);
          window.U.Cache.set('news', merged);
          window.SourceState.ok('news', 'eastmoney');
          return { list: merged, via: 'eastmoney', cachedAt: null };
        }
        throw new Error('em empty');
      } catch (e2) {
        window.SourceState.fail('news', e2.message);
        const c = window.U.Cache.raw('news');
        return c ? { list: c.val, via: 'cache', cachedAt: c.at } : { list: [], via: 'none', cachedAt: null };
      }
    }
  }

  function dedupe(list) {
    const seen = new Set();
    const out = [];
    list.forEach(it => {
      const key = it.title.slice(0, 40);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(it);
    });
    return out.sort((a, b) => b.time - a.time);
  }

  // 市场分类关键词（加密不单独接源，按关键词过滤）
  const KEYWORDS = {
    crypto: ['比特币', 'BTC', '以太坊', 'ETH', '加密', '虚拟货币', '数字货币', '稳定币', 'USDT', '区块链', '币圈'],
    cn: ['A股', '沪指', '深证', '创业板', '科创板', '上证', '证监会', '北向', '两市', '涨停', '央行', '人民币', '国常会', '公募', '私募'],
    global: ['美股', '纳斯达克', '道琼斯', '标普', '恒指', '港股', '美联储', '联储', '非农', 'CPI', '英伟达', '特斯拉', '苹果', '欧元', '日元', '黄金', '原油'],
  };
  function matchMarket(item, market) {
    if (!market || market === 'all') return true;
    const keys = KEYWORDS[market];
    if (!keys) return true;
    const text = item.title + ' ' + (item.summary || '');
    return keys.some(k => text.toUpperCase().includes(k.toUpperCase()));
  }

  return { getNews, matchMarket, fromSina, fromEastmoney };
})();

window.NewsSource = NewsSource;
