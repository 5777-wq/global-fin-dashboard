/* universe.js —— 8 大品类常量表（全部代码已实测返回有效行情，2026-08）
   group: cn / hk / us / index / crypto / fx / commodity / macro
   tab 归属：all / cn / hkus / crypto / fxmacro */

// 腾讯源（GBK）：A股 / 港股 / 美股 / 全球指数
const TENCENT_UNIVERSE = [
  // A股指数
  { symbol: 'sh000001', group: 'index', tab: 'cn', label: '上证指数' },
  { symbol: 'sz399001', group: 'index', tab: 'cn', label: '深证成指' },
  { symbol: 'sz399006', group: 'index', tab: 'cn', label: '创业板指' },
  { symbol: 'sh000688', group: 'index', tab: 'cn', label: '科创50' },
  // A股权重个股
  { symbol: 'sh600519', group: 'cn', tab: 'cn', label: '贵州茅台' },
  { symbol: 'sz300750', group: 'cn', tab: 'cn', label: '宁德时代' },
  { symbol: 'sh601318', group: 'cn', tab: 'cn', label: '中国平安' },
  { symbol: 'sz000858', group: 'cn', tab: 'cn', label: '五粮液' },
  // 港股
  { symbol: 'hkHSI', group: 'index', tab: 'hkus', label: '恒生指数' },
  { symbol: 'hkHSTECH', group: 'index', tab: 'hkus', label: '恒生科技' },
  { symbol: 'hk00700', group: 'hk', tab: 'hkus', label: '腾讯控股' },
  { symbol: 'hk09988', group: 'hk', tab: 'hkus', label: '阿里巴巴' },
  { symbol: 'hk03690', group: 'hk', tab: 'hkus', label: '美团' },
  { symbol: 'hk00941', group: 'hk', tab: 'hkus', label: '中国移动' },
  // 美股指数
  { symbol: 'usDJI', group: 'index', tab: 'hkus', label: '道琼斯' },
  { symbol: 'usIXIC', group: 'index', tab: 'hkus', label: '纳斯达克' },
  { symbol: 'usINX', group: 'index', tab: 'hkus', label: '标普500' },
  // 美股个股
  { symbol: 'usAAPL', group: 'us', tab: 'hkus', label: '苹果' },
  { symbol: 'usNVDA', group: 'us', tab: 'hkus', label: '英伟达' },
  { symbol: 'usMSFT', group: 'us', tab: 'hkus', label: '微软' },
  { symbol: 'usTSLA', group: 'us', tab: 'hkus', label: '特斯拉' },
  { symbol: 'usAMZN', group: 'us', tab: 'hkus', label: '亚马逊' },
  { symbol: 'usGOOG', group: 'us', tab: 'hkus', label: '谷歌' },
];

// 东财 secid 源：外汇 / 大宗商品 / 宏观利率 / 部分全球指数
const EM_UNIVERSE = [
  // 外汇（m:119 直盘 / m:133 离岸人民币）
  { symbol: 'EM:133.USDCNH', secid: '133.USDCNH', group: 'fx', tab: 'fxmacro', label: '美元离岸人民币' },
  { symbol: 'EM:119.EURUSD', secid: '119.EURUSD', group: 'fx', tab: 'fxmacro', label: '欧元美元' },
  { symbol: 'EM:119.GBPUSD', secid: '119.GBPUSD', group: 'fx', tab: 'fxmacro', label: '英镑美元' },
  { symbol: 'EM:119.USDJPY', secid: '119.USDJPY', group: 'fx', tab: 'fxmacro', label: '美元日元' },
  { symbol: 'EM:119.USDHKD', secid: '119.USDHKD', group: 'fx', tab: 'fxmacro', label: '美元港币' },
  { symbol: 'EM:100.UDI', secid: '100.UDI', group: 'fx', tab: 'fxmacro', label: '美元指数' },
  // 大宗商品
  { symbol: 'EM:101.GC00Y', secid: '101.GC00Y', group: 'commodity', tab: 'fxmacro', label: 'COMEX黄金' },
  { symbol: 'EM:101.SI00Y', secid: '101.SI00Y', group: 'commodity', tab: 'fxmacro', label: 'COMEX白银' },
  { symbol: 'EM:101.HG00Y', secid: '101.HG00Y', group: 'commodity', tab: 'fxmacro', label: 'COMEX铜' },
  { symbol: 'EM:102.CL00Y', secid: '102.CL00Y', group: 'commodity', tab: 'fxmacro', label: 'NYMEX原油' },
  { symbol: 'EM:102.NG00Y', secid: '102.NG00Y', group: 'commodity', tab: 'fxmacro', label: '天然气' },
  { symbol: 'EM:103.ZC00Y', secid: '103.ZC00Y', group: 'commodity', tab: 'fxmacro', label: '玉米连续' },
  // 宏观利率（m:171 国债收益率）
  { symbol: 'EM:171.US10Y', secid: '171.US10Y', group: 'macro', tab: 'fxmacro', label: '美债10年' },
  { symbol: 'EM:171.US2Y', secid: '171.US2Y', group: 'macro', tab: 'fxmacro', label: '美债2年' },
  { symbol: 'EM:171.US30Y', secid: '171.US30Y', group: 'macro', tab: 'fxmacro', label: '美债30年' },
  { symbol: 'EM:171.CN10Y', secid: '171.CN10Y', group: 'macro', tab: 'fxmacro', label: '中债10年' },
  { symbol: 'EM:171.DE10Y', secid: '171.DE10Y', group: 'macro', tab: 'fxmacro', label: '德债10年' },
  { symbol: 'EM:171.JP10Y', secid: '171.JP10Y', group: 'macro', tab: 'fxmacro', label: '日债10年' },
];

