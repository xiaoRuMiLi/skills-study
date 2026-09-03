---
name: amazon-ops-assistant
description: 亚马逊卖家运营助手（基于官方 SP-API 离线权威规范）。将「运营意图」翻译成准确的 SP-API 调用与量化结论。覆盖 15 个模块：订单看板/明细/待发货/标记发货（orders）、利润测算（profit）、库存健康与播种（inventory）、补货建议（restock）、上架/改价（listings）、报价/竞品价（pricing）、竞品监控（competitor）、店铺/市场（sellers）、报表生成/解析（reports）、销售表现（sales）、买家消息（messaging）、FBA履约（fulfillment）、通知订阅（notifications）、多步workflow（workflow）、系统检查（system）。采用工厂模式+模块注册表+依赖注入架构（lib/），扩展只需加模块文件+注册一行。触发词：亚马逊运营、订单看板、算利润、库存健康、补货、查库存、在售listing、改价、上架、批量上架、价格、竞品价、查订单、待发货、标记发货、物流单号、买家消息、FBA发货、报表、销售表现、ACOS、亚马逊助手、Amazon ops、SP-API 业务封装。基石为 spapi-dev-assistant（查证规范/认证调用），本 skill 只做业务语义层。
---

# 亚马逊运营助手 (amazon-ops-assistant)

**定位**：SP-API 的**业务封装层**。把「卖家想做什么」翻译成权威 SP-API 调用 + 量化结论。
底层 `spapi-dev-assistant` 负责「查规范 + LWA/SigV4 认证调用」；本 skill 负责「业务逻辑 + 聚合 + 历史/流程编排」。

## 架构（工厂模式 / 模块注册表 / 依赖注入）

```
scripts/ops.js           # 薄入口（路由 + 统一错误处理）
scripts/lib/
├── app.js               # createApp()：组装依赖、注册/实例化模块、dispatch
├── registry.js          # ModuleRegistry：modules 以工厂 (ctx)=>moduleDef 注册；create(ctx) 注入依赖
├── env.js               # .env 加载、沙盒/区域/市场、凭证状态、占位符检测
├── spec.js              # 本地 Swagger 规范访问（运行时权威解析 resolveOp/listAllOps）
├── client.js            # SP-API 客户端适配器（复用底层 callSPAPI；runSpecCli/runClientCli）
├── retry.js             # withRetry：指数退避+抖动+遵循 Retry-After+tagError
├── response.js          # unwrap：解 payload 包装
├── errors.js            # CliError / NotFoundError
├── format.js            # num/money/hr
├── parse.js             # parseArgv（--kebab-case 自动转 camelCase）
└── modules/             # 15 个运营域工厂：system/orders/profit/inventory/restock/pricing/
                         #   competitor/sellers/reports/sales/messaging/listings/fulfillment/notifications/workflow
```

**扩展新模块**：写 `lib/modules/<name>.js`（导出工厂 `(ctx)=>moduleDef`，含 `name/title/describe/commands`），
再到 `app.js` 的 `registerModules()` 加一行。核心零改动（开闭原则）。模块经注入的 `ctx` 访问
`callOp/spec/env/format` 等能力，不直接碰底层/全局/凭证明文。

## 硬性规则（每轮都必须遵守）

