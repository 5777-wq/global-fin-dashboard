/* masters.js —— 大师视角下的"具体标的具体分析"（科普层）
   三层材料，全部可溯源：
   1) 事实层：实时报价 + 日K画像（computeProfile），纯客观数据；
   2) 属性层：TARGET_PROFILES 人工维护的生意常识（商业模式/护城河/主要风险/林奇分类）；
   3) 框架层：8 位大师的公开方法论，用于"解读"事实与属性。
   铁律：只给"这个框架下怎么提问 + 事实是什么"，绝不说"应该买/卖"；
   ⚠ 数据截止：TARGET_PROFILES 属性层为人工维护的静态常识（2026-08 整理），
   公司业务结构变化后需人工更新，不随行情自动刷新。
   财务数据（ROE/PE/现金流）免费源拿不到，一律标注为"数据缺口：请翻财报"。

   analyze(target, profile) → [ { name, school, headline, points:[{k,t}], quote } ] */

const Masters = (() => {
  /* ============ 大师定义（方法论 + 名言） ============ */
  const LIST = [
    { id: 'buffett', name: '巴菲特', school: '价值投资', quote: '用合理的价格买一家优秀的公司，远胜于用便宜的价格买一家平庸的公司。', era: '1930–' },
    { id: 'munger', name: '芒格', school: '多元思维', quote: '如果我知道我会死在哪里，那我一辈子都不去那个地方。', era: '1924–2023' },
    { id: 'graham', name: '格雷厄姆', school: '安全边际', quote: '市场短期是投票机，长期是称重机。', era: '1894–1976' },
    { id: 'lynch', name: '彼得·林奇', school: '从生活发现成长', quote: '人们宁愿买自己不懂的彩票，也不愿买楼下排长队店铺的股票。', era: '1944–' },
    { id: 'soros', name: '索罗斯', school: '反身性', quote: '重要的不是你是对是错，而是你对时赚多少，错时亏多少。', era: '1930–' },
    { id: 'dalio', name: '达里奥', school: '宏观配置', quote: '分散投资是投资里唯一免费的午餐。', era: '1949–' },
    { id: 'oneil', name: '欧奈尔', school: '趋势动量', quote: '在股市里亏大钱的人，都是想「摊低成本」的人。', era: '1933–2023' },
    { id: 'livermore', name: '利弗莫尔', school: '趋势投机', quote: '华尔街没有新鲜事，因为人性永远不变。', era: '1877–1940' },
  ];

  /* ============ 标的属性表（人工维护的生意常识，与行情无关） ============
     biz: 生意本质 / moat: 护城河（或"弱"）/ g: 林奇五分类（slow稳定 steady增长 fast快速成长
          cyclical周期 turn困境反转 highyield高股息 index指数 asset资产 macro宏观）
          risk: 主要风险（芒格"反过来想"）/ reflex: 反身性/情绪属性强度 */
  const P = {
    // ---- A股指数 ----
    'sh000001': { biz: '沪市全部股票的加权成绩单', moat: '无（指数不经营）', g: 'index', risk: '权重行业（银行/白酒）失速', reflex: '高——涨时会自我强化吸引增量资金' },
    'sz399001': { biz: '深市 500 只代表股的成绩', moat: '无', g: 'index', risk: '科技权重波动放大', reflex: '高' },
    'sz399006': { biz: '创业板 100 只龙头', moat: '无', g: 'index', risk: '高估值板块杀估值', reflex: '很高' },
    'sh000688': { biz: '科创板 50 只核心', moat: '无', g: 'index', risk: '半导体单一行业集中', reflex: '很高' },
    // ---- A股权重 ----
    'sh600519': { biz: '高端白酒：品牌即定价权，先款后货的现金流机器', moat: '强——品牌护城河+成瘾性消费+产区稀缺', g: 'steady', risk: '年轻一代饮酒习惯改变、消费降级、政策限制', reflex: '中' },
    'sz300750': { biz: '全球动力电池龙头，规模+技术双壁垒', moat: '强——成本曲线最左端+深度客户绑定', g: 'fast', risk: '固态电池等技术路线切换、产能过剩价格战', reflex: '中高' },
    'sh601318': { biz: '保险+综合金融：利差与投资收益是命门', moat: '中——牌照与百万代理人渠道', g: 'cyclical', risk: '利率长期下行造成利差损、投资端踩雷', reflex: '中' },
    'sz000858': { biz: '浓香白酒龙头，与茅台同赛道第二', moat: '强品牌但弱于茅台', g: 'steady', risk: '高端酒库存与批价倒挂', reflex: '中' },
    // ---- 港股 ----
    'hkHSI': { biz: '港股大盘，中资科技权重高', moat: '无', g: 'index', risk: '美元流动性与内地基本面双杀', reflex: '高' },
    'hkHSTECH': { biz: '港股 30 只科技龙头', moat: '无', g: 'index', risk: '单一板块集中', reflex: '很高' },
    'hk00700': { biz: '微信社交生态+游戏+金融科技+云', moat: '强——13 亿人的关系链网络效应', g: 'steady', risk: '游戏版号监管、宏观拖累广告', reflex: '中' },
    'hk09988': { biz: '电商（淘宝天猫）+阿里云', moat: '中——规模与物流生态，护城河被分流中', g: 'turn', risk: '拼多多/抖音分流、云市场竞争', reflex: '中' },
    'hk03690': { biz: '外卖+到店+酒旅的本地生活网络', moat: '强——高频外卖喂养的即时配送网络', g: 'steady', risk: '京东/淘宝杀入即时零售、骑手社保成本', reflex: '中' },
    'hk00941': { biz: '运营商：庞大用户基数的现金牛', moat: '中——牌照+网络规模', g: 'highyield', risk: '提速降费政策、5G 资本开支周期', reflex: '低' },
    // ---- 美股指数 ----
    'usDJI': { biz: '美国 30 只蓝筹等权思维老指数', moat: '无', g: 'index', risk: '科技含量低，错失成长', reflex: '中' },
    'usIXIC': { biz: '以科技股为主的美国指数', moat: '无', g: 'index', risk: '对利率极度敏感', reflex: '很高' },
    'usINX': { biz: '美国 500 家大公司，全球配置基准', moat: '无', g: 'index', risk: '估值处于历史高位时的均值回归', reflex: '高' },
    // ---- 美股个股 ----
    'usAAPL': { biz: 'iPhone 生态+服务收入（订阅化的硬件公司）', moat: '强——iOS 生态转换成本', g: 'steady', risk: '创新放缓、中国市场份额流失、反垄断拆分风险', reflex: '中' },
    'usNVDA': { biz: 'AI 算力芯片霸主：本轮周期的"卖铲人"', moat: '强——CUDA 软件生态+代际领先', g: 'fast', risk: '大客户自研芯片替代、出口管制、AI 资本开支退潮', reflex: '很高——AI 叙事的核心放大器' },
    'usMSFT': { biz: '企业软件（Office）+Azure 云+AI', moat: '强——企业锁定+云规模', g: 'steady', risk: 'AI 变现不及预期、云份额战', reflex: '中' },
    'usTSLA': { biz: '电动车+自动驾驶叙事+储能', moat: '中——制造效率+超充网络+数据闭环', g: 'fast', risk: '价格战侵蚀毛利、关键人物风险、比亚迪们的围攻', reflex: '很高' },
    'usAMZN': { biz: '电商+AWS 云，利润引擎在云', moat: '强——物流网络+云规模效应', g: 'fast', risk: '零售利润率薄、云份额被咬', reflex: '中' },
    'usGOOG': { biz: '搜索广告+YouTube+云+DeepMind', moat: '强——搜索双边网络效应', g: 'fast', risk: 'AI 原生搜索替代、反垄断强制拆分', reflex: '高' },
    // ---- 外汇/商品/宏观 ----
    'EM:133.USDCNH': { biz: '人民币汇率头寸：本质是中美利差+贸易顺差的赌注', moat: '—', g: 'macro', risk: '央行干预、中美关系突变', reflex: '中' },
    'EM:119.EURUSD': { biz: '全球最大货币对，美元强弱的镜子', moat: '—', g: 'macro', risk: '欧央行与美联储政策分化超预期', reflex: '低' },
    'EM:119.GBPUSD': { biz: '英镑头寸', moat: '—', g: 'macro', risk: '英国财政与贸易条件恶化', reflex: '低' },
    'EM:119.USDJPY': { biz: '日元头寸：全球套息交易的定价锚', moat: '—', g: 'macro', risk: '日央行加息引发套息平仓踩踏', reflex: '高——平仓会自我强化' },
    'EM:119.USDHKD': { biz: '联系汇率下的窄幅震荡品种', moat: '—', g: 'macro', risk: '联系汇率制度本身承压（罕见）', reflex: '低' },
    'EM:100.UDI': { biz: '美元指数：全球流动性的总闸门读数', moat: '—', g: 'macro', risk: '—', reflex: '低' },
    'EM:101.GC00Y': { biz: '黄金：无息资产，价格由实际利率与恐惧定价', moat: '—', g: 'asset', risk: '实际利率长期走高', reflex: '高——上涨本身强化避险叙事' },
    'EM:101.SI00Y': { biz: '白银：一半金融一半工业（光伏）', moat: '—', g: 'asset', risk: '双属性共振下跌', reflex: '高' },
    'EM:101.HG00Y': { biz: '铜：全球经济体温计', moat: '—', g: 'cyclical', risk: '全球制造业衰退', reflex: '中' },
    'EM:102.CL00Y': { biz: '原油：OPEC+ 供给与全球需求的博弈', moat: '—', g: 'cyclical', risk: '需求侧衰退+供给侧增产共振', reflex: '中' },
    'EM:102.NG00Y': { biz: '天然气：区域与季节性极强的能源', moat: '—', g: 'cyclical', risk: '暖冬+库存高企', reflex: '中' },
    'EM:103.ZC00Y': { biz: '玉米：天气市农产品', moat: '—', g: 'cyclical', risk: '丰产年价格崩塌', reflex: '低' },
    'EM:171.US10Y': { biz: '美债10年收益率：全球资产定价之锚', moat: '—', g: 'macro', risk: '财政赤字与通胀粘性推高收益率', reflex: '高——与股市形成跷跷板' },
    'EM:171.US2Y': { biz: '最跟随美联储的期限', moat: '—', g: 'macro', risk: '—', reflex: '中' },
    'EM:171.US30Y': { biz: '长端利率：市场对长期通胀的定价', moat: '—', g: 'macro', risk: '期限溢价突变', reflex: '中' },
    'EM:171.CN10Y': { biz: '中国无风险利率基准', moat: '—', g: 'macro', risk: '—', reflex: '低' },
    'EM:171.DE10Y': { biz: '欧元区利率锚', moat: '—', g: 'macro', risk: '—', reflex: '低' },
    'EM:171.JP10Y': { biz: '全球最大低息资金源头', moat: '—', g: 'macro', risk: '日央行政策正常化冲击全球', reflex: '中' },
  };

  // 加密币种属性（key = base）
  const CRYPTO_P = {
    BTC: { biz: '数字黄金：2100 万枚的稀缺共识', moat: '强——最长链共识与流动性', g: 'asset', risk: '流动性危机/监管打击/共识松动', reflex: '极高' },
    ETH: { biz: '智能合约平台，加密世界的"应用商店"', moat: '中——开发者生态网络效应', g: 'fast', risk: '高性能公链分流', reflex: '极高' },
    BNB: { biz: '交易所平台币，价值与币安生态绑定', moat: '中——交易所网络效应', g: 'cyclical', risk: '交易所监管风险', reflex: '极高' },
    SOL: { biz: '高性能公链，以速度低费竞争以太坊', moat: '弱-中——性能优势可被追赶', g: 'fast', risk: '宕机史与链上活跃度萎缩', reflex: '极高' },
    XRP: { biz: '跨境支付代币', moat: '弱——支付赛道竞争者众多', g: 'cyclical', risk: '监管结果与机构采用不及预期', reflex: '极高' },
    DOGE: { biz: '模因代币：纯情绪与社区', moat: '无基本面护城河', g: 'cyclical', risk: '注意力退潮即归零风险', reflex: '极高——波动本身就是全部' },
  };

  const G_LABEL = { slow: '缓慢增长', steady: '稳定增长', fast: '快速成长', cyclical: '强周期', turn: '困境反转候选', highyield: '高股息', index: '指数', asset: '资产类', macro: '宏观变量' };
  const G_HINT = {
    slow: '这类公司的尺子是股息与现金流，别为它付成长的价',
    steady: '林奇给它的尺子：增速 10-15% 配 10-15 倍 PE 属于合理，先去查市盈率',
    fast: '林奇的尺子是 PEG（PE÷增速）<1 才划算——需要 PE 和增速两个数，行情里没有，去查',
    cyclical: '周期股别用 PE 估值——低 PE 常是周期顶，要看供需拐点',
    turn: '困境反转的关键是"困境是否见底"，赚的是预期修复的钱',
    highyield: '高股息的尺子是股息可持续性：派息率、现金流、负债',
    index: '指数不用挑公司，大师们对它的分歧最小：定投即可参与，择时是难题',
    asset: '资产类没有"生意"可分析，看的是宏观变量与资金流',
    macro: '宏观变量的对手盘是央行，散户胜率天然吃亏',
  };

  const pc = (v, d = 1) => (v > 0 ? '+' : '') + Number(v).toFixed(d);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // 现价在 52 周高低点之间的位置（0=最低 1=最高）：由距高/距低百分比推出
  function posIn52w(p) {
    if (!p || p.offHighPct === null || p.offLowPct === null) return null;
    const denom = p.offLowPct - p.offHighPct;
    if (denom <= 0) return null;
    return clamp01(p.offLowPct / denom);
  }

  /* ============ 每位大师的"标的评估器" ============
     输入 target（symbol/market/name/code）+ profile（K线画像），输出具体分析条目
     条目 k: 'fact' 客观数据 / 'view' 框架解读 / 'gap' 数据缺口（要翻财报） */
  const ANALYZERS = {
    buffett(t, p, tp) {
      const pts = [];
      if (p) pts.push({ k: 'fact', t: `近一年 ${pc(p.yearChangePct)}%，现价距一年最高 ${pc(p.offHighPct)}%、距最低 ${pc(p.offLowPct)}%。` });
      if (tp && tp.biz) {
        pts.push({ k: 'view', t: `他先问生意本身：${tp.biz}。护城河评估：${tp.moat}。` });
        if (tp.g === 'index') pts.push({ k: 'view', t: `他对普通人的著名建议恰恰是"买指数基金定期买入"，而不是挑个股——你现在看的正是他推荐的那类东西。` });
        else if (tp.g === 'fast') pts.push({ k: 'view', t: `快速成长股他并非不买（重仓过苹果），但他要求成长来自生意本身，而不是风口叙事。这个标的的成长，属于哪一种？` });
        else if (tp.g === 'cyclical' || tp.g === 'macro') pts.push({ k: 'view', t: `强周期/宏观品种他几乎不碰——理由很简单："我解释不清它明年的盈利"。他宁可错过。` });
        else if (tp.g === 'asset') pts.push({ k: 'view', t: `无现金流的资产他从不介入（黄金/加密在他眼里不生蛋）——他的世界里，资产价值来自它能产出的现金。` });
        else pts.push({ k: 'view', t: `他拿得住这类生意的前提只有一个：买价没有透支未来十年。价格是否透支，取决于你对它长期盈利的判断，而非当前涨跌。` });
      }
      pts.push({ k: 'view', t: `他会问你的最后一题：如果这个价格锁五年不能卖，你还愿意持有吗？` });
      pts.push({ k: 'gap', t: `他真正看重的 ROE、自由现金流、负债率，免费行情源拿不到——请翻财报补上这一课再做判断。` });
      return { headline: '先问生意，再问价格，最后才轮到行情屏幕。', points: pts };
    },

    munger(t, p, tp, explain) {
      const pts = [];
      if (tp && tp.risk) pts.push({ k: 'view', t: `反过来想——这门生意/资产十年后衰落的最可能路径：${tp.risk}。想清楚死法，再看活法（价格）。` });
      pts.push({ k: 'view', t: `一句话讲清测试：${explain ? '「' + explain + '」——如果你复述不出来，说明它还在你的能力圈外。' : '你能复述出来吗？讲不清就别碰。'}` });
      if (p && p.volAnnual !== null) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%。芒格的提醒：避免蠢比追求聪明重要——重仓高波动品种前，先确认这不是"为了赚快钱"的冲动。` });
      pts.push({ k: 'gap', t: `质量要靠财报验证：负债结构、资本再投资的去向，比这周的涨跌重要一个数量级。` });
      return { headline: '宁要模糊的正确，不要精确的错误；反过来想，总是反过来想。', points: pts };
    },

    graham(t, p) {
      const pts = [];
      if (p) {
        const pos = posIn52w(p);
        pts.push({ k: 'fact', t: `现价处于 52 周区间的 ${pos === null ? '--' : Math.round(pos * 100) + '%'} 位置（高 ${p.high52w?.toFixed(2)} / 低 ${p.low52w?.toFixed(2)}）。` });
        if (pos !== null) {
          pts.push({ k: 'view', t: pos > 0.7
            ? `贴近区间顶部——市场先生此刻很乐观。对他而言这里没有安全边际可言：折扣来自价格与保守估值的差距，而不是趋势的强势。`
            : pos < 0.3
              ? `靠近区间底部——便宜了，但他的第一问是"公司本身变坏了吗"。价格便宜不等于值得买，烟蒂也可能着火。`
              : `区间中部——他此刻大概率只是在观察。安全边际要的是"五毛买一块"，而不是"比昨天便宜"。` });
        }
        if (p.volAnnual !== null) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%——这是"市场先生"情绪强度的计量。波动不是风险，把波动当风险才是。` });
      }
      pts.push({ k: 'gap', t: `保守估值（净流动资产/盈利倍数下限）必须自己算——需要财报，行情软件给不了。` });
      return { headline: '把股票当公司的所有权，价格是别人情绪的报价。', points: pts };
    },

    lynch(t, p, tp) {
      const pts = [];
      const g = tp && tp.g;
      if (g) {
        pts.push({ k: 'view', t: `林奇分类法：这是「${G_LABEL[g]}」类型。${G_HINT[g]}。` });
      }
      if (p) pts.push({ k: 'fact', t: `近一年 ${pc(p.yearChangePct)}%，年化波动 ${p.volAnnual === null ? '--' : p.volAnnual.toFixed(0) + '%'}。` });
      if (tp && tp.biz) pts.push({ k: 'view', t: `他的选股线索常在生活里：${tp.biz}。你或你身边的人，用得到它的产品/服务吗？用得爽吗？这是他的第一手调研。` });
      if (g === 'index') pts.push({ k: 'view', t: `他对普通人的建议最简单：买指数基金，然后别看盘。分散在 500 家公司里，睡得着觉。` });
      pts.push({ k: 'gap', t: `他最依赖的 PEG 需要市盈率与增速——行情源没有这两个数，投资前自己查。` });
      return { headline: '买你真正了解的公司，用对类型的尺子量它。', points: pts };
    },

    soros(t, p, tp) {
      const pts = [];
      const reflexive = !tp || (tp.reflex && /很高|极高/.test(tp.reflex));
      if (p) {
        pts.push({ k: 'fact', t: `近一年 ${pc(p.yearChangePct)}%，距一年最高 ${pc(p.offHighPct)}%。` });
        if (p.yearChangePct > 30 && reflexive) pts.push({ k: 'view', t: `这个涨幅里，基本面改善和"越涨越有人信"的自我强化各占几成？——反身性品种的涨势会自己喂养自己，直到喂不动。` });
        if (p.yearChangePct < -30) pts.push({ k: 'view', t: `深跌之后他反而会问：下跌本身是否也在制造下跌（强平/赎回循环）？反身性两个方向都成立。` });
      }
      pts.push({ k: 'view', t: `他的核心纪律：重要的不是方向对错，而是对时赚多少、错时亏多少。进场前先写好两行字——"我错在哪、亏多少离场"。` });
      if (tp && tp.reflex && tp.reflex !== '低' && tp.reflex !== '—') pts.push({ k: 'view', t: `情绪属性：${tp.reflex}。识别你此刻处于强化循环的哪一段，比预测终点现实得多。` });
      return { headline: '价格不只是反映现实，还会反过来改变现实。', points: pts };
    },

    dalio(t, p, tp) {
      const m = t.market;
      const role = m === 'crypto' ? '极端波动资产——他的全天候组合里这类资产的配置是零。它只能用"全亏也不影响生活"的那部分钱'
        : m === 'commodity' || (t.symbol || '').includes('GC') ? '对冲与分散工具——黄金在他的框架里是组合的保险，不是进攻头寸'
          : m === 'macro' || m === 'fx' ? '宏观头寸：本质是押注利率/通胀/利差的方向'
            : '单一公司股票——他先问你的组合：这一类资产（同一国家、同一行业）已经占了多少？';
      const pts = [{ k: 'view', t: `先看组合再看标的：${role}。` }];
      if (p && p.volAnnual !== null && p.volAnnual > 40) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%——单个标的的波动就足以扰动整个组合，仓位比选股重要。` });
      pts.push({ k: 'view', t: `他会问的宏观题：什么环境会让这笔投资很难受？（利率上行？衰退？通胀反弹？）现在离那种环境有多远？` });
      pts.push({ k: 'view', t: `他的原则：与其预测，不如配置——让组合在几种宏观情景下都"不死"。` });
      return { headline: '经济像机器，周期有规律；押注单一方向是赌博，配置才是投资。', points: pts };
    },

    oneil(t, p) {
      const pts = [];
      if (p) {
        if (p.aboveMA60 !== null) pts.push({ k: 'fact', t: `趋势位置：现价${p.aboveMA60 ? '站上' : '跌破'} 60 日线${p.aboveMA20 === null ? '' : p.aboveMA20 ? '，且在 20 日线上方（短期强势）' : '，且在 20 日线下方（短期走弱）'}。` });
        if (p.offHighPct !== null) {
          pts.push({ k: 'fact', t: `距一年新高 ${pc(p.offHighPct)}%。` });
          pts.push({ k: 'view', t: p.offHighPct > -5
            ? `贴近新高——CANSLIM 的经典买点就是"放量突破一年新高的强者"。但注意：他同时要求紧止损，突破失败立刻离场。`
            : p.offHighPct > -15
              ? `半山腰——既不是他的买点（等放量创新高），更不是抄底对象。`
              : `深度回撤中——这在他的体系里是绝对的禁区：他从不抄底，只买强者。` });
        }
        if (p.volAnnual !== null) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%${p.volAnnual > 50 ? '——高波动品种，他的 -7~8% 止损纪律在这种票上是保命绳' : ''}。` });
      } else {
        pts.push({ k: 'view', t: `他的体系全部建立在价格与成交量上：买接近一年新高的强者，跌 7-8% 无条件止损，绝不摊低成本。` });
      }
      return { headline: '强者恒强：买创新高，不抄底；止损如呼吸，不商量。', points: pts };
    },

    livermore(t, p) {
      const pts = [];
      if (p && p.aboveMA60 !== null && p.aboveMA20 !== null) {
        const state = p.aboveMA20 && p.aboveMA60 ? '多头排列（20 日与 60 日线都在脚下）——顺趋势者的区域'
          : !p.aboveMA20 && !p.aboveMA60 ? '空头排列——他的规则里这里只属于做空者或空仓者'
            : '均线纠缠——趋势不明，他的做法是不做';
        pts.push({ k: 'fact', t: `趋势状态：${state}。` });
      }
      pts.push({ k: 'view', t: `他只在"关键点"出手（突破确认位），且进场前止损单已经挂好。对他而言：没有止损位的交易等于没有交易。` });
      if (p && p.volAnnual !== null && p.volAnnual > 50) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%——他一生的教训：这样的品种，仓位就是生命线，四次破产都源于重仓硬扛。` });
      pts.push({ k: 'view', t: `他的另一条铁律适合此刻贴在屏幕上：市场永远在，机会永远有；亏钱最快的方式，是急着把钱赚回来。` });
      return { headline: '趋势一旦形成不会轻易改变；错了立刻走，对了拿得住。', points: pts };
    },
  };

  /* ============ 组装：给具体标的具体分析 ============ */
  function analyze(target, profile) {
    const sym = target.symbol || '';
    const base = String(target.code || target.name || '').toUpperCase().replace(/USDT$/, '');
    const tp = P[sym] || CRYPTO_P[base] || null;
    const explainText = (window.Explain && window.Explain.of(target) || {}).text || null;

    return LIST.map(m => {
      const r = ANALYZERS[m.id](target, profile, tp, explainText);
      return Object.assign({ name: m.name, school: m.school, quote: m.quote, era: m.era }, r);
    });
  }

  /* ============ 画像计算（原有） ============ */
  function computeProfile(klines) {
    if (!Array.isArray(klines) || klines.length < 30) return null;
    const closes = klines.map(k => k.close).filter(c => c !== null && !isNaN(c) && c > 0);
    if (closes.length < 30) return null;
    const last = closes[closes.length - 1];
    const win = closes.slice(-Math.min(243, closes.length));
    const yearAgo = win[0];
    const high = Math.max(...win);
    const low = Math.min(...win);

    let vol = null;
    if (win.length >= 31) {
      const rets = [];
      for (let i = 1; i < win.length; i++) rets.push(Math.log(win[i] / win[i - 1]));
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const varr = rets.reduce((s, r) => s + (r - mean) * (r - mean), 0) / rets.length;
      vol = Math.sqrt(varr) * Math.sqrt(243) * 100;
    }

    const ma = (n) => {
      if (closes.length < n) return null;
      const arr = closes.slice(-n);
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };

    return {
      points: closes.length,
      yearChangePct: (last / yearAgo - 1) * 100,
      offHighPct: (last / high - 1) * 100,
      offLowPct: (last / low - 1) * 100,
      volAnnual: vol,
      ma20: ma(20), ma60: ma(60),
      aboveMA20: ma(20) !== null ? last > ma(20) : null,
      aboveMA60: ma(60) !== null ? last > ma(60) : null,
      high52w: high, low52w: low,
    };
  }

  function profileNotes(p) {
    if (!p) return [];
    const notes = [];
    notes.push(`近一年${p.yearChangePct >= 0 ? '上涨' : '下跌'} ${Math.abs(p.yearChangePct).toFixed(1)}%——过去的表现，不代表未来。`);
    return notes;
  }

  return { LIST, computeProfile, analyze, P, CRYPTO_P, G_LABEL, posIn52w };
})();

window.Masters = Masters;