// 加密：卡片墙精选 + 热力图全集（币安 USDT 交易对，显式列举避免大响应被截断）
const CRYPTO_FEATURED = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

const CRYPTO_UNIVERSE = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'TRXUSDT',
  'LINKUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT', 'BCHUSDT', 'NEARUSDT', 'APTUSDT', 'ICPUSDT',
  'FILUSDT', 'ETCUSDT', 'ATOMUSDT', 'OPUSDT', 'ARBUSDT', 'SUIUSDT', 'INJUSDT', 'SEIUSDT',
  'TIAUSDT', 'RUNEUSDT', 'AAVEUSDT', 'UNIUSDT', 'MKRUSDT', 'ALGOUSDT', 'VETUSDT', 'FTMUSDT',
  'SANDUSDT', 'MANAUSDT', 'AXSUSDT', 'GALAUSDT', 'THETAUSDT', 'EOSUSDT', 'XLMUSDT', 'HBARUSDT',
  'EGLDUSDT', 'FLOWUSDT', 'CHZUSDT', 'ZILUSDT', 'ENJUSDT', 'CRVUSDT', 'COMPUSDT', 'SNXUSDT',
  'LDOUSDT', 'GRTUSDT', 'IMXUSDT', 'STXUSDT', 'RENDERUSDT', 'JUPUSDT', 'PYTHUSDT', 'WIFUSDT',
  'PEPEUSDT', 'SHIBUSDT', 'BONKUSDT', 'FLOKIUSDT', 'ORDIUSDT', 'WLDUSDT', 'ARKMUSDT', 'BLURUSDT',
  'DYDXUSDT', 'GMXUSDT', 'ROSEUSDT', 'ONEUSDT', 'IOTAUSDT', 'KAVAUSDT', 'ZRXUSDT', 'BATUSDT',
  'QNTUSDT', 'ANKRUSDT', 'CELOUSDT', 'MINAUSDT', 'RVNUSDT', 'SKLUSDT', 'STORJUSDT', 'WAVESUSDT',
];

// 卡片墙分组显示顺序（品类标题）
const GROUP_META = [
  { key: 'index', label: '全球指数' },
  { key: 'cn', label: 'A股' },
  { key: 'hk', label: '港股' },
  { key: 'us', label: '美股' },
  { key: 'crypto', label: '加密货币' },
  { key: 'fx', label: '外汇' },
  { key: 'commodity', label: '大宗商品' },
  { key: 'macro', label: '宏观利率' },
];

window.TENCENT_UNIVERSE = TENCENT_UNIVERSE;
window.EM_UNIVERSE = EM_UNIVERSE;
window.CRYPTO_FEATURED = CRYPTO_FEATURED;
window.CRYPTO_UNIVERSE = CRYPTO_UNIVERSE;
window.GROUP_META = GROUP_META;
