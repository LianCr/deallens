# CLAUDE.md — DealLens（"这价格公道吗？"——买车定价透明度 Demo）

给 Claude Code 的完整建造规格。**目标读者是 Claude**：拿到这份文件就能从零把 demo 建出来。
求职目标：**Edmunds Mid-Level Software Engineer（前端向全栈）**。JD 的靶心原文：
- *"Assure shoppers that they are getting a good deal by **revamping the way we present pricing**"* ← demo 的全部主题
- *"Research and evangelize modern Javascript best practices and client-side application design"*
- *"optimizing the performance of those pages"* · *"isomorphic Javascript is a plus"* · *"GraphQL is a plus"*
每个技术决策对着 JD 打，见文末映射表。

---

## 一句话定位

**DealLens**：同构 React（Next.js SSR）web app——选一辆车（真实 NHTSA 数据）、输入 dealer 报价，得到一张**价格语境图**：这个报价落在市场分布的什么位置、过去 24 个月价格怎么走的、图上钉着影响价格的事件标注。签名交互移植自作者 smart-money-decoder 的 D3 **「新闻 × 价格」上帝视角时间轴**（扫动光标、事件聚簇彩点、诚实空态）。

**产品灵魂（从 smart-money-decoder 继承，一个字不改）**：不卖确定性，卖对不确定性的清醒。Edmunds 自称 "in the business of trust"——这个 demo 的叙事就是 trust 的工程化：真实数据标真实、演示数据显著标注 "demo data + 方法论"、缺数据就诚实空态，绝不插值造假。

---

## 🔴 红线

1. **同构优先**：所有页面 SSR 首屏 + 客户端 hydration；禁 JS 也能看到核心内容（价格结论用服务端渲染的静态版兜底）。这是 JD "isomorphic Javascript" 的直接回答，不是摆设。
2. **性能是功能**：Core Web Vitals 预算写死在 CI 里（LCP < 2.5s / CLS < 0.1 / 首屏 JS < 150KB gzip），Lighthouse CI 不过 = build 红。D3 图表组件动态 import + 视口内才 hydrate。
3. **所有数字数学在服务端/纯函数算好**（百分位、差价、油费年化），组件只渲染。纯函数全部可单测。
4. **数据诚实分级显示**：真实 API 数据（NHTSA、fueleconomy.gov）不加标；合成定价数据集**每处出现都带 "Demo pricing data" 徽章**，方法论链接到 README。缺数据 → 诚实空态（"Not enough data to say — and we won't guess"）。
5. **UI 文案 / 代码注释 / README / commit 全英文**（repo 会给 Edmunds 的人看）。本 CLAUDE.md 是唯一中文文件。
6. **每个里程碑结束必须 `npm run build && npm test && npx playwright test` 全绿 + 截图存 `docs/screenshots/`**，再进下一个。

## 🟡 协作纪律（继承自 smart-money-decoder）

- 大改先出方案再动手；不确定的路先最小验证拿真数据再投入。
- 政府 API 文档不可全信，**以实测为准**。M1 第一件事：curl 打真 API、真实 JSON 存进 `fixtures/`，解码和测试全部以 fixtures 为正本。

---

## 数据源（全免费、免 API key —— clone 即跑是 demo 的传播性设计）

| 源 | 用途 | 已知坑 / M1 需实测项 |
|----|------|---------------------|
| `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json` | 真实车型级联选择（Make → Year → Model） | 全量 makes 上万条垃圾厂牌 → **本地维护 top ~30 常见品牌白名单**（真实产品决策，README 里写理由）；未知输入返回 200 + 空 `Results`（不是 404），空结果要显式处理 |
| `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json` | VIN 粘贴直达（加分交互） | 无效 VIN 同样 200 + `ErrorCode` 字段非零，靠字段判错不靠 HTTP 状态 |
| `https://www.fueleconomy.gov/ws/rest/...`（vehicle menu → vehicle record） | 真实 MPG → 代码算年油费（Cost-to-Own 条） | **默认返回 XML**；实测 `Accept: application/json` 头是否生效，不行就服务端转 XML；车型名与 vPIC 拼写不一致 → 模糊匹配 + 匹配不上诚实降级（不显示油费，不硬凑） |
| `data/pricing-gen.ts` 本地合成定价数据集 | 市场价格分布 + 24 月价格历史 + 事件标注 | **诚实红线第 4 条**：确定性种子生成（同一车型永远同一分布）、参数写在生成器注释里、UI 每处带 "Demo pricing data" 徽章。真实二手车价 API 无免费档，这是 trade-off，README 明写并给出接真源（Marketcheck 等）的 adapter 接口 |

