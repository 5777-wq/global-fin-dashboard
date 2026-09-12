/* engine/types.js —— OpenFinLens 语义引擎的类型契约与常量（单一事实源）
   无 DOM、无网络、node 可直接加载（_test 用 vm）。所有 engine 模块共享本文件。
   对应《docs/ARCHITECTURE.md》§4–9 的数据模型设计。
   类型以 JSDoc 表达（项目无构建步骤；若未来确认引入工具链可平移为 .d.ts）。 */

/**
 * @typedef {'geopolitics'|'war'|'economy'|'central_bank'|'politics'|'trade'|'energy'|'commodities'|'markets'|'technology'|'natural_disaster'|'social'} NewsCategory
 */

/**
 * @typedef {Object} NewsItem
 * @property {string} id            hash(url)，URL 级幂等键
 * @property {string} title
 * @property {string} url
 * @property {string} source        小写域名，如 'reuters.com'
 * @property {number} publishedAt   epoch ms（统一 UTC）
 * @property {NewsCategory} category
 * @property {string|null} country  ISO2 大写
 * @property {number|null} lat
 * @property {number|null} lng
 */

/**
 * @typedef {Object} EventTimelineEntry
 * @property {number} t        epoch ms
 * @property {'news'|'system'} kind
 * @property {string} note
 * @property {string=} newsId
 */

/**
 * @typedef {'active'|'updating'|'resolved'} EventStatus
 */

/**
 * @typedef {Object} Event
 * @property {string} id
 * @property {string} title
 * @property {number} createdAt   epoch ms（簇内最早新闻）
 * @property {number} updatedAt   epoch ms（簇内最新新闻）
 * @property {{lat:number,lng:number,label?:string}|null} location
 * @property {string[]} countries  ISO2 大写
 * @property {NewsCategory[]} categories
 * @property {string[]} entities   预留：机构/人物实体
 * @property {number} severity     0-100
 * @property {number} confidence   0-1，随独立来源数上升
 * @property {EventStatus} status
 * @property {string[]} relatedAssets
 * @property {string[]} newsIds
 * @property {EventTimelineEntry[]} timeline
 */

/** @typedef {'DATA'|'CORRELATION'|'AI'} EvidenceKind  证据分级：机制事实 / 历史统计 / 模型推断，永不混装 */

/**
 * @typedef {Object} ImpactEdge
 * @property {string} eventKind     归一化事件种类，如 'CENTRAL_BANK_HIKE'
 * @property {string} assetSymbol   universe.js 的 symbol
 * @property {'positive'|'inverse'|'risk_on'|'risk_off'} relationship
 * @property {'up'|'down'|'flat'} direction
 * @property {number} confidence    0-1
 * @property {{kind: EvidenceKind, note: string}} evidence
 * @property {{label:string, date:string, move:string}[]} historicalCases
 */

/**
 * @typedef {Object} AiAssessment
 * @property {string} eventId
 * @property {string} provider
 * @property {string} model
 * @property {string} text
 * @property {number} tokens
 * @property {number} cachedAt
 */

const EngineTypes = {
  /** @type {NewsCategory[]} */
  CATEGORIES: [
    'geopolitics', 'war', 'economy', 'central_bank', 'politics', 'trade',
    'energy', 'commodities', 'markets', 'technology', 'natural_disaster', 'social',
  ],

  /** 类别 → 严重度基线（0-100；聚类时与来源数/新鲜度合成） */
  CATEGORY_SEVERITY: {
    war: 90, geopolitics: 70, natural_disaster: 68, central_bank: 62,
    energy: 55, trade: 52, commodities: 50, economy: 48,
    markets: 45, politics: 42, technology: 35, social: 35,
  },

  /** 权威源（标题归属 + 严重度加成用），小写域名子串 */
  TOP_SOURCES: /reuters|bloomberg|ap|afp|bbc|nytimes|wsj|ft\.com|economist|xinhua|cctv/i,

  /** 事件状态机阈值（小时）：窗内有新新闻=updating；超窗=active；超过 168h=resolved */
  STATUS_UPDATING_H: 24,
  STATUS_RESOLVED_H: 168,

  /* AI 成本三闸门（WorldMonitor 同款思想，常量显式化） */
  AI_SCORE_THRESHOLD: 60,     // 严重度低于此不值得调模型
  AI_CACHE_TTL_MS: 30 * 60 * 1000,
  AI_MAX_CONCURRENT: 3,

  /** 聚类参数（DomainAdapter 思想的全局默认；按类别可覆盖） */
  CLUSTER: {
    GRID_DEG: 20,             // 地理桶（度）
    TIME_WINDOW_H: 48,        // 桶内时间窗
    TITLE_JACCARD: 0.34,      // 标题相似度入簇阈值（跨源措辞差异大，阈值偏宽）
    DEDUPE_JACCARD: 0.62,     // 标题级去重阈值（同一事件的重复报道）
  },
};

if (typeof window !== 'undefined') window.EngineTypes = EngineTypes;
if (typeof module !== 'undefined' && module.exports) module.exports = EngineTypes;
