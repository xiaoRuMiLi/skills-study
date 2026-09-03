# 卖家意图 → SP-API 接口速查表

面对模糊意图时，先按「你想做什么」定位到下面的 **API 家族**，再用
`spapi-spec.js "<家族关键词>"` 查到具体操作。避免用 "update/cancel/get" 这种泛动词去猜。

## 常见运营意图

| 你的意图 | 推荐接口 (OpId) | 所属 API | 查询建议 |
|---------|----------------|----------|---------|
| 查订单 / 列表 | `getOrders` | Orders | `spapi-spec.js "orders"` |
| 查单个订单 | `getOrder` | Orders | `spapi-spec.js "getOrder"` |
| 查订单明细 | `getOrderItems` / `getOrderItemsBuyerInfo` | Orders | `spapi-spec.js "orderItems"` |
| **算利润** | `listFinancialEvents`（资金流水）+ `getPricing`（售价） | Finances + Pricing | `spapi-spec.js "financialEvents"` → `"pricing"` |
| **改价格 / 上架** | `putListingsItem` | Listings Items | `spapi-spec.js "listings price"` |
| **查库存** | `getInventorySummaries` | FBA Inventory | `spapi-spec.js "fba inventory"` |
| **查报表** | `createReport` / `getReport` | Reports | `spapi-spec.js "reports"` |
| 查商品信息 | `getCatalogItem` | Catalog Items | `spapi-spec.js "catalog item"` |
| 查市场售价 | `getPricing` / `getCompetitivePricing` | Product Pricing | `spapi-spec.js "pricing"` |
| 查退货 | `getOrderItems`（含退货）+ Reports | Orders / Reports | `spapi-spec.js "orderItems"` |
| FBA 发货 | `createFulfillmentOrder` | Fulfillment Outbound | `spapi-spec.js "fulfillment outbound"` |
| 取消 FBA 履约 | `cancelFulfillmentOrder` | Fulfillment Outbound | `spapi-spec.js "fulfillment outbound"` |
| 发货通知 | `createShipmentConfirmation` | Merchant Fulfillment | `spapi-spec.js "shipment confirmation"` |
| 买家消息 | `sendMessage` / `getMessagingActionsForOrder` | Messaging | `spapi-spec.js "messaging"` |
| 订阅通知 | `createDestination` / `createSubscription` | Notifications | `spapi-spec.js "notifications"` |
| 查授权/店铺 | `getMarketplaceParticipations` | Sellers | `spapi-spec.js "sellers"` |

## 调用通用要点
- 所有 **SELLER** 接口都要：LWA refresh_token 换 access_token + **SigV4 签名**（service=`execute-api`）。
  直接用 `scripts/sp-api-client.js`。
- **区域**：`na`(北美) / `eu`(欧洲) / `fe`(远东/日本/新加坡/澳洲)。中国卖家常用 `fe`。
  —— `.env` 里设 `SP_API_REGION`。
- **MarketplaceIds / sellerId / asin** 等必填值要按你店铺实际填（用 `sellers` 接口可查）。
- 别用 `cancel`/`update`/`get` 泛动词单独做关键词——定位不准时按**上表 API 家族**查。

## 常用 Marketplace IDs（示例）
- 美国 `ATVPDKIKX0DER` / 日本 `A1VC38T7YXB528` / 德国 `A1PA6795UKMFR9` / 英国 `A1F83G8C2ARO7P`
> 精确值用 `Sellers.getMarketplaceParticipations` 查询为准。