## API 层（JD "designing APIs using GraphQL" 的证据）

Node.js GraphQL gateway（`/api/graphql`，graphql-yoga），聚合三个异构源成一个干净 schema：

```graphql
type Vehicle { make: String!, model: String!, year: Int!, trims: [Trim!]! }
type PriceContext {
  quote: Int!, verdict: Verdict!, percentile: Float      # percentile 可 null=数据不足，诚实
  distribution: [PriceBucket!]!, history: [PricePoint!]!, events: [MarketEvent!]!
  dataSource: DataSourceTag!                              # REAL | DEMO —— 诚实分级进 schema 类型系统
}
enum Verdict { GREAT_DEAL, FAIR, ABOVE_MARKET, INSUFFICIENT_DATA }
```

要点：DataLoader 防 N+1、resolver 级缓存（vPIC 车型表按天缓存）、错误分类（上游超时 vs 无数据 vs 无效输入）映射成 GraphQL error extensions。**schema 设计思路写进 README**——这是"designing APIs"和"multi-tier"两个 plus 的书面证据。

---

## 产品形态（三页）

### 页 1 — 选车（SSR 首屏）
- 级联选择 Make → Year → Model（vPIC 真数据），或粘 VIN 直达。
- 服务端渲染 + `<form>` 原生提交兜底（禁 JS 可用）→ hydration 后升级为即时级联。
- 性能样板页：LCP 元素是静态文本，零布局偏移。

### 页 2 — Deal Dashboard（核心页）
输入 dealer 报价（URL 参数携带 → 可分享链接，SSR 直出结论）：
- **英雄结论区**：大字 verdict（Great deal / Fair / Above market / Insufficient data），涨绿跌红语义色，服务端算好直出。
- **签名组件 A：PriceContextChart（D3）**——市场价格分布曲线，钉三个标记：你的报价（大标记）、P25/中位/P75 分带背景。悬停扫过分布曲线出实时光标 + 当前百分位数字滚动。
- **签名组件 B：PriceHistoryTimeline（D3，GodModeTimeline 直系移植）**——24 个月价格走势 + 事件聚簇彩点，特性对照见下表。
- **Cost-to-Own 条**：真实 MPG（fueleconomy.gov）→ 年油费（纯函数算，假设参数明示可调：年里程/油价）。
- 右上角数据诚实徽章："Vehicle data: NHTSA (real) · Pricing: demo dataset"。

### 页 3 — Contact Dealer（JD "streamline the way customers reach out to dealers" 的直接回应）
- 一个为性能与转化率造的 lead form 样板页：渐进增强（无 JS 可提交）、乐观提交 + 失败回滚、字段级即时校验、零 CLS。
- 目标：Lighthouse 100/100/100/100，README 贴分数截图。

### 签名组件 B — PriceHistoryTimeline（D3 GodModeTimeline → 本项目移植表）

设计正本：smart-money-decoder `frontend/src/App.jsx:1118-1330`。**这次不用换语言，D3 代码逻辑可直接复用**，但要重构成独立、可测、文档化的模块（JD："building, unit testing, documenting, and refactoring client-side applications"——移植本身就是 refactoring 叙事）：

