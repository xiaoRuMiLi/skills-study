# 亚马逊运营助手 — 接口映射表 (`api-map`)

本文件把「卖家运营意图」精确到 SP-API 的 operation。**每次都要用
`spapi-dev-assistant` 的 `spapi-spec.js` 动态复核**（路径/方法/参数/必填项），
不要仅凭本表记忆——本表只作为**起点定位**，不替代规范核对。

所有端点均为 **SELLER**（需你自己的 SP-API OAuth，LWA → access token + SigV4 签名）。

---

## 1. 订单看板 (orders)

| 目的 | OpId | 方法/路径 | 说明 |
|------|------|-----------|------|
| 查订单列表 | `getOrders` | `GET /orders/v0/orders` | 按时间段/状态/渠道过滤；`MarketplaceIds` 必填 |
| 查单个订单 | `getOrder` | `GET /orders/v0/orders/{orderId}` | `orderId` 为路径参数，3-7-7 格式 |
| 查订单明细 | `getOrderItems` | `GET /orders/v0/orders/{orderId}/orderItems` | 含 SKU/数量/单价 |

- `getOrders` 关键参数：`MarketplaceIds`(必填,query)、`CreatedAfter`/`CreatedBefore`、
  `LastUpdatedAfter`/`LastUpdatedBefore`、`OrderStatuses`、`FulfillmentChannels`、
  `MaxResultsPerPage`(1-100,默认100)、`NextToken`。
- **分页**：响应含 `NextToken`，需循环直到为空；每页之间**必须限流**（见 business-logic.md）。

## 2. 利润测算 (finances + pricing)

| 目的 | OpId | 方法/路径 | 说明 |
|------|------|-----------|------|
| 按订单查财务流水 | `listFinancialEventsByOrderId` | `GET /finances/v0/orders/{orderId}/financialEvents` | 含销售/佣金/FBA费用/退款 |
| 按时间查财务流水 | `listFinancialEvents` | `GET /finances/v0/financialEvents` | 按 `PostedAfter`/`PostedBefore` 过滤 |
| 查报价/售价 | `getPricing` | `GET /products/pricing/v0/price` | `MarketplaceId`+`ItemType`(ASIN/SKU) 必填 |
| 查竞争售价 | `getCompetitivePricing` | `GET /products/pricing/v0/competitivePrice` | 竞品价格参考 |

- 利润测算优先用 `listFinancialEvents`（财务事件已含费用明细），再用 `getPricing` 补售价。
- 财务事件可能**延迟 48h**，测算时提示用户数据可能滞后。

## 3. 库存健康 (fba-inventory)

| 目的 | OpId | 方法/路径 | 说明 |
|------|------|-----------|------|
| 查库存汇总 | `getInventorySummaries` | `GET /fba/inventory/v1/summaries` | 在库/可售/在途等 |
| 建库存项(Sandbox) | `createInventoryItem` | `POST /fba/inventory/v1/items` | **仅沙盒**，沙盒专用端点 |

- `getInventorySummaries` 关键参数：`granularityType`(必填,如 `Marketplace`)、
  `granularityId`(必填,即 marketplaceId)、`marketplaceIds`(必填)、`details`(true 返回详细数量)、
  `sellerSkus`(最多50)、`startDateTime`、`nextToken`。
- **沙盒注意**：沙盒环境要用沙盒专用端点/角色，具体见 sandbox-setup.md。

## 4. 改价 / 上架 (listings-items)

| 目的 | OpId | 方法/路径 | 说明 |
|------|------|-----------|------|
| 上架/全量更新 | `putListingsItem` | `PUT /listings/{ver}/items/{sellerId}/{sku}` | body: `{productType, requirements(LISTING/LISTING_PRODUCT_ONLY/LISTING_OFFER_ONLY), attributes}` |
| **纯改价(部分更新)** | `patchListingsItem` | `PATCH /listings/{ver}/items/{sellerId}/{sku}` | body: `{productType, patches:[{op,path,value}]}`（JSON-Patch，RFC6902；只支持顶层属性） |
| 删除上架 | `deleteListingsItem` | `DELETE /listings/{ver}/items/{sellerId}/{sku}` | — |

- `sellerId`(path,必填)、`sku`(path,必填)、`marketplaceIds`(query,必填)、`body`(必填)。
- ⚠️ 价格属性路径（如 `/attributes/offer/price`）因产品类型而异，**务必以官方 Listings 属性文档核对后再执行**。
- 写操作敏感：`ops.js listings price` 默认需 `--yes` 确认。

## 5. 买家消息 (messaging)

| 目的 | OpId | 方法/路径 | 说明 |
|------|------|-----------|------|
| 查订单可用消息类型 | `getMessagingActionsForOrder` | `GET /messaging/v1/orders/{amazonOrderId}` | 返回该订单可用的消息类型(actions 列表) |
| 按类型发送 | `sendInvoice` 等 | `POST /messaging/v1/orders/{amazonOrderId}/messages/<type>` | 消息类型专用端点（无通用 sendMessage） |

- **⚠️ 多数发送操作为【受限操作】**：需要 **Restricted Data Token (RDT)**（Tokens API 额外换取，涉及买家 PII）、买家许可，且**禁纯营销**。受限操作需额外安全审核。
- 可用类型：`getMessagingActionsForOrder`、`sendInvoice`、`createConfirmOrderDetails`、`createConfirmDeliveryDetails`、`createDigitalAccessKey`、`createLegalDisclosure`、`confirmCustomizationDetails`、`createUnexpectedProblem`、`CreateWarranty`、`GetAttributes`、`createConfirmServiceDetails`。

---

## 调用通用要点（每轮都要遵守）

1. **先复核规范**：`node <spapi-dev-assistant>/scripts/spapi-spec.js "<家族>"` 确认 opId、路径、必填参数、响应码。
2. **真实调用**：用 `spapi-dev-assistant` 的 `sp-api-client.js`（可 `require()` 复用 `callSPAPI`），
   读 `.env` 凭证，LWA 换 token + SigV4 签名。
3. **强制限流**：SP-API 每个接口有频率限制（spec 里 `Rate(requests/s)`/`Burst`；响应头 `x-amzn-RateLimit-Limit`）。
   所有调用必须带**指数退避 + 抖动**重试，429 尊重 `Retry-After`，用 `x-amzn-RequestId` 记录排查。
   —— 运营助手 `ops.js` 已内置 `withRetry` 封装。
4. **MarketplaceIds / 区域**：`na`/`eu`/`fe`（中国卖家常用 `fe`）；`.env` 设 `SP_API_REGION`、
   `SP_API_MARKETPLACE_IDS`。精确 marketplaceId 用 `Sellers.getMarketplaceParticipations` 查。

---

## 来源上报模板（每轮执行）

```
来源（本地）: <spapi-dev-assistant>/bundled-servers/models/<api>/<version>.json   # 例如 orders-api-model/ordersV0.json
来源（官方）: https://developer-docs.amazon.com/sp-api/docs/orders-api-v0-reference
```

- 本地规范数据在：`<MCP包>/bundled-servers/models/<api>/<version>.json`
  （本机：`D:/node/node_modules/@amazon-sp-api-release/sp-api-dev-mcp/bundled-servers/models/`）
- 官方最新文档：`https://developer-docs.amazon.com/sp-api/docs/<api>-api-v<ver>-reference`
