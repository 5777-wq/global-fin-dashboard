/* engine/impact-engine.js —— Asset Impact Engine
   链路：Event → Country → Industry → Asset → Market Reaction
   实现：事件种类归一化（kind）+ 影响规则表（机制性事实）+ 国家资产映射。
   证据分级铁律：规则表内置 = DATA（机制事实）/ CORRELATION（历史案例）；
   AI 推断只能由 llm-provider 产出并标 'AI'，本文件永不生成 'AI' 证据。
   依赖：EngineTypes。node 可测。 */

/* global EngineTypes */

const ImpactEngine = (() => {
  /* ---------- 事件种类归一化（category + 标题正则 → kind） ---------- */

  const KIND_RULES = [
    ['CENTRAL_BANK_HIKE', /加息|提高利率|rate hike|raises? rates|tighten/i],
    ['CENTRAL_BANK_CUT', /降息|下调利率|rate cut|cuts? rates|eases?/i],
    ['RATE_DECISION_HOLD', /按兵不动|维持利率|holds? rates/i],
    ['ARMED_CONFLICT', /开火|空袭|入侵|导弹|宣战|袭击|invasion|airstrike|missile/i],
    ['SANCTIONS', /制裁|禁运|sanction|embargo/i],
    ['TRADE_TARIFF', /关税|贸易战|tariff|trade war/i],
    ['OIL_SUPPLY_SHOCK', /原油|减产|输油管|油井|crude supply|oil field/i],
    ['EARTHQUAKE', /地震|earthquake/i],
    ['ELECTION', /大选|选举结果|election/i],
    ['BANK_STRESS', /银行挤兑|银行危机|bank run|bank failure/i],
  ];

  /**
   * Event → 归一化事件种类（未命中给 null，由调用方退回 category 级泛化规则）
   * @param {{categories:string[], title:string}} ev
   */
  function eventKind(ev) {
    const t = String(ev.title || '');
    for (const [kind, re] of KIND_RULES) if (re.test(t)) return kind;
    return null;
  }

  /* ---------- 国家 → 代表性资产（universe symbol 或市场惯用代码） ---------- */

  const COUNTRY_ASSETS = {
    US: { fx: 'USDCNH', equity: 'usINX', bond: 'US10Y' },
    CN: { fx: 'USDCNH', equity: 'sh000001', bond: 'CN10Y' },
    JP: { fx: 'USDJPY', equity: 'nikkei', bond: 'JP10Y' },
    GB: { fx: 'GBPUSD', equity: 'ftse', bond: 'GB10Y' },
    EU: { fx: 'EURUSD', equity: 'dax', bond: 'DE10Y' },
    DE: { fx: 'EURUSD', equity: 'dax', bond: 'DE10Y' },
    KR: { fx: 'USDKRW', equity: 'kospi', bond: 'KR10Y' },
    HK: { fx: 'USDHKD', equity: 'hkHSI', bond: 'HK10Y' },
    IN: { fx: 'USDINR', equity: 'sensex', bond: 'IN10Y' },
    AU: { fx: 'AUDUSD', equity: 'asx', bond: 'AU10Y' },
    CA: { fx: 'USDCAD', equity: 'tsx', bond: 'CA10Y' },
    BR: { fx: 'USDBRL', equity: 'bovespa', bond: 'BR10Y' },
  };

  /* ---------- 影响规则表（kind → 资产边；evidence.kind 恒为 DATA/CORRELATION） ----------
     direction 语义：资产价格方向（利率/收益率类资产是"价格上行"即 yield up）。
     relationship 描述机制：positive=事件利好资产，inverse=利空，
     risk_off=事件推高避险需求，risk_on=事件推高风险偏好。 */

  const RULES = {
    CENTRAL_BANK_HIKE: [
      { assetKind: 'fx_base', relationship: 'positive', direction: 'up', confidence: 0.8,
        evidence: { kind: 'DATA', note: '加息抬升本币利差，机制性支撑本币汇率' } },
      { assetKind: 'bond_yield', relationship: 'positive', direction: 'up', confidence: 0.85,
        evidence: { kind: 'DATA', note: '政策利率上行直接抬升短端国债收益率' } },
      { assetKind: 'equity', relationship: 'inverse', direction: 'down', confidence: 0.62,
        evidence: { kind: 'CORRELATION', note: '历史加息周期估值承压（概率性，非必然）',
          historicalCases: [
            { label: 'Fed 2022 紧缩周期', date: '2022-03 ~ 2023-07', move: 'SPX 区间下跌' },
            { label: 'BOJ 2024-03 退出负利率', date: '2024-03-19', move: '日经当日冲高回落' },
          ] } },
      { assetKind: 'gold', relationship: 'inverse', direction: 'down', confidence: 0.45,
        evidence: { kind: 'CORRELATION', note: '实际利率上行压制无息资产，但避险溢价可对冲' } },
      { assetKind: 'crypto', relationship: 'inverse', direction: 'down', confidence: 0.4,
        evidence: { kind: 'CORRELATION', note: '流动性收紧阶段高久期风险资产承压（相关性不稳定）' } },
    ],
    CENTRAL_BANK_CUT: [
      { assetKind: 'fx_base', relationship: 'inverse', direction: 'down', confidence: 0.75,
        evidence: { kind: 'DATA', note: '降息压缩本币利差' } },
      { assetKind: 'bond_yield', relationship: 'inverse', direction: 'down', confidence: 0.82,
        evidence: { kind: 'DATA', note: '政策利率下行牵引收益率曲线' } },
      { assetKind: 'equity', relationship: 'positive', direction: 'up', confidence: 0.6,
        evidence: { kind: 'CORRELATION', note: '宽松利好估值，但衰退式降息例外' } },
      { assetKind: 'gold', relationship: 'positive', direction: 'up', confidence: 0.5,
        evidence: { kind: 'CORRELATION', note: '实际利率下行利好黄金' } },
      { assetKind: 'crypto', relationship: 'positive', direction: 'up', confidence: 0.4,
        evidence: { kind: 'CORRELATION', note: '流动性宽松阶段高久期资产受益（相关性不稳定）' } },
    ],
    ARMED_CONFLICT: [
      { assetKind: 'gold', relationship: 'risk_off', direction: 'up', confidence: 0.7,
        evidence: { kind: 'CORRELATION', note: '武装冲突历史样本中黄金多数上涨' } },
      { assetKind: 'oil', relationship: 'positive', direction: 'up', confidence: 0.55,
        evidence: { kind: 'CORRELATION', note: '冲突涉及产油区时供给溢价显著，否则有限' } },
      { assetKind: 'equity', relationship: 'inverse', direction: 'down', confidence: 0.55,
        evidence: { kind: 'CORRELATION', note: '风险偏好受挫；冲突未扩散时快速修复' } },
      { assetKind: 'crypto', relationship: 'risk_off', direction: 'up', confidence: 0.35,
        evidence: { kind: 'CORRELATION', note: '样本少且分歧大（避险叙事 vs 风险资产属性）' } },
    ],
    OIL_SUPPLY_SHOCK: [
      { assetKind: 'oil', relationship: 'positive', direction: 'up', confidence: 0.88,
        evidence: { kind: 'DATA', note: '供给收缩直接推高油价' } },
      { assetKind: 'equity', relationship: 'inverse', direction: 'down', confidence: 0.5,
        evidence: { kind: 'CORRELATION', note: '成本冲击挤压利润率（进口型经济体）' } },
    ],
    SANCTIONS: [
      { assetKind: 'fx_target', relationship: 'inverse', direction: 'down', confidence: 0.7,
        evidence: { kind: 'DATA', note: '被制裁方资本外流压力' } },
      { assetKind: 'gold', relationship: 'risk_off', direction: 'up', confidence: 0.5,
        evidence: { kind: 'CORRELATION', note: '地缘升级避险' } },
    ],
    TRADE_TARIFF: [
      { assetKind: 'fx_target', relationship: 'inverse', direction: 'down', confidence: 0.6,
        evidence: { kind: 'CORRELATION', note: '贸易条件恶化压制出口型本币' } },
      { assetKind: 'equity', relationship: 'inverse', direction: 'down', confidence: 0.55,
        evidence: { kind: 'CORRELATION', note: '加征关税历史上压制双边股市（2018-19 样本）',
          historicalCases: [{ label: '中美关税周期', date: '2018-2019', move: '出口链板块跑输' }] } },
    ],
    EARTHQUAKE: [
      { assetKind: 'equity_local', relationship: 'inverse', direction: 'down', confidence: 0.45,
        evidence: { kind: 'CORRELATION', note: '灾后重建支出 vs 生产中断，短期承压为主' } },
      { assetKind: 'insurance', relationship: 'inverse', direction: 'down', confidence: 0.5,
        evidence: { kind: 'DATA', note: '赔付负债直接增加' } },
    ],
  };

  /** category 兜底映射（eventKind 未命中时给粗粒度边） */
  const CATEGORY_FALLBACK = {
    war: 'ARMED_CONFLICT', geopolitics: 'SANCTIONS', natural_disaster: 'EARTHQUAKE',
    trade: 'TRADE_TARIFF', energy: 'OIL_SUPPLY_SHOCK', central_bank: 'RATE_DECISION_HOLD',
  };

  const ASSET_SYMBOLS = {
    fx_base: (iso2) => (ImpactEngine.countryAssets(iso2).fx || null),
    fx_target: (iso2) => (ImpactEngine.countryAssets(iso2).fx || null),
    equity: (iso2) => (ImpactEngine.countryAssets(iso2).equity || null),
    equity_local: (iso2) => (ImpactEngine.countryAssets(iso2).equity || null),
    bond_yield: (iso2) => (ImpactEngine.countryAssets(iso2).bond || null),
    gold: () => 'GC00Y',
    oil: () => 'CL00Y',
    crypto: () => 'BTCUSDT',
    insurance: () => null,     // universe 暂无保险业指数，显式 null（宁缺毋假）
  };

  /**
   * Event → 影响边列表（按 confidence 降序）
   * @param {{countries:string[], categories:string[], title:string}} ev
   * @returns {import('./types.js').ImpactEdge[]}
   */
  function inferImpacts(ev) {
    const kind = eventKind(ev) || CATEGORY_FALLBACK[ev.categories[0]] || null;
    if (!kind || !RULES[kind]) return [];
    const iso2 = ev.countries[0] || null;
    const edges = [];
    for (const rule of RULES[kind]) {
      const symbol = ASSET_SYMBOLS[rule.assetKind] ? ASSET_SYMBOLS[rule.assetKind](iso2) : null;
      edges.push({
        eventKind: kind,
        assetSymbol: symbol || rule.assetKind,
        relationship: rule.relationship,
        direction: rule.direction,
        confidence: rule.confidence,
        evidence: rule.evidence,
        historicalCases: rule.evidence.historicalCases || rule.historicalCases || [],
      });
    }
    return edges.sort((a, b) => b.confidence - a.confidence);
  }

  return { eventKind, inferImpacts, countryAssets: (iso2) => (COUNTRY_ASSETS[iso2] || {}), RULES, COUNTRY_ASSETS };
})();

if (typeof window !== 'undefined') window.ImpactEngine = ImpactEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = ImpactEngine;