| 原版特性 | 移植 |
|---------|------|
| 价格 line + area（curveMonotoneX）+ Y 轴聚焦数据区间防压平 | 照抄数学（`pad = max((pMax-pMin)*0.18, …)`），抽成纯函数 `focusDomain()` + 单测 |
| 鼠标扫动实时光标、头部数字随动 | 同款；数字滚动动画；移动端 touch 同轨 |
| 事件按日聚簇彩点（同月多条 → count 徽章），扫近自动激活、点击钉住 | 事件=车市事件（新款上市、季节性促销季、demo 数据集事件），聚簇/吸附/钉住逻辑照抄 |
| 7D/30D/All 范围切换 | 6M / 12M / 24M |
| 薄数据诚实空态 | 同款："Not enough price history to draw an honest chart" |
| **新增**：SSR 骨架 | 服务端渲染静态 SVG 骨架（无交互但有形状）→ hydration 后原地升级为交互版，零 CLS——**同构 D3** 是别人 demo 里看不到的点 |

---

## 技术架构

```
deallens/
├── next.config.ts              # Next.js 15 App Router · TypeScript strict
├── src/
│   ├── app/
│   │   ├── page.tsx                    # 页1 选车（Server Component + 原生 form 兜底）
│   │   ├── deal/[...vehicle]/page.tsx  # 页2 Dashboard（SSR 直出 verdict，可分享 URL）
│   │   └── contact/page.tsx            # 页3 lead form 样板
│   ├── api/graphql/                    # graphql-yoga gateway（Node runtime）
│   │   ├── schema.ts · resolvers/ · loaders.ts
│   ├── sources/                        # 三个上游 client：vpic.ts · fueleconomy.ts · pricing-gen.ts
│   │   #  每个 client：fixtures 驱动测试 + 超时/空结果/格式漂移三态处理
│   ├── domain/                         # 🔴 纯函数层，零依赖，100% 单测：
│   │   #  percentile.ts · verdict.ts · focusDomain.ts · clusterEvents.ts · fuelCost.ts
│   ├── components/
│   │   ├── charts/PriceContextChart/   # D3 组件模式：React 管生命周期、D3 管数学
│   │   ├── charts/PriceHistoryTimeline/
│   │   └── ...（每个图表组件带 README.md 小文档 + Storybook-lite 演示页 /dev/charts）
│   └── fixtures/                       # M1 抓的真实 API JSON
├── e2e/                                # Playwright：chromium + firefox + webkit（cross-browser 证据）
├── .github/workflows/ci.yml           # lint → unit → build → E2E → Lighthouse CI 预算门
└── docs/screenshots/ · docs/adr/      # 截图 + 3-4 篇迷你 ADR（技术决策记录，Staff 味的文档习惯）
```

- **栈**：Next.js 15（App Router, RSC + SSR）· TypeScript strict · graphql-yoga · d3-scale/shape/array（与父项目同款）· 零 UI 框架（手写 CSS，展示基本功）。
- **状态**：极简——URL 即状态（报价、车型全在 searchParams，天然可分享 + SSR 友好），客户端不引 Redux（在 README 里写"为什么这个规模不需要"，判断力叙事）。
- **部署**：Vercel 一键（主）；`docs/adr/aws-deploy.md` 写清移植到 AWS Lambda+CloudFront（SST）的路径（JD AWS plus 的书面回应，不实际做，省时间）。

## 性能红线（README 贴证据）

1. Lighthouse CI 预算进 GitHub Actions：Performance ≥ 95、LCP < 2.5s、CLS < 0.1、TBT < 200ms，三页全测。
2. 首屏 JS < 150KB gzip：D3 图表 `next/dynamic` + IntersectionObserver 进视口才 hydrate。
3. 图表交互 60fps：扫动只动 transform/opacity，不触发 React 重渲染（光标层用 ref 直改 DOM——README 写清这个 React×D3 分工决策）。
4. 级联选择防抖 + 请求竞态取消（AbortController），vPIC 慢时输入不卡。

## 测试（JD 原文逐条回应："building, unit testing, documenting, refactoring" + "testing strategies, cross-browser"）

