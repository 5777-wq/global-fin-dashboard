# WorldMonitor 代码级逆向分析报告

> 分析对象：https://github.com/koala73/worldmonitor （HEAD 快照，6930 个文件）
> 分析方法：GitHub API 拉取全量文件树 + 关键文件源码采样。
> 结论用途：为 OpenFinLens 的架构演进提供参照。只借鉴思想，不复制实现、不引入其技术栈。

## 1. 技术栈总览（package.json 实测）

| 层 | 选型 |
|---|---|
| UI 框架 | Preact 10（轻量 React 替代）+ Vite |
| 2D 地图 | MapLibre GL 5 + deck.gl 9（@deck.gl/layers、@deck.gl/mapbox）+ protomaps/pmtiles 瓦片 |
| 3D 地球 | globe.gl 2.45（与我们 OpenFinLens **同款**） |
| 聚类 | supercluster 8（地图点聚类）+ h3-js（Uber 六边形地理索引） |
| 地理数据 | topojson-client 3（与我们同款）+ d3 7 |
| 后端 | Vercel Edge Functions（`api/`，按域拆分）+ Railway 上的 Go/Rust 网关（`server/`，Protobuf RPC） |
| 数据库 | Convex（响应式文档库，`convex/schema.ts`）+ S3（@aws-sdk） |
| 缓存/限流 | Upstash Redis（@upstash/redis + @upstash/ratelimit） |
| AI | @anthropic-ai/sdk（服务端摘要）+ @xenova/transformers + onnxruntime-web（**浏览器本地嵌入模型**） |
| 桌面端 | Tauri（src-tauri） |
| 支付/账号 | Clerk（auth）+ Dodo Payments + Convex entitlements |

要点：**它的 3D 地球和我们同源（globe.gl），2D 选择了重量级 MapLibre+deck.gl**——这是它能塞几十个图层的原因，但代价是巨大的依赖面。我们"零新库"约束下走 canvas 自绘，是取舍不同而非能力缺失。

## 2. 目录结构与职责（实测路径）

```
src/                     前端（Preact + TS）
  app/                   应用骨架与编排（41 文件）
    app-context.ts       全局上下文聚合（服务/缓存的 DI 容器）
    data-loader.ts       启动期数据装载编排
    event-handlers.ts    全局事件绑定
    country-map-focus.ts 国家聚焦（地图定位）
    news-loader-sequencing.ts / news-feed-rotation.ts   新闻加载时序与轮换
    hydration-scheduler.ts / panel-layout.ts / panel-enablement.ts   面板水合与布局
  components/            UI 组件（227 文件，一个面板一个文件）
    Map.ts               2D 地图主渲染器（d3+topojson+SVG/Canvas 混合，非 MapLibre！）
    MapContainer.ts      地图容器（2D/3D 切换）
    MapPopup.ts          点击弹窗
    DeckGLMap.ts         deck.gl 图层版地图（重图层场景）
    GlobeMap.ts          3D 地球
    map/map-cluster-gl.ts  WebGL 聚类 canvas 的上下文健壮性封装
    map/deferred-layer-commit.ts   图层延迟提交（性能）
    map/conflict-zone-cull.ts      冲突区剔除
    LiveNewsPanel.ts / NewsPanel.ts / GdeltIntelPanel.ts / BreakingNewsBanner.ts   新闻面板族
  services/              数据服务层（286 文件，**一数据源一文件**）
    gdelt-intel.ts       GDELT 专题情报（INTEL_TOPICS 查询表 + RPC 拉取）
    correlation-engine/  ★ 事件相关性引擎（见 §4）
    summarize-gate.ts    AI 摘要的前端闸门（Pro 会员判定）
    earthquakes.ts / weather.ts / aviation/ / wildfires/ / unrest/ ...   各实时源
    smart-poll-loop.ts   ★ 智能轮询循环（可见性/频率自适应）
    premium-fetch.ts     带 entitlement 的 fetch 包装
    rpc-client.ts / generated-rpc-clients.ts   Protobuf RPC 客户端（生成代码）
  config/                静态地理/金融配置（INTEL_HOTSPOTS、CONFLICT_ZONES、PIPELINES、
                         STOCK_EXCHANGES、CENTRAL_BANKS、AI_DATA_CENTERS……）
  generated/             protoc 生成的 RPC 客户端（77 文件）
  locales/               i18next 多语言（43 文件）
server/                  Railway 常驻网关（Go/Rust 之外的 TS 网关层）
  gateway.ts             ★ createDomainGateway(routes)：CORS/API-key/限流/缓存头/错误边界
  router.ts              路由描述符
  _shared/redis.ts       cachedFetchJsonWithMeta（Redis 缓存包装）
  _shared/intel-history-embed.ts   情报历史嵌入（配合 transformers 本地向量）
  worldmonitor/<domain>/v1/<rpc>.ts   每个 RPC 一个文件（354 个，按域分目录）：
    news/v1/summarize-article.ts     ★ AI 摘要（Anthropic，含缓存/预算/遥测）
    news/v1/get-summarize-article-cache.ts   摘要缓存只读端点
    intelligence/v1/classify-event.ts        事件分类 RPC
    intelligence/v1/get-intel-timeline.ts    GDELT tone/volume 时间线
    conflict/v1/get-humanitarian-summary.ts  ACLED 冲突摘要
    aviation/v1/get-airport-ops-summary.ts   航班
  __tests__/             网关安全/缓存/LLM 健康测试（26 文件）
convex/                  Convex 数据库 schema 与函数
  schema.ts              全部表定义（validator 风格）
  payments/ entitlements.ts notificationChannels.ts intelHistory.ts followedCountries.ts ...
  __tests__/             69 个测试
api/                     Vercel Edge（轻代理域）
  rss-proxy.js           ★ RSS 中继（域名白名单 + Relay 回退列表 + 限流）
  _redis-key-ownership.js  Redis key 所有权约定
  supply-chain/v1/[rpc].ts  霍尔木兹海峡追踪等
proto/worldmonitor/      Protobuf 契约（313 文件，前后端契约单一事实源）
```

