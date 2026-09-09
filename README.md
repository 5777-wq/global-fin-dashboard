<div align="center">

# 🔭 OpenFinLens

**把散落在一堆免费接口里的全球行情，聚成一屏可读的看板。**
*Global markets, scraped from a pile of free public APIs, distilled into one readable pane.*

**[线上体验 · Live Demo →](https://5777-wq.github.io/openfinlens/)**

![no build](https://img.shields.io/badge/build-none-000?style=flat-square)
![no npm](https://img.shields.io/badge/dependencies-0-000?style=flat-square)
![no backend](https://img.shields.io/badge/backend-none-000?style=flat-square)
![tests](https://img.shields.io/badge/tests-122_passing-2ebd85?style=flat-square)
![no keys](https://img.shields.io/badge/API_keys-0-000?style=flat-square)

</div>

---

## 这是什么 · What is this

一个单文件够不着、框架配不上的金融看板：A股 5000+ 只全市场热力图、三大市场情绪温度计、
K 线 + 技术面、产业链图谱、板块新闻、世界经济仪表盘——全部数据在**你的浏览器里**直连免费公开接口抓取。
没有服务器，没有数据库，没有 `node_modules` 黑洞。克隆下来，双击 `index.html`，它就活了。

> A financial dashboard that refuses to have a build step: vanilla HTML/CSS/JS, zero dependencies
> (one vendored charting lib), zero API keys, everything fetched client-side from free public endpoints.
> Clone it, double-click `index.html`, done.

## 快速开始 · Quick start

```bash
git clone https://github.com/5777-wq/openfinlens.git
cd openfinlens
# 方式一：直接双击 index.html（所有数据源 CORS 全通，file:// 也能跑）
# 方式二：本地服务器
python -m http.server 8765   # → http://127.0.0.1:8765
```

## 都有什么 · Features

| | 功能 | 说明 |
|---|---|---|
| 🖥️ | **行情总览** | 8 大品类 47 个核心标的，10s 轮询，红涨绿跌可切换（全球市场 hero + 六大指数卡：日·德·英·法·韩·印，带国旗） |
| 🔥 | **全市场热力图** | A股 ~5500 只 + 加密 80 币，手写 squarify + canvas；滚轮以光标为锚缩放、拖拽平移、双指捏合、右键复位 |
| 📈 | **K线详情** | 分时/日/周/**月**，成交量副图，MA5/10/20/60 + EMA12/26 六线自由开关（localStorage 记忆） |
| 🧪 | **技术面面板** | RSI(14) · MACD(12,26,9) · KDJ(9,3,3) · BOLL(20,2) · ATR(14) · 量比 · 均线排列——每条都是日K手算，附常用读法，绝不荐股 |
| 🌡️ | **市场宽度 ×3** | A股（~5500 只）/ 美股（~13800 只全量）/ 加密（80 对）三块情绪温度计，涨跌家数、七段分布、A股含涨跌停分板判定 |
| 🗺️ | **产业链图谱** | 10 条链 · 49 个环节 · 163 只成分股（逐一实测代码），环节强度 = 成分股涨跌幅实时均值 |
| 📡 | **今日热门概念** | 东财 500+ 概念板块实时涨幅榜 → 命中人工链条直接跳转，未命中展开领涨成分股兜底 |
| 📰 | **板块新闻 + 大V喊单** | 新闻按产业链板块分类过滤；马斯克/特朗普/黄仁勋/奥尔特曼等 10 人发言动向聚合（新闻口径，诚实标注） |
| 🌍 | **世界经济仪表盘** | 世界银行 API：美中日德英法印韩 × GDP/增长/通胀/失业/债务/经常账户，列内色阶热图 |
| ⭐ | **自选 + 搜索** | 跨市场收藏（localStorage）、组合概览、按涨跌幅排序；搜索支持中文/代码/拼音 |
| ⌨️ | **细节** | 市场时段徽章（夏令时正确）、hash 深链、键盘 1-9/0 切 tab、`/` 搜索、`Backspace` 返回、开屏真实进度条 |

## 它怎么工作 · How it works

```
浏览器（纯客户端）
├── sources/  每类数据一个适配器，统一输出 Quote 结构
│     主源 ──失败──▶ 备源 ──失败──▶ localStorage 缓存（带时间戳）
│                                    │
├── app.js    轮询调度（setTimeout 链）→ 增量 patch DOM，不整墙重建
├── treemap/charts/technical  纯函数计算层，全部可单测
└── 永不白屏：任何一层挂掉都是"降级角标 + 旧数据/骨架"，绝无弹窗报错
```

*Every data category goes through an adapter chain: primary → fallback → cached, with a tiny
badge telling you when you're not looking at live data. The scheduler is a `setTimeout` chain,
DOM updates are incremental patches, and nothing ever throws a blank screen at you.*

## 数据源 · Data sources（全部免密钥）

| 品类 | 主源 | 备源 | 兜底 |
|---|---|---|---|
| A股 / 港股 / 美股 / 全球指数 | 腾讯 `qt.gtimg.cn`（GBK） | 东财 `push2delay` | 缓存 |
| A股全市场（热力图/宽度） | 东财 `clist` 分页并发 | 腾讯精选 | 缓存 |
| 美股全市场（宽度） | 东财 `m:105,106,107`（~13800 只全量） | — | 缓存 5min |
| 加密 | 币安 `data-api.binance.vision` | OKX | 缓存 |
| 外汇 / 商品 / 国债收益率 | 东财 secid（119/133、101-103、171） | 新浪（需代理） | 缓存 |
| K线 / 分时 | 腾讯 `ifzq`（前复权） | 东财 → 空态 | 不白屏 |
| 概念板块榜 / 成分股 | 东财 `clist`（`m:90+t:3` / `b:BKxxxx`） | — | 隐藏榜单 |
| 新闻 | 新浪 roll（JSONP） | 东财 `np-listapi` | 缓存 60s |
| 宏观年度指标 | 世界银行 `api.worldbank.org` | — | 缓存 24h |
| 搜索 | 东财 searchapi（中文/代码） | codetable（拼音） | 空态 |

## 踩坑实录 · Field notes

这些坑都是逐个接口 curl 出来的，写在这里省下下一个人的一个下午：

- 东财 `push2/push2his` 直连不可达 → 用 `push2delay` 镜像（带 CORS）；但它**不存历史 K 线**（`klines` 恒空），
  外汇/商品的日K 至今没有免费直连源——详情页对这些品类诚实显示空态。
- `pz=6000` 会被截断成 100：全市场抓取是 56 页分页并发 + 盘中按代码去重（排序分页时个股会位移）。
- 美股 K线必须用带交易所后缀的代码（`usAAPL.OQ`），裸代码只回 2 根脏数据——已自动补后缀重试。
- 新浪 JSONP 的回调名**不能以下划线开头**（`callback illegal character`）；东财新闻必须带 `req_trace` 参数。
- 深夜清算时段东财把涨跌幅回成 `"-"` 字符串：按数值过滤会把全市场清空，必须允许缺失（显示 `--`）。
- 美股宽度必须**全量抓 13800 只**：按涨跌幅排序分页只取前段，统计的是"跌幅榜"不是市场。

## 家规 · House rules

这份代码有几条雷打不动的自律（也解释了为什么它长得这样）：

1. **不用 `setInterval`**——调度走 `setTimeout` 链，动画走 `requestAnimationFrame`；
2. **不动画 `width/height/top/left/box-shadow`**——只碰 `transform/opacity/color`，让合成器干活；
3. **前端零 API key**——拿不到免费数据的（如 FRED）宁可隐藏也不塞密钥；
4. **数据失败不是错误**——降级链 + 角标，用户永远看得见一块能看的屏幕；
5. **只描述事实，不荐股**——技术面和情绪面板全是统计口径，一个"买入"都不说。

## 自己部署一份 · Deploy your own

1. GitHub 新建公开仓库；
2. `git push` 上去；
3. Settings → Pages → Source 选 `Deploy from a branch`（`main` / root）→ Save。

一分钟后固定地址：`https://<你的用户名>.github.io/<仓库名>/`
（相对路径 + hash 路由，任意子路径即开即用；`.nojekyll` 已备好，`_test/` 不会被 Jekyll 吞。）

可选：部署 `worker.js`（Cloudflare Worker）作为代理备援，启用新浪源——默认直连即可跑，Worker 不是必需品。

## 测试 · Tests

```bash
node _test/run-all.mjs            # 全部 9 组 122 项
node _test/run-all.mjs --offline  # 只跑离线 4 组 65 项（断网/CI 友好）
```

纯 Node 零依赖。覆盖：treemap 面积守恒与视口数学、情绪指数口径与七段分布守恒、技术指标手算核对
（RSI 的 Wilder 平滑、MACD、KDJ、BOLL 的 σ 都有构造序列对账）、时区口径、降级链逐条改坏主源实测、
实网逐源探活、概念榜黑名单、产业链成分股代码真实性。`live/breadth/boards` 组依赖实时行情，
深夜清算时段会自动跳过数值断言——它们不依赖具体价格，只盯结构和口径。

## 已知短板 · Known limitations

- 免费接口有延迟（东财 `push2delay` 名字里就写着 delay），**不构成投资建议**；
- 外汇/商品的日K 无免费直连源（详见踩坑实录第一条），报价与情绪不受影响；
- 加密"市值"用 24h 成交额代理——真实流通量免费拿不到；
- 美股分时盘前盘后只有 1 个点（上游限制），会自动降级为日K；
- 上游随时改字段：哪天整片降级，先跑 `node _test/live.test.mjs`，它比用户先知道谁挂了。

## 免责声明 · Disclaimer

本项目**仅供个人学习与技术研究，不构成任何投资建议**。
所有行情与资讯来自第三方公开接口，可能延迟、中断或出错；据此交易的后果自负。
*For learning and research only. Not investment advice. Data comes from third-party public
endpoints and may be delayed or wrong. Trade at your own risk.*

---

<div align="center">

**技术栈：** 原生 HTML/CSS/JS · [lightweight-charts](https://github.com/tradingview/lightweight-charts) v4.2.3（vendored, Apache-2.0）· 手写 squarify · 世界银行/腾讯/东财/币安/新浪 公开接口

*如果它帮你省了一个付费行情软件的订阅，star 就是最好的咖啡。*
*If this saved you a market-data subscription, a star is the cheapest coffee.* ☕

</div>
