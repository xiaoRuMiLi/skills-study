# flows.md — 网页化流程构想（首页 / design / listing / workflow）

> 性质：**构想稿**（先对齐，后实现）。目标是把「选品 → 设计 → 上架」做成**可点击的网页流程**，
> 同时保留**命令入口**（agent/CLI 与页面按钮**共用同一份编排**）。
> 遵循目录约定：业务进 `app/`，页面进 `app/pages/`，服务进 `server/`，数据进 `output/` 或 `database/`。

## 总览（页面）
| 页面 | 路径 | 作用 |
|---|---|---|
| 首页 | `app/pages/index.html` | 指纹**上新空白商品**卡片 + 入口（manage / listing）|
| design | `app/pages/design.html?id=<id>` | 选图案 / **AI 生成**（提示词可改）→ 产出图案 → 继续叠字/workflow |
| 叠字 | `app/pages/stamp.html?id=<id>&src=<图URL>` | **可视化叠字**：左实时预览 + 右参数（N 行/颜色/字体/粗细/位置/字号/对齐 + 块占比 + 衬底）；🎨自动配色、📐解析排版样稿、💾保存（见 `stamp.md`）|
| Workflow | `app/pages/workflow.html?id=<id>&image=<成品URL>` | **异步跑 workflow**：选成品(缩略图) → 入队 → **串行执行**（5 步进度/日志/结果），可**排队多个**、可**取消排队**；dry-run 开关（见 `workflow.md`「网页化」）|
| ★**贴字对齐** | `app/pages/align.html?id=<id>` | **★贴字首选**：给图案**加字并对齐空白商品占位**（`design:align`）——标定→量目标→定参数→出图→(可选)复核；异步队列（`flow:'align'`），参数 `{productId,face,pattern,text,lineFonts,lineScales,lineColors,verify}`；产出 `/<id>/align/{design,mockup,design-plain}.jpg` |
| listing 列表 | `app/pages/listing-list.html` | 跑过 listing 流程的商品列表（ID/商品/标题/图/时间/状态/预览）|
| listing 预览 | `app/pages/listing.html?id=<id>` | （已有）上架预览，复用 |
| 管理后台 | `app/pages/manage.html` | （已有）CSV 数据库后台 |

serve 路由：`.html` → `pages/` 优先，数据 → `output/`；URL 不变。

## 接口（server/serve.js 扩展，无需鉴权；建议只绑 127.0.0.1）
| 接口 | 说明 |
|---|---|
| `GET /api/blank-products?page=&size=&q=` | 指纹**空白商品**列表（内部调 `product:list`；按 ID 降序≈上新）|
| `GET /api/patterns` | 图案图源候选（`patterns/` + `input/**`）|
| `POST /api/pattern/generate {productId, prompt?}` | AI 生成图案（`glm-image`；默认提示词 = 由商品信息合成 `buildImagePrompt`，可覆盖；尺寸按印刷区比例 + 去水印）→ 异步任务 |
| `GET /api/listing/list` | listing 列表（读新表 `database/listing.csv`）|
| `POST /api/flow/run {flow,params}` | 入队异步任务（`flow:'workflow'`，params `{productId,images,fit,dryRun}`）→ `{jobId}` |
| `GET /api/flow/list[?flow=]` | 任务列表（页面多任务）；`GET /api/flow/status?id=` 单任务 |
| `POST /api/flow/cancel {id}` | 取消「排队中」的任务 |
| `GET /api/edited/list?id=` | 该商品 `edited/<id>/` 的**成品**列表（名/URL/时间，最新在前）|

## 异步任务模型
```json
{ "id":"wf_12599_1726", "flow":"workflow",
  "params":{ "productId":"12599", "image":"edited/12599/xx.jpg", "fit":"cover", "dryRun":false },
  "status":"queued|running|done|error",
  "steps":[{"name":"抓详情","status":"done"},{"name":"处理图","status":"running"}, …],
  "log":["…"], "result":{…}, "t0":…, "t1":… }
```
- 存储：`output/jobs/<jobId>.json`（数据）；页面**轮询** `status`。
- 并发：同 productId 加锁；命令侧可**阻塞等待**。

## 数据表（Q4：已定）
- **新建 `database/listing.csv`**（类比 `products.csv`）存 listing 数据；配套 `app/Support/ListingRepository.js`（白名单 SCHEMA）。
- 列：`id / cn_name / title / image / updated_at / status / preview_url`（可扩）。
- 列表页读它；预览页 `pages/listing.html` 复用。

## 编排层（共用）
- `app/Flows/WorkflowFlow.js`（= `listing:generate` 的编排，五步 + 进度回调）
- `app/Flows/AlignFlow.js`（= `design:align` 的编排，★贴字首选；`flow:'align'`）
- `app/Flows/DesignFlow.js`（选图/AI 生成 → 图案 → 可选叠字）
- 命令壳 `app/Console/Commands/FlowCommand.js`（`flow:workflow` / `flow:design`）；
  页面按钮走 `POST /api/flow/run` → **同一 Flows**。

## 分阶段实施
1. ✅ **首页 + `/api/blank-products`（+ `/api/blank-product`）**，serve 绑 `127.0.0.1`
2. ✅ **listing 表 `database/listing.csv` + `ListingRepository` + `/api/listing/list` + `pages/listing-list.html`**（`run-listing-flow` 已写入该表）
3. ✅ **design 页**（`/api/patterns` 选图 + `/api/pattern/generate` AI 生成（异步）+ `/api/flow/status`；`/input`、`/patterns` 直通）
4. ✅ **design 页「下一步」**：「叠字」→ `stamp.html`（见 `stamp.md`）；「跑 Workflow」→ `workflow.html`（异步队列，见 `workflow.md`「网页化」节）。**编排层**已抽出 `app/Flows/WorkflowFlow.js`（命令 `listing:generate` 与网页**共用**）。

> 已落地文件：`app/pages/{index,design,listing-list}.html`、`app/Support/{ListingRepository,JobStore}.js`、`app/Services/PatternService.js`、`patterns/`（图案库）、`server/serve.js`（+接口，绑本机）。

## 待定项（决策中）
- **Q1「上新」口径**：建议 —— 列表默认序取一页(60) → **按 ID 降序**（≈上新，实测 id 大者新）+ 分页 + 前端搜索。
- **Q2 图案图源**：建议 —— 主用**新建 `patterns/` 图案库**，并列 `input/**`；在线图库 `gallery:list` 作可选高级来源（需 token）。
- **Q3 design 页终点**：建议 —— **分步**（图案 → 叠字 → workflow），每步可单独跑，另给「一键全链」按钮。

## 补充（建议）
- 卡片**状态徽标**（未处理/已设计/已上架）。
- 统一**顶部导航**（首页 / manage / listing）。
- design 页显示**图案来源 + 提示词 + 时间**（可复现、可合规审计）。
- serve **只绑 127.0.0.1**（不鉴权前提下的最低防护）。
- 与既有命令**共用实现**：页面按钮 = `flow:*` 命令 = 同一 Flows。
