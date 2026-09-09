/* masters.js —— 大师视角下的"具体标的具体分析"（科普层）
   三层材料，全部可溯源：
   1) 事实层：实时报价 + 日K画像（computeProfile），纯客观数据；
   2) 属性层：TARGET_PROFILES 人工维护的生意常识（商业模式/护城河/主要风险/林奇分类）；
   3) 框架层：8 位大师的公开方法论，用于"解读"事实与属性。
   铁律：只给"这个框架下怎么提问 + 事实是什么"，绝不说"应该买/卖"；
   ★ 反模板铁律（2026-09）：每条分析必须携带本标的的专属内容——
   画像数字（近一年/距高点/回撤/波动/均线偏离/高点距今）或属性表字段（biz/moat/risk/g/reflex），
   禁止跨标的复读的哲学口号；headline 由数据条件动态生成。
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
     条目 k: 'fact' 客观数据 / 'view' 框架解读 / 'gap' 数据缺口（要翻财报）
     铁律：每条必须含"本标的专属"内容——画像数字或属性表字段，禁止跨标的复读的口号；
     headline 由数据条件动态生成，不用固定格言。 */
  const GAP = {
    stock: (who) => `决定下一步的证据只在财报里：${who === '巴菲特' ? 'ROE 是否常年 >12%、自由现金流是否为正、有息负债多重' : who === '芒格' ? '负债结构、资本再投资的去向、管理层历史失信记录' : who === '格雷厄姆' ? '净流动资产、市盈率与市净率的历史分位' : who === '彼得·林奇' ? '机构持仓比例、内部人增减持、公司回购' : '盈利质量、现金流与负债'}——行情软件给不了，一条条查。`,
    index: (who) => `指数没有财报可翻，${who === '格雷厄姆' ? '要看的是估值分位——低于历史 30% 分位才算进入他的兴趣区' : who === '巴菲特' ? '这页行情给不了的是成分股盈利趋势与估值分位，查到再下结论' : '要查的是估值分位与成分盈利趋势'}。`,
    asset: () => `无息资产没有账本可查：它的全部"基本面"就是实际利率与资金流数据——查这两个，别看图。`,
    macro: () => `宏观品种的"财报"是央行：议息日程、政策红线、持仓调查——这些日期比任何技术位都硬。`,
  };

  const ANALYZERS = {
    buffett(t, p, tp) {
      const pts = [];
      const g = tp && tp.g;
      const kind = g === 'index' ? 'index' : (g === 'asset' || g === 'macro') ? g : 'stock';
      if (p) pts.push({ k: 'fact', t: `近一年 ${pc(p.yearChangePct)}%，现价距 52 周高点 ${pc(p.offHighPct)}%、距低点 ${pc(p.offLowPct)}%——他只关心价格相对"这门生意值多少钱"的折溢价，一年的走势不在他的公式里。` });
      if (tp && tp.biz && kind === 'stock') pts.push({ k: 'view', t: `生意本身：${tp.biz}。护城河这一关他给不给过：${tp.moat}。` });
      if (g === 'index') pts.push({ k: 'view', t: `他给普通人的著名建议恰是你屏幕上这类东西：低成本指数基金、定期买、别择时——"不选股"本身就是他的选股答案。` });
      else if (g === 'fast') pts.push({ k: 'view', t: `他重仓过苹果，证明成长股不是禁区——前提是成长来自生意本身（客户、利润、复购），而非风口叙事。这只的成长属于哪一种，只有你能回答。` });
      else if (g === 'cyclical' || g === 'macro') pts.push({ k: 'view', t: `强周期与宏观品种他几乎全避——"我解释不清它明年的盈利"。为此错过的比躲过的多，他不在乎。` });
      else if (g === 'asset') pts.push({ k: 'view', t: `不产生现金流的资产在他的框架里没有价值锚：资产的价值=它未来能吐出的现金。这只"蛋"不存在，他直接放弃评估。` });
      pts.push({ k: 'gap', t: GAP[kind]('巴菲特') });
      let head = '先确认生意看得懂，再确认价格没透支——顺序不能颠倒。';
      if (g === 'index') head = '他给普通人的答案就是你正在看的东西：低成本、定投、别看盘。';
      else if (g === 'asset') head = '不生蛋的资产他不评估——"放弃"本身就是结论。';
      else if (g === 'macro' || g === 'cyclical') head = '解释不清明年盈利的东西，他宁可全错过。';
      else if (p && p.offHighPct < -25) head = '价格先跌出了安全感——但生意是否也一起变坏了？只有财报能回答。';
      return { headline: head, points: pts };
    },

    munger(t, p, tp, explain) {
      const pts = [];
      if (tp && tp.risk) pts.push({ k: 'view', t: `反过来想——它十年后怎么死？最可能的路径：${tp.risk}。想清楚死法，再谈活法（价格）。` });
      pts.push({ k: 'view', t: `能力圈测试：把${explain ? '「' + explain + '」' : '这门生意'}一句话讲给外行听。讲不顺 = 还在圈外，圈外不下注。` });
      if (p && p.volAnnual !== null) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%、年内最大回撤 ${pc(p.maxDDPct)}%——先确认这个量级的回撤不影响你的睡眠和生活，这是他说的"避免蠢"的量化版。` });
      pts.push({ k: 'gap', t: GAP[tp && tp.g === 'index' ? 'index' : (tp && (tp.g === 'asset' || tp.g === 'macro')) ? tp.g : 'stock']('芒格') });
      let head = '宁要模糊的正确，不要精确的错误；反过来想，总是反过来想。';
      if (tp && tp.risk) head = `先排除"${tp.risk.split('、')[0].split('，')[0]}"这个死法，再谈收益。`;
      else if (p && p.volAnnual !== null && p.volAnnual > 50) head = `年化波动 ${p.volAnnual.toFixed(0)}% 的东西，先用小仓证明自己拿得住。`;
      return { headline: head, points: pts };
    },

    graham(t, p, tp) {
      const pts = [];
      const kind = tp && (tp.g === 'index' || tp.g === 'asset' || tp.g === 'macro') ? tp.g : 'stock';
      let pos = null;
      if (p) {
        pos = posIn52w(p);
        pts.push({ k: 'fact', t: `现价处于 52 周区间 ${pos === null ? '--' : Math.round(pos * 100) + '%'} 分位（高 ${p.high52w?.toFixed(2)} / 低 ${p.low52w?.toFixed(2)}），年化波动 ${p.volAnnual === null ? '--' : p.volAnnual.toFixed(0) + '%'}——后者就是"市场先生"的情绪强度计。` });
        if (pos !== null) {
          pts.push({ k: 'view', t: pos > 0.7
            ? `贴近区间顶部：市场先生正乐观，此处他毫无兴趣出手——折扣必须来自价格与保守估值的差距，而不是趋势的强势。`
            : pos < 0.3
              ? `接近区间底部：便宜引起了他的注意，但第一问是"公司本身变坏了吗"——烟蒂也可能着火。`
              : `区间中部：他此刻大概率只在观察。安全边际要"五毛买一块"，"比昨天便宜"不算数。` });
        }
      }
      pts.push({ k: 'gap', t: GAP[kind]('格雷厄姆') });
      let head = '把股票当公司的所有权，把报价当别人情绪的出价。';
      if (pos !== null) head = pos > 0.7 ? '市场先生在报高价——他的纪律是此时只等，不追。'
        : pos < 0.3 ? '报价进入了他的兴趣区：先验尸，再捡烟蒂。'
        : '安全边际是等出来的，不是追出来的。';
      return { headline: head, points: pts };
    },

    lynch(t, p, tp) {
      const pts = [];
      const g = tp && tp.g;
      const yr = p ? `近一年 ${pc(p.yearChangePct)}%` : '近期涨跌';
      const BY_G = {
        slow: `缓增型（${G_LABEL.slow}）：尺子是股息与负债，不是涨幅。${yr}的波动与此无关——把它当"会分红的债券"来审。`,
        steady: `稳定增长型：经验法则是 10-15% 的增速配 10-15 倍 PE。注意：${yr}是股价不是盈利增速，两本账别混。`,
        fast: `快速成长型：他的尺子是 PEG（PE÷增速）<1。PE 和增速行情都给不了——${yr}只是价格波动，PEG 得自己查财报算。`,
        cyclical: `周期型：低 PE 常是周期顶的陷阱。判断位置别看 K 线（${yr}），去看产品价格与库存所处阶段。`,
        turn: `困境反转型：赚的是预期修复。${yr}里已定价了一部分修复——"困境是否见底"要用现金流拐点确认，不能用涨幅确认。`,
        highyield: `高股息型：股息可持续性三件套——派息率、经营现金流、负债率。${yr}的涨跌与股息安全毫无关系。`,
        index: `指数：他对普通人的最简建议——买下它，然后别看盘。`,
        asset: `这一类不在他的射程：他只分析"能走进去的生意"。`,
        macro: `这一类不在他的射程：他只分析"能走进去的生意"。`,
      };
      if (g) pts.push({ k: 'view', t: BY_G[g] });
      if (p) pts.push({ k: 'fact', t: `最近 20 个交易日 ${p.mom20Pct === null ? '--' : pc(p.mom20Pct)}%，年化波动 ${p.volAnnual === null ? '--' : p.volAnnual.toFixed(0) + '%'}——短期波动是噪音，他让你盯的是十年后。` });
      if (tp && tp.biz && g !== 'index' && g !== 'asset' && g !== 'macro') pts.push({ k: 'view', t: `他的第一手调研从生活开始：${tp.biz}——你或身边人用得到它吗？用得爽吗？答不上来就先去体验一次。` });
      pts.push({ k: 'gap', t: g === 'index' || g === 'asset' || g === 'macro' ? GAP[g]('彼得·林奇') : `他的清仓预警是"机构扎堆、内部人停止增持"——持仓数据行情源没有，去查。` });
      const HEAD = { slow: '把它当债券审：分红与负债是全部考题。', steady: '先分类，再用对应的尺子量——尺子错了全错。', fast: '成长股的尺子是 PEG：先把两个数查齐再回来。', cyclical: '别用市盈率读周期股，去读产品价格。', turn: '反转的钱赚在预期修复：确认见底再谈其他。', highyield: '股息的尺子是现金流，不是涨跌幅。', index: '最省心的持有方式：买下它，然后别看盘。', asset: '走进不去的生意，他直接放弃。', macro: '走进不去的生意，他直接放弃。' };
      return { headline: g ? HEAD[g] : '先去搞清它靠什么赚钱，再谈别的。', points: pts };
    },

    soros(t, p, tp) {
      const pts = [];
      const reflexive = !tp || (tp.reflex && /很高|极高/.test(tp.reflex));
      if (p) pts.push({ k: 'fact', t: `近一年 ${pc(p.yearChangePct)}%，52 周高点出现在 ${p.barsSinceHigh} 个交易日前，期间最大回撤 ${pc(p.maxDDPct)}%。` });
      if (p && p.yearChangePct > 25 && reflexive) {
        pts.push({ k: 'view', t: p.barsSinceHigh <= 10
          ? `新高就在十个交易日内："越涨越有人信"的强化循环大概率仍在续期——他的问题从来不是涨到哪，而是循环会在哪一段断掉。`
          : `高点已过去 ${p.barsSinceHigh} 个交易日、年内仍涨 ${pc(p.yearChangePct)}%——强化循环断过一次又续上了？这种二次探顶是他最警惕的形态。` });
      } else if (p && p.yearChangePct < -25) {
        pts.push({ k: 'view', t: `深跌会自己制造深跌：亏损触发赎回与强平，抛压再砸出新低。他不问"跌够了没"，只问强平循环断了没——断了，反身性才会掉头。` });
      } else if (p) {
        pts.push({ k: 'view', t: `年涨跌仅 ${pc(p.yearChangePct)}%、最大回撤 ${pc(p.maxDDPct)}%：大循环尚未启动。他此刻在等的是"错了损失有限、对了空间很大"的不对称时机，不是方向观点。` });
      }
      if (tp && tp.reflex && tp.reflex !== '低' && tp.reflex !== '—') pts.push({ k: 'view', t: `它的情绪属性被标为"${tp.reflex}"——这是他决定参与还是围观的依据：反身性越强，仓位纪律越要先行于观点。` });
      if (!pts.length) pts.push({ k: 'view', t: `价格不只是反映现实，还会反过来改变现实——先找它在强化循环里的位置，再谈方向。` });
      let head = '没有反身性大循环时，他宁愿旁观。';
      if (p && p.yearChangePct > 25 && reflexive) head = '涨势在自我喂养——识别循环位置，比预测顶部现实。';
      else if (p && p.yearChangePct < -25) head = '下跌也在自我强化——问循环断没断，不问跌够没。';
      return { headline: head, points: pts };
    },

    dalio(t, p, tp) {
      const m = t.market;
      const isGold = (t.symbol || '').includes('GC') || m === 'commodity';
      const role = m === 'crypto' ? '极端波动资产：他的全天候组合里这类配置是零——只能用"全亏也不影响生活"的那部分钱装它'
        : isGold ? '对冲工具：黄金在他的框架里是组合的保险单，不是进攻头寸——买它之前先写下它要对冲什么'
          : (m === 'macro' || m === 'fx') ? '宏观头寸：本质是押注两国利差/通胀差的方向，对手盘是两国央行'
            : '单一公司股票：他先问你的组合——同一国家、同一行业的敞口已经占了多少？';
      const pts = [{ k: 'view', t: `组合视角先行：${role}。` }];
      if (p && p.volAnnual !== null) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%、年内最大回撤 ${pc(p.maxDDPct)}%——这两个数决定它在你组合里的仓位上限，与"看好不看好"无关。` });
      pts.push({ k: 'view', t: m === 'crypto'
        ? '他会问的难受场景：流动性收紧时加密与成长股同跌。你的组合能否承受两者同时腰斩？答不了就减仓位，而不是减顾虑。'
        : isGold ? '保险的保费是机会成本：实际利率长期上行时黄金会失色——写下这个反方场景，才算配过"险"。'
          : (m === 'macro' || m === 'fx') ? '先看政策日程再谈图形：议息会议、干预红线——这些日期比任何技术位都硬。'
            : `与其预测下一场危机，不如让组合在利率上行、衰退、通胀反弹三种情景下都"不死"——这笔仓位帮它做到吗？` });
      let head = '先看组合，再看标的——别把重复下注当分散。';
      if (m === 'crypto') head = '全天候组合装不下它：用"全亏也不心疼"的那部分钱。';
      else if (isGold) head = '它是组合的保险，不是进攻头寸。';
      else if (m === 'macro' || m === 'fx') head = '这是宏观头寸：真正的对手盘是央行。';
      return { headline: head, points: pts };
    },

    oneil(t, p) {
      const pts = [];
      if (p) {
        if (p.aboveMA20 !== null) pts.push({ k: 'fact', t: `距 52 周新高 ${pc(p.offHighPct)}%（高点在 ${p.barsSinceHigh} 个交易日前）；现价位于 20 日线${p.aboveMA20 ? '上' : '下'}方 ${Math.abs(p.ma20OffPct).toFixed(1)}%、60 日线${p.aboveMA60 ? '上' : '下'}方 ${Math.abs(p.ma60OffPct).toFixed(1)}%。` });
        if (p.offHighPct !== null) {
          pts.push({ k: 'view', t: p.offHighPct > -5
            ? `贴近新高——CANSLIM 的经典买点就是"放量突破一年新高的强者"。他同时要求紧止损：突破失败立即离场，止损位进场前就定好。`
            : p.offHighPct > -15
              ? `半山腰——不是他的买点（他在等放量创新高），更不是抄底对象：他的操作清单里没有"低吸"这个动作。`
              : `距高点 ${pc(p.offHighPct)}% 的深度回撤——他的体系里这是绝对禁区：他从不抄底，只买强者，弱者再便宜也不看。` });
        }
        if (p.volAnnual !== null && p.volAnnual > 50) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%——这种票上，-7~8% 止损不是纪律是保命绳：波动越大，止损越要机械。` });
      } else {
        pts.push({ k: 'view', t: `他的体系全部建立在价格与成交量上：买接近一年新高的强者，跌 7-8% 无条件离场，绝不摊低成本。` });
      }
      let head = '半山腰既不是买点也不是抄底点——他的答案是等。';
      if (p && p.offHighPct > -5 && p.aboveMA60) head = '贴近新高 + 趋势向上：他的体系里唯一可操作的区域。';
      else if (p && p.offHighPct < -15) head = `深度回撤 ${pc(p.offHighPct)}%：他的铁律是绝不抄底。`;
      return { headline: head, points: pts };
    },

    livermore(t, p) {
      const pts = [];
      let structure = null;
      if (p && p.aboveMA20 !== null && p.aboveMA60 !== null) {
        structure = p.aboveMA20 && p.aboveMA60 ? 'bull' : (!p.aboveMA20 && !p.aboveMA60) ? 'bear' : 'mix';
        pts.push({ k: 'fact', t: `现价位于 20 日线${p.aboveMA20 ? '上' : '下'}方 ${Math.abs(p.ma20OffPct).toFixed(1)}%、60 日线${p.aboveMA60 ? '上' : '下'}方 ${Math.abs(p.ma60OffPct).toFixed(1)}%——${structure === 'bull' ? '多头排列' : structure === 'bear' ? '空头排列' : '均线纠缠'}。` });
        pts.push({ k: 'view', t: structure === 'bull'
          ? `趋势在他的定义里成立：他要的不是追价，而是等回撤到"关键点"（前突破位）再出手，止损单进场前已挂好。`
          : structure === 'bear'
            ? `他的规则里，空头排列只属于做空者与空仓者——做多者此刻的正确动作是等待，不是预测。`
            : `均线纠缠 = 趋势不明 = 他休息。他一生的大亏，大多来自"没有趋势也要交易"的日子。` });
      }
      if (p && p.volAnnual !== null && p.volAnnual > 50) pts.push({ k: 'fact', t: `年化波动 ${p.volAnnual.toFixed(0)}%：他四次破产换来的教训——这种品种上仓位是唯一的生命线，判断再对也救不了重仓硬扛。` });
      if (!pts.length) pts.push({ k: 'view', t: `他只在关键点出手，且进场前止损单已挂好：没有止损位的交易，等于没有交易。` });
      const head = structure === 'bull' ? '趋势成立：等回撤到关键点，不追价。'
        : structure === 'bear' ? '空头排列：他的答案只有做空与空仓。'
        : structure === 'mix' ? '无趋势即无交易——他此刻在休息。'
        : '关键点之外不下单，止损单先于仓位。';
      return { headline: head, points: pts };
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

    // 年内最大回撤 / 高点距今交易日 / 20 日动量：大师分析的具体数字弹药
    let peak = win[0], maxDD = 0, hiIdx = 0;
    for (let i = 0; i < win.length; i++) {
      if (win[i] > peak) { peak = win[i]; hiIdx = i; }
      const dd = win[i] / peak - 1;
      if (dd < maxDD) maxDD = dd;
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
      maxDDPct: maxDD * 100,                       // 窗口内最大峰谷回撤（≤0）
      barsSinceHigh: win.length - 1 - hiIdx,       // 距 52 周高点过了多少个交易日
      mom20Pct: closes.length > 20 ? (last / closes[closes.length - 21] - 1) * 100 : null,
      ma20: ma(20), ma60: ma(60),
      ma20OffPct: ma(20) !== null ? (last / ma(20) - 1) * 100 : null,
      ma60OffPct: ma(60) !== null ? (last / ma(60) - 1) * 100 : null,
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
