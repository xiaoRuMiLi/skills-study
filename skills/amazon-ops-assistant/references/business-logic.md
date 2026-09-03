# 业务逻辑与规则 (`business-logic`)

运营助手把「卖家想做的事」翻译成量化结论。以下阈值/公式为**运营经验默认值**，
用户可覆盖；若来自经验而非官方规范，标注「推测，需以官方为准」。

---

## 一、利润测算公式

**单笔净利 ≈ 商品售价 − 亚马逊佣金 − FBA配送费 − 广告费 − 其他费用 + 退款修正**

优先依据 `listFinancialEvents` 返回的真实财务事件，常见字段：
- **销售入账**：`SAFE_T_REVENUE` / `ProductCharges`（商品款）
- **佣金**：`SAFE_T_REVERSAL` / `FBA_FEE` / `COMMISSION`（佣金）
- **FBA 配送费**：`FBA_FEE`（含 `FBA_FEE_NON_*`）
- **退款**：`REFUND` / `SAFE_T_REVERSAL`(负数方向)

> 具体字段名以 `spapi-spec.js "financialEvents" --schema <响应类型>` 的 definition 为准。
> **不要凭记忆写字段名**——每轮都从规范核对。

**毛利率 = 净利 ÷ 销售额 × 100%**

**注意**：财务事件可能延迟最长 48 小时，测算结果要提示用户"数据可能滞后"。

---

## 二、库存健康评分

依据 `getInventorySummaries`（`details=true`）的字段：
- **在库量** `availableQuantity` / **可售** `sellableQuantity` / **在途** `inboundWorkingQuantity` 等。

评分规则（默认阈值，可覆盖）：
| 状态 | 判定 | 建议 |
|------|------|------|
| 🔴 断货 | `可售库存 ≤ 0` | 立即补货；检查在途/采购 |
| 🟠 低库存 | `可售库存 < 日均销量 × 备货天数(默认14)` | 安排补货 |
| 🟢 健康 | 介于低库存与冗余之间 | 维持 |
| ⚪ 冗余 | `可售库存 > 日均销量 × 备货天数(默认90)` | 考虑清仓/促销降库存 |

> 日均销量 = 近 N 天销量 ÷ N（默认取近 30 天，需订单/报表数据支撑）。
> 备货天数阈值是**运营经验默认值**，属「推测，需以官方为准」，用户可调整。

---

## 三、限流与重试（强制）

SP-API 每个接口都有频率限制（`Rate(requests/s)` + `Burst`），超限返回 **HTTP 429**，
响应头 `x-amzn-RateLimit-Limit` / `x-amzn-RateLimit-Remaining` / `Retry-After`。
频繁超限会被亚马逊拒绝拿不到数据，**甚至触发风控导致账号封禁**。

**任何真实调用必须：**
1. 按 spec 的 rate / burst 控制频率（分页/批量时**均匀分发**，不要 while/for 连发）。
2. 失败重试用**指数退避 + 随机抖动**（如 base=1s，factor=2，加 jitter）。
3. 处理 429 时**尊重 `Retry-After`** 头。
4. 用 `x-amzn-RequestId` 记录每次请求，便于定位问题。
5. 分页自动串 `NextToken`，页间**must sleep**。

> `ops.js` 已内置 `withRetry()`（指数退避+抖动+遵循Retry-After+记录RequestId），
> 所有业务调用必须走它，**禁止裸调**。

---

## 四、授权 / 区域 / 市场 (SELLER)

- **授权**：LWA 用 `refresh_token` 换 `access_token`，再用 AWS **SigV4**（`service=execute-api`）签名。
  凭证只放本机 `.env`（绝不在聊天出现），用 `sp-api-client.js --env-check` 只显示 ✅/❌。
- **区域**：`na` / `eu` / `fe`。中国卖家常用 `fe`。
- **MarketplaceIds**：精确值用 `Sellers.getMarketplaceParticipations` 查。
- **真实生产 vs 沙盒**：**开发/测试一律先用沙盒**，避免污染真实后台数据、避免 IP 关联风控。
  详见 sandbox-setup.md。