1. **先复核规范再动手**：`ops.js system spec "<家族>"`（或 `list-ops`）确认 opId、路径、必填参数、响应码。**禁止猜测**；规范查不到就明确提出「规范中未找到」，不要编造。
2. **真实调用走复用 + 限流**：所有调用经 `lib/client.js` 的 `callOp`（复用 `spapi-dev-assistant/sp-api-client.js`），自带 `withRetry`（指数退避 + 抖动 + 遵循 Retry-After）。**禁止无节制的 while/for 连发、忽略 429 继续猛调。**
3. **凭证红线**：不向用户要/读 CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN 明文；只放本机 `.env`，只读 ✅/❌。密钥泄露可致**账号永久封禁**。
4. **沙盒优先**：开发/测试一律用 **SP-API Sandbox**（`.env` 设 `SP_API_SANDBOX=true`）；**自测通过后再切 `false` 进生产**。见 `references/sandbox-setup.md`。
5. **生产注意**：生产打的是**真实数据**，有 **IP 关联风控**——在关联卖家后台的电脑/网络调用、保持出口 IP 稳定、**不频繁连发**。
6. **受限数据（PII）需 RDT**：`getOrderAddress`/`getOrderBuyerInfo`/`getOrderItems`(买家信息) 等**受限操作**需要 **Restricted Data Token**（Tokens API）且应用有受限角色；无 RDT 会 403。见「沙盒 vs 生产 & RDT」。
7. **异步操作要轮询**：报表（Reports）、Feeds、workflow 都是异步——创建后轮询 `processingStatus`，无 `ReportDocumentId` 前别下载。
8. **来源必须上报**：回复中含接口规范/参数/字段/官方规则，标注 `来源（本地）: <绝对路径>` 与 `来源（官方）: <完整URL>`；凭经验给的值标「推测，需以官方为准」。

## 快速开始

```bash
# 0. 看全部模块与命令
node scripts/ops.js list

# 1. 环境检查（规范 + 凭证 ✅/❌ + 占位符警告 + 沙盒/生产模式，无真实调用）
node scripts/ops.js system check

# 2. 初始化 .env 模板（放 项目工作区/amazon-dev，不在 skill 里；含 SP_API_SANDBOX/marketplace注释）
node scripts/ops.js system init-env      # 然后你本人填凭证

# 3. 查规范（本地，不耗额度）
node scripts/ops.js system spec "orders"
```

## 模块总览（15 个）

| 模块 | 用途 | 常用命令 | 沙盒数据 |
|------|------|---------|---------|
| system | 检查/init-env/spec/list-ops | `system check` | — |
| orders | 订单看板/明细/待发货/标记发货 | `orders dashboard / to-ship / mark-shipped` | ✅(静态用例) |
| profit | 利润测算(净利/毛利率) | `profit estimate` | 🟡 生产 |
| inventory | 库存健康/沙盒播种 | `inventory summary / seed` | ✅(动态+播种) |
| restock | 补货建议 | `restock suggest` | ✅ |
| pricing | 自己报价/竞品价 | `pricing price / competitive` | 🟡 生产 |
| competitor | 竞品监控(BuyBox/区间) | `competitor watch` | 🟡 生产 |
| sellers | 店铺/市场参与 | `sellers participations` | ✅ 生产真数 |
| reports | 生成/轮询/解析/保存报表 | `reports run / view / status` | 🟡 生产 |
| sales | 销售表现(订单/单位/销售) | `sales overview [--sku]` | ✅ 生产真数 |
| messaging | 买家消息(可用类型/发送) | `messaging actions / send` | 🟡 受限(RDT) |
| listings | 上架/改价/删除 | `listings get / put / patch / price / delete` | 🟡 生产 |
| fulfillment | FBA 履约 | `fulfillment preview / list / create / cancel` | 🟡 生产 |
| notifications | 通知订阅 | `notifications ...` | 🟡 生产 |
| workflow | 多步流程(可审批) | `workflow daemon / help` | 委托底层 |

## 能力模块

### `orders` 订单
```bash
orders dashboard [--days N] [--marketplace X]                         # 看板：订单数/金额/状态/取消
orders to-ship [--days N] [--marketplace X] [--max-orders N] [--export ship.csv]  # 待发货单+明细(可导出)
orders single --orderId <id>                                          # 单条订单
orders items --orderId <id>                                           # 明细：SKU/数量/单价
orders address --orderId <id>                                         # 收货地址(需RDT)
orders mark-shipped --orderId <id> --carrier <code> --tracking <单号> [--items "id:qty"] [--dry-run] [--yes]  # 标记发货+物流单号
```
- 沙盒 `dashboard`/`to-ship` 用静态用例 `TEST_CASE_200`（mock）；生产返回真实数据。
- 分页：响应含 `NextToken` 需循环，**页间限流**（`to-ship` 已做）。
- `mark-shipped` 是**写**操作，`--yes` 确认；`--dry-run` 预览；carrierCode 用有效值（"Other" 需 `--carrier-name`）。
- `address`/买家PII 需 RDT。