| 层 | 内容 |
|----|------|
| 单测（Vitest） | domain/ 纯函数全覆盖：percentile 边界（空集/单点/并列值）、verdict 阈值、focusDomain 极值、事件聚簇、油费数学 |
| 组件（RTL） | 图表容器三态：loading / 数据充足 / 诚实空态；诚实徽章始终渲染 |
| 契约（fixtures） | 三个上游 client 对真实 JSON fixtures 解码 + 格式漂移时报错不静默 |
| E2E（Playwright ×3 浏览器） | 选车→报价→verdict 全流程；禁 JS 模式下核心结论仍可见（同构证据） |
| CI | 上述全部 + Lighthouse CI 预算门，PR 必绿 |

## 里程碑（每个独立可 demo，顺序不许换）

- **M0 骨架**：`npx create-next-app` → TS strict + ESLint + Vitest + Playwright + CI 空管道全绿。
- **M1 数据层**：curl 实测三个上游 → fixtures 落盘 → 三个 client + domain 纯函数 + 单测绿。**（先验证 fueleconomy.gov 的 JSON 支持再写代码）**
- **M2 GraphQL + 页1**：gateway 立起来（GraphiQL 可玩）+ 选车页 SSR + 原生 form 兜底。
- **M3 Dashboard**：verdict 英雄区 + PriceContextChart + Cost-to-Own，SSR 直出可分享。
- **M4 签名时间轴**：PriceHistoryTimeline 完整移植（扫动/聚簇/钉住/空态/SSR 骨架）。
- **M5 收官**：Contact 样板页拿 Lighthouse 满分、cross-browser E2E、README（英文：JD 映射表 + 架构图 + CWV 证据截图 + 30 秒 GIF）+ 3 篇 ADR + Vercel 上线。

预算：M0-M2 一天，M3-M4 一天，M5 半天。**两天半必须能拿出去**——全部在作者本行技能内，无新平台学习成本。

## README 必须包含的 JD 映射表（英文写，这里是底稿）

| JD 原文 | demo 里的证据 |
|---------|--------------|
| revamping the way we present pricing | 整个产品：verdict + 分布图 + 历史时间轴，"pricing as context, not a number" |
| optimizing the performance of those pages | Lighthouse CI 预算门 + Contact 页满分 + 首屏 JS 预算 |
| modern Javascript best practices & client-side application design | RSC/SSR 架构、URL 即状态、React×D3 分工、ADR 文档 |
| unit testing, documenting, refactoring client-side applications | domain 纯函数全测、组件级 README、GodModeTimeline 重构移植叙事 |
| testing strategies, cross-browser | 四层测试金字塔 + Playwright 三浏览器 |
| isomorphic Javascript (plus) | SSR 直出结论 + 禁 JS 可用 + 同构 D3 骨架 |
| GraphQL / REST API design (plus) | gateway schema 设计（含诚实分级进类型系统）+ README 设计文档 |
| Node.js (plus) | GraphQL gateway + 三上游聚合 + DataLoader |
| cloud platform (plus) | Vercel 上线 + AWS 迁移 ADR；作者另有 AWS/Render 生产部署经验 |
| see projects to completion | 上线 URL + CI 全绿 + 另一个已在生产的完整产品（smart-money-decoder） |

## 面试 demo 剧本（90 秒）

1. 打开分享链接 → 结论秒出（SSR，"结论是服务端渲染的——你可以把这个链接发给家人，禁 JS 都能看到该不该买"）。
2. 扫价格时间轴 → 扫到事件彩点弹卡 → **"这是我上一个产品里最得意的 D3 可视化——那边对齐的是新闻和预测市场赔率，这里对齐的是车市事件和成交价。同一个设计语言：把'为什么是这个价'画在'价是多少'旁边。"**
3. 指着 "Demo pricing data" 徽章 → **"拿不到真实成交价 API，我就把它显著标出来、方法论写进 README、连 GraphQL 类型系统里都有 REAL|DEMO 标签。Edmunds 说自己 in the business of trust——我认为 trust 是个工程问题。"**
4. 收尾甩 CI 页面：Lighthouse 预算门全绿 + 三浏览器 E2E。