## 3. 地图系统

- **双模式**：`MapContainer.ts` 编排 2D/3D。3D 用 globe.gl；2D 有两条路径——默认 `Map.ts` 是 **d3-geo + topojson 直接驱动 SVG/Canvas** 的自绘地图（引入 55 个数据图层类型），重图层场景另有 `DeckGLMap.ts`（MapLibre 底图 + deck.gl 图层）。
- **经纬度→屏幕点**：`Map.ts` 用 d3 地理投影（topojson.feature 把 TopoJSON 转 GeoJSON 后走 d3.geoPath）；deck.gl 路径则直接接受经纬度数组由 WebGL 投影。
- **新闻↔地理绑定**：新闻条目（`NewsItem`）带可选 `lat/lon`；静态热点（INTEL_HOTSPOTS/CONFLICT_ZONES）作为"锚点配置"存在于 `src/config`，新闻按关键词/国家就近吸附到锚点或自身坐标。
- **点击详情**：`MapPopup.ts` 负责弹窗渲染（`escapeHtml` 消毒）；`MapContextMenu.ts` 右键菜单。
- **图层组织**：`Map.ts` 内部按图层函数分组（热点/地震/航班/船只/电缆/核设施/管线/军事基地/网络威胁……每层一个 render 函数），`map/deferred-layer-commit.ts` 做**图层延迟提交**（首屏只画关键层，交互空闲再补重层），`conflict-zone-cull.ts` 做视口剔除。
- **性能手段**（可借鉴清单）：
  1. `map-cluster-gl.ts`：WebGL 聚类 canvas 的**上下文能力校验**（防指纹遮挡浏览器返回假 GL 对象——他们真踩过这个坑）；
  2. `deferred-layer-commit` 图层分帧提交；
  3. `scheduleAfterFirstPaint / yieldToMain / measure/mutate`（layout-batch）把渲染挪出主线程关键路径；
  4. `smart-poll-loop.ts` 按**面板可见性**调整轮询频率；
  5. supercluster 做点聚合；h3-js 做六边形网格聚合（事件密度）。

## 4. 新闻系统