### `profit` 利润
```bash
profit estimate [--days N]
```
- 聚合 `listFinancialEvents`：净利 ≈ 营收 − 佣金/FBA费 − 退款；毛利率。字段名以规范 definition 为准（勿凭记忆）。
- 财务事件可能延迟 48h。沙盒 Finances 无测试用例（400/空），**生产才有真实流水**。

### `inventory` 库存
```bash
inventory summary --marketplace X               # 健康评分（断货/偏低/健康/冗余）
inventory seed --sku X --marketplace Y [--name N] # 沙盒播种（createInventoryItem）
```
- 动态沙盒：`getInventorySummaries` 默认空，先 `seed` 播种才有数据。

### `restock` 补货建议
```bash
restock suggest --marketplace X [--velocity N|--velocity-json "SKU:N"] [--velocity-source orders] [--days N] [--target-days N] [--safety-days N] [--sku X]
```
- 库存(getInventorySummaries) + 日销 → 每 SKU 补货量与健康评分。
- 日销来源：`manual`（默认 `--velocity`/`--velocity-json`）或 `orders`（自动 getOrders→getOrderItems 聚合，限 `--max-orders` 控量）。阈值可覆盖。

### `pricing` 定价 / `competitor` 竞品
```bash
pricing price --marketplace X [--asin A|--skus S]          # 自己报价（getPricing）
pricing competitive --marketplace X [--asin A|--skus S]   # 竞品价（getCompetitivePricing）
competitor watch --marketplace X --asins "A,B,C" [--my-price N]   # BuyBox/区间/对比
```
- 沙盒 pricing 无成功用例，生产才有数据。

### `sellers` 店铺
```bash
sellers participations    # 市场参与/授权（getMarketplaceParticipations）
```

### `reports` 报表（异步）
```bash
reports run   --type <ReportType> --marketplace X [--options-json <json>|--date-granularity DAY --asin-granularity SKU] [--days N] [--save file]  # 全流程：create→轮询→下载→解析
reports view  --file <report.csv> [--status Active] [--rows N]   # 看已保存报表（自动识别 CSV/TSV，可按状态过滤）
reports create --type <ReportType> --marketplace X               # 仅创建
reports status --reportId <id>                                    # 查状态
reports types                                                      # 常用 ReportType
```
- 自动识别**CSV / TSV / JSON** 报表；GET_MERCHANT_LISTINGS_ALL_DATA 是 TSV，GET_SALES_AND_TRAFFIC_REPORT 是 JSON。
- 常用：`GET_MERCHANT_LISTINGS_ALL_DATA`（在售 listing 列表）、`GET_SALES_AND_TRAFFIC_REPORT`（需特定角色，403 常见）。

### `sales` 销售表现（Sales API，同步）
```bash
sales overview [--days N] [--granularity Day|Total] [--marketplace X] [--sku X|--asin A]
```
- `getOrderMetrics`：近 N 天订单/单位/销售额（可按天拆分，可 `--sku`/`--asin` 过滤单个）。
- ⚠️ 只含**销量/销售额**，不含**流量/转化**（那份需 GET_SALES_AND_TRAFFIC_REPORT + 角色）。
- 注意 Sales API 的 Money 是 **camelCase**（`amount`/`currencyCode`），`payload` 直接是数组。

### `listings` 上架 / 改价
```bash
listings get    --sku <sku> [--sellerId --marketplace]                          # 查 SKU 状态/productType/itemName（getListingsItem）
listings put    --sellerId --sku --marketplace --productType --attributes <json> [--requirements]  # 上架/全量更新
listings patch  --sellerId --sku --marketplace --productType --path <pointer> --value <json>        # 部分更新
listings price  --sellerId --sku --marketplace --productType --amount N [--currency GBP] [--value-with-tax N] [--dry-run] [--yes]  # 改价
listings delete --sellerId --sku --marketplace                                                       # 删除上架
```
- body 为官方 `ListingsItemPutRequest`/`ListingsItemPatchRequest`；`put`/`patch` 均返回 `status(ACCEPTED/INVALID)+issues[]`（逐项反馈成败）。
- **`sellerId` = 卖家账号「卖家记号」**（英国站如 `A2UM1Q669PQRII`），放 `.env` `SP_API_SELLER_ID` 自动读取；**不是** `amzn1.pa.o.` 前缀那个值。
- **改价必读（已验证 BLANKET）**：
  - **价格路径是 `/attributes/list_price`**（**不是** `/attributes/offer/price`，后者报 `Invalid path provided in patch at index of 0`）。
  - 值格式 `[{ value, value_with_tax, currency, marketplace_id }]`；**UK 等含税市场必须带 `value_with_tax`**（缺它报 99022：'value_with_tax' 不足）。`--value-with-tax` 可单独给含税价（默认=value）。
  - **必须传真实 `--productType`**（用 `listings get` 从 `summaries[].productType` 读出，如 `BLANKET`），用占位 `PRODUCT` 会失败。
  - `status=ACCEPTED`+issues[] 即成功；`INVALID` 是被拒未改；先 `--dry-run` 预览再 `--yes`。
- 批量上架：可用 `putListingsItem` 逐 SKU 循环（或 Feeds `POST_PRODUCT_DATA`，见 api-map）。



[114 more lines in file. Use offset=162 to continue.]

### `messaging` 买家消息
```bash
messaging actions --orderId <id> --marketplace X     # 查订单可用消息类型
messaging send    --orderId <id> --marketplace X --type <opId> [--body <json>]   # 按类型发送
messaging types                                       # 可用消息类型 opId
```
- **⚠️ 多数发送为受限操作**：需 **RDT**、买家许可，且**禁纯营销**。无通用 sendMessage。

### `fulfillment` FBA 履约
```bash
fulfillment preview --body-json <json>                          # 履约方案预览
fulfillment list [--queryStartDate <iso>]                        # 履约订单列表
fulfillment get --orderId <sellerFulfillmentOrderId>             # 查单个
fulfillment cancel --orderId <sellerFulfillmentOrderId>          # 取消
fulfillment create --body-json <CreateFulfillmentOrderRequest> --yes  # 创建（写）
```
- 沙盒为 Dynamic；body 遵循官方定义用 `--body-json`，**不猜字段**；写操作 `--yes`。

### `notifications` 通知订阅
```bash
notifications destinations                 # 列目的地
notifications create-destination --body-json <json> --yes
notifications subscriptions --type <notificationType>            # 列订阅
notifications create-subscription --type <notificationType> --body-json <json> --yes
notifications get-subscription --type <notificationType>
notifications delete-subscription --type <notificationType> --yes
```

### `workflow` 多步流程（推荐）
当用户要「一串有关联、需人工审批、要追踪」的操作（查订单→算利润→改价→出报表），**必须推荐 workflow**。
```bash
workflow daemon    # 启动常驻 daemon（spapi-workflow.js，ASL 状态机）
workflow help      # 使用说明
```
可追踪（execution_id/tail）、可审批（input_state + submit_callback）、可复用/可视化（validate_workflow/workflow_to_mermaid）。串流程一律走 workflow；单个无依赖调用才直接调接口。

### `system` 系统/元信息
```bash
system check       # 环境检查
system init-env    # 建 .env 模板
system spec "Q"    # 查规范
system list-ops    # 列出全部 operationId
```

## 典型工作流

**① 每日发货**（MFN 自发货）
```bash
orders to-ship --days 7 --marketplace <X> --export ship.csv   # 待发货单+SKU/数量 → 导出
orders mark-shipped --orderId <id> --carrier <code> --tracking <单号> --yes  # 逐个标记发货(需发货确认)
# 地址需 RDT：orders address --orderId <id>
```