- **源**：GDELT DOC 2.0（`gdelt-intel.ts`，按 `INTEL_TOPICS` 预置查询串）、RSS 全家桶（`api/rss-proxy.js` 中继：域名白名单 + RELAY_ONLY_DOMAINS 回退到 Railway 中继器 + 每域 UA/重定向策略）、ACLED（冲突）、EONET（自然灾害）、NOAA/USGS 类（地震/天气）、Telegram 情报（telegram-intel.ts，MTProto）。
- **统一结构**：前端 `GdeltArticle { title, url, source, date, image?, language?, tone? }`；各源适配到 `NewsItem`。tone（GDELT 情感分）直接用于时间线（`TopicTimeline { tone[], vol[] }`）。
- **去重/分类/地理定位**：前端**不做重度去重**——重度工作在服务端 RPC（`intelligence/v1/classify-event.ts`）；国家归因靠 `country-intel.ts` + 静态热点吸附；实体匹配用 `utils/keyword-match.ts`（tokenizeForMatch/matchKeyword，token 化关键词匹配，无 NER 库）。
- **事件形成**：`correlation-engine/`（★ 最值得抄的思想）：
  - `types.ts`：`SignalEvidence { type, source, severity(0-100), lat?, lon?, country?(ISO2), timestamp, label }` → `ConvergenceCard { domain, title, score(0-100), signals[], location?, countries[], trend(escalating/stable/de-escalating), assessment?(LLM 叙述，异步回填) }`；
  - `DomainAdapter` 接口：`{ domain, label, clusterMode('geographic'|'country'|'entity'), spatialRadius(km), timeWindow(h), threshold, weights, collectSignals(ctx), generateTitle(cluster) }`——**每个域一个适配器，空间半径+时间窗+权重全部显式配置**（military 适配器：500km/24h/阈值20，权重 military_flight 0.40 / ais_gap 0.30 / military_vessel 0.30，注释明确"v1 只收 3 种信号，权重归一化到 1.0"）；
  - `engine.ts`：haversineKm 空间聚类 + 与 `previousClusters` 对比算 trend；**LLM 分层**：`LLM_SCORE_THRESHOLD=60`（分数≥60 才值得 AI 叙述）、`LLM_CACHE_TTL_MS=30min`、`LLM_MAX_CONCURRENT=3`、`RUN_TARGET_MS=100`（超时降级，连续慢跑告警）。

## 5. AI 系统

- **两个 AI 位置**：
  1. **服务端摘要**：`server/worldmonitor/news/v1/summarize-article.ts`（Anthropic SDK）。关键工程细节（实测源码）：
     - `buildArticlePrompts` / `getProviderCredentials` / `getCacheKey` 从 `_shared` 引入；
     - **缓存 key = 轻消毒后的标题们**（"Only structural patterns stripped... semantic phrases kept intact"，且注释记录了一个真实 bug：先过滤后 zip 导致正文错位——所以先 zip 再过滤）；
     - `maxTokens: 100`（硬预算）、`buildLlmCallEvent` 上报每次调用的 provider/model/tokens/duration（**遥测与业务解耦，"telemetry must never affect the summary"**）；
     - 缓存只读端点独立成 RPC（`get-summarize-article-cache.ts`），命中缓存不花钱；
     - 订阅闸门：`summarize-gate.ts`（前端）+ billing 判定（服务端），Pro 功能。
  2. **浏览器本地模型**：`@xenova/transformers` + `onnxruntime-web` 做嵌入（`server/_shared/intel-history-embed.ts` 配合）——零成本的向量化用于历史情报去重/检索。
- **成本控制三板斧**（实测常量）：分数阈值（只对高价值事件调 LLM）、30 分钟结果缓存、并发上限 3。加上"缓存独立端点 + 遥测记账"。

## 6. 实时数据

| 数据 | 来源（实测文件） | 前端显示 |
|---|---|---|
| 股票/金融 | `config` 里 STOCK_EXCHANGES/FINANCIAL_CENTERS/CENTRAL_BANKS 静态锚点 + NewsMarketCorrelationPanel | 地图金融变体图层 |
| 加密 | 未在主干（有 widget-store） | 面板 |
| 航班 | `services/aviation/`（military_flight 进 correlation；get-airport-ops-summary RPC） | 地图飞机图标+聚类 |
| 船舶 | AIS：`military_vessel` + `ais_gap`（AIS 信号消失检测→军事信号） | 地图船只+异常区 |
| 地震 | `services/earthquakes.ts`（USGS 类公开源） | 地图圆点按震级 |
| 冲突 | ACLED → `conflict/v1/get-humanitarian-summary*.ts` | 冲突区图层+摘要 |
| 消费物价 | `consumer-prices-core/`（**独立爬虫子系统**：Carrefour/Kroger/BigBasket 等 15+ 零售商 YAML 配置爬价） | 通胀面板——自建 CPI 数据，非常重 |

## 7. 后端架构