**② 看销售/库存**
```bash
sales overview --days 7 --marketplace <X>
inventory summary --marketplace <X>
restock suggest --marketplace <X --velocity-source orders>
```

**③ 在售 listing + 上架**
```bash
reports run --type GET_MERCHANT_LISTINGS_ALL_DATA --marketplace <X> --save listings.csv
reports view --file listings.csv --status Active
listings put --sellerId <S> --sku <SKU> --marketplace <X> --productType <T> --attributes '<json>'
```

**④ 主数据核对**
```bash
system spec "getOrders"      # 复核规范
sellers participations       # 确认市场/授权
```

## 沙盒 vs 生产 & RDT

- **沙盒（`SP_API_SANDBOX=true`）**：走 `sandbox.sellingpartnerapi-<region>`，返回 mock；静态沙盒（Orders）需精确测试用例参数（`TEST_CASE_200`），动态沙盒（FBA Inventory）需先 `inventory seed`。**不碰真实数据**。
- **生产（`SP_API_SANDBOX=false`/未设）**：走 `sellingpartnerapi-<region>`，真实数据 + IP 关联风控 + 更严格限流。
- **RDT（受限数据）**：`getOrderAddress`/`getOrderBuyerInfo`/`getOrderItems`(买家信息) 等需要 `createRestrictedDataToken` 拿 RDT，并带 `x-amzn-Restricted-Data-Token` 头；应用需有受限角色（如 D2C）。无 RDT → 403。**当前 sp-api-client.js 未内置 RDT**，需扩展。
- **角色**：部分报表/操作需特定角色（如 `GET_SALES_AND_TRAFFIC_REPORT` 403 = 角色未批）；角色申请走开发者档案 → 应用 → 重新授权换新 refresh token。

## 常见问题排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 403 Unauthorized | 沙盒凭证打生产 / RDT 缺失 / 角色未批 | 核对 `SP_API_SANDBOX`；受限操作补 RDT；报表查角色 |
| 沙盒返回空 | 静态沙盒未用测试用例 / 动态沙盒未播种 | orders 用 `TEST_CASE_200`；inventory 先 `seed` |
| 400 | 缺必填参数 / 参数格式错 | `system spec` 核对必填/格式；日期用 ISO |
| 报表 403 | 无该报表类型角色/权限 | 申请/确认角色，或换可用的报表类型 |
| 报 429 | 超限流 | `callOp` 已重试；加大间隔、减少并发 |
| 销售为 0 | `granularity`/`fulfillmentNetwork` 传错 | 不传 fulfillmentNetwork；granularity 用 Day/Total |

## 环境依赖
- **Node >= 20**（本机 v24.11.1，脚本零第三方依赖）。
- **`spapi-dev-assistant` skill**（必需）：挂载于 `skills/spapi-dev-assistant/`。
- **MCP 包** `@amazon-sp-api-release/sp-api-dev-mcp@1.0.5`（规范数据来源，已全局安装）。

## 资源
- `scripts/ops.js` + `scripts/lib/**` — 模块化业务引擎。
- `references/api-map.md` — 运营意图 → 接口映射（订单/利润/库存/定价/改价/买家消息）。
- `references/business-logic.md` — 利润公式、库存健康评分、限流细则。
- `references/sandbox-setup.md` — 沙盒凭证、`SP_API_SANDBOX` 开关、静态/动态沙盒注意点。

## 相关 skill
- **`spapi-dev-assistant`**：底层规范查证 + LWA/SigV4 认证 + workflow 引擎。本 skill 一切接口事实均源于它。

---

## 署名
- **作者 / 维护者**：**king** 👑
- **构建协助**：C-3PO（OpenClaw 助手）
- **底层基础**：spapi-dev-assistant（官方 SP-API 规范包）
- **版本**：1.0（2026-09-03，含 15 个业务模块）