- **三层分工**：Vercel Edge（`api/`）做轻代理（RSS 中继、CORS 预检、限流第一道）→ Railway 常驻网关（`server/`，Protobuf RPC，`createDomainGateway` 统一 CORS/API-key/限流/缓存头/错误映射/响应投影）→ Convex（账号/订阅/情报历史等**有状态**数据）。
- **契约**：`proto/worldmonitor/` 313 个 proto 文件是前后端**唯一契约**，前端客户端代码由 protoc 生成（`src/generated/`，77 文件）。
- **缓存**：Upstash Redis（`_shared/redis.ts` 的 `cachedFetchJsonWithMeta` + `CACHE_TTL_SECONDS` 常量表 + key 所有权约定 `_redis-key-ownership`）。
- **前端取数**：无 WebSocket 主干；`smart-poll-loop` 可见性自适应轮询 + RPC 缓存头（`pro-fresh-rpc`/`public-rpc-cache` 区分 Pro 实时与公共可缓存）。
- **质量工程**：6930 文件里 `__tests__`/`e2e`/`fixtures` 占比很高；有 `.agents/skills/verify-worldmonitor/`（**把 E2E 验证步骤写成了 agent 可执行的 skill**）；perf-style-layout 预算 CI（`perf-style-layout-budget.yml`）。

## 8. 完整数据流（实测归纳）

```
第三方源(GDELT/RSS/ACLED/USGS/AIS/ADS-B…)
  → Vercel Edge 轻代理(白名单/限流/UA 策略)  [api/rss-proxy.js]
  → Railway 网关(RPC 路由/鉴权/预算)          [server/gateway.ts]
  → 域 RPC 处理器(标准化+Redis 缓存)           [server/worldmonitor/<domain>/v1/*.ts]
  → AI 层(阈值触发: summarize-article/classify-event，Redis 缓存，遥测记账)
  → Convex(账号/订阅/情报历史)                 [convex/schema.ts]
  → 前端 RPC 客户端(生成代码)                  [src/generated/]
  → smart-poll-loop 轮询 → bootstrap 水合      [src/app/]
  → services 层适配为统一类型                   [src/types + services/*]
  → correlation-engine 聚类成 ConvergenceCard  [spatial+time+weights]
  → Map.ts/DeckGLMap/GlobeMap 渲染图层         [supercluster/分层/剔除]
  → MapPopup 点击详情 / correlation LLM 叙述异步回填
  → NewsMarketCorrelationPanel 关联资产面板
```

## 9. OpenFinLens 应该复用哪些思想、不复制哪些实现

**复用（思想/结构）**：
1. **DomainAdapter 模式**（correlation-engine/types.ts）——`spatialRadius + timeWindow + weights + threshold + collectSignals` 全配置化，是"新闻→事件"聚类的最佳抽象，直接决定我们 EventEngine 的接口形状。
2. **LLM 分层闸门三常量**：score 阈值 / TTL 缓存 / 并发上限——以及"LLM 叙述异步回填，不阻塞主渲染"。
3. **AI 摘要的缓存 key = 轻消毒标题组** + 缓存独立只读端点 + maxTokens 硬预算 + 遥测与业务解耦。
4. **一数据源一文件的 services 布局** + 统一类型（src/types）——与 OpenFinLens 既有 `sources/*.js` 布局完全一致，继续坚持。
5. **smart-poll-loop 思想**：按面板可见性调频（我们已有 setTimeout 链轮询，加"页面可见性已处理，下一步按 tab 可见性调频"）。
6. **契约先行**：他们用 proto，我们用 JSDoc typedef 作为前后端/模块间契约的单一事实源。
7. **把 E2E 验证步骤写成可执行 skill**（.agents/skills/verify-*）——与我们的 `_test` 思路同源，值得扩展。
8. **GL 上下文健壮性校验**（map-cluster-gl.ts）——我们 globe.js 的 `if (!globe) return` 同款弱点，值得抄这个防御。

**不复制（实现/依赖）**：
1. **MapLibre + deck.gl + protomaps/pmtiles 全家桶**——重量级依赖面与 OpenFinLens"零新库"铁律冲突；我们的 canvas 自绘 + globe.gl 已覆盖需求。
2. **Protobuf + 生成代码管线**（313 proto + 77 生成文件）——对我们这个纯前端+静态 JSON 架构是过度工程；JSDoc 契约足够。
3. **Convex + Clerk + Dodo 支付**——账号/订阅体系，现阶段无此需求。
4. **consumer-prices-core 自建 CPI 爬虫**——方向值得尊敬（自建通胀数据），但运营成本极高；我们用世界银行官方年度数据 + 诚实标注更新周期。
5. **Tauri 桌面端 / blog-site / MCP 服务**——与当前目标无关。
6. **前端塞 55 个图层类型的 Map.ts 单文件**——他们的反面教材：单文件 3000+ 行。我们的图层从第一天就应该走注册表模式。

---

*本报告所有路径均来自 HEAD 快照实测，可直接用于后续对照开发。*
