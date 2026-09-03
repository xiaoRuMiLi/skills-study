# SP-API Sandbox 配置指南 (`sandbox-setup`)

开发/测试阶段**一律用 SP-API Sandbox**（沙盒），性质是亚马逊提供的**测试环境 + 沙盒卖家账号/角色**，
用来在**不污染真实后台数据、不触发 IP 关联风控**的前提下验证业务逻辑。

> ⚠️ **安全红线**：凭证（CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN）**绝不进聊天/回复**，
> agent 不读取明文值，只由你本人填进本机 `.env`。
> 密钥一旦泄露可能被冒用导致**账号被永久封禁/关店**，务必妥善保管、不截图、不进公开仓库。

---

## 一、凭证存放位置（重要）

真实 `.env` **放「项目工作区」，不放 skill 目录**（避免打包 skill 时把密钥烤进去）：

```
..\amazon-dev\.env
```

绝对路径：`C:\Users\Administrator\.openclaw\workspace-dev\amazon-dev\.env`

运营助手 `ops.js init-env` 会：
1. 确保 `amazon-dev/` 存在；
2. 若 `.env` 不存在，从 `spapi-dev-assistant/references/.env.example` 拷贝一份模板过去；
3. 跑 `--env-check` 显示哪些键已填/缺失（**不显示值**）。

---

## 二、`.env` 需要填的键

```ini
SP_API_CLIENT_ID=<你的沙盒 client_id>
SP_API_CLIENT_SECRET=<你的沙盒 client_secret>
SP_API_REFRESH_TOKEN=<你的沙盒 refresh_token>
SP_API_REGION=fe            # na / eu / fe
SP_API_MARKETPLACE_IDS=<marketplaceId列表，逗号分隔>
SP_API_SANDBOX=true         # 沙盒开关（重要！缺了会打生产端点 → 403）
```

> **`SP_API_SANDBOX=true` 必不可少**：`sp-api-client.js` 默认签**生产 host**
> （`sellingpartnerapi-<region>.amazon.com`）。沙盒必须用
> **`sandbox.sellingpartnerapi-<region>.amazon.com`**，否则持沙盒凭证打生产会
> 得到 **403 Unauthorized（access token invalid）**。该开关让客户端自动用沙盒 host。

### 沙盒端点（官方）
| 区域 | 生产 host | 沙盒 host |
|------|-----------|-----------|
| 北美 na | sellingpartnerapi-na.amazon.com | sandbox.sellingpartnerapi-na.amazon.com |
| 欧洲 eu | sellingpartnerapi-eu.amazon.com | sandbox.sellingpartnerapi-eu.amazon.com |
| 远东 fe | sellingpartnerapi-fe.amazon.com | sandbox.sellingpartnerapi-fe.amazon.com |

> 沙盒 **LWA 换 token 端点不变**：`https://api.amazon.com/auth/o2/token`，用沙盒 client_id/secret/refresh_token。

---

## 三、Sandbox 特别注意事项

1. **沙盒端点/角色**：部分操作（如 `createInventoryItem`）只在沙盒环境可用，且必须指向**沙盒专用端点**。
   真实调用与沙盒调用的 endpoint host 可能不同，拼 URL 时注意。
2. **沙盒数据是预置的**：沙盒里是亚马逊给的**模拟卖家数据**，不是你的真实店铺——验证的是**逻辑/字段/签名**，
   不是真实业务量。
3. **启用沙盒**：需在 Seller Central / 开发者后台为应用开启 Sandbox，并拿到沙盒的 refresh token。
4. **切换生产**：自测通过、确认无误后再切到真实授权调用；上线后留意**出口 IP 稳定**，避免异常 IP 触发风控。

---

## 四、验证是否配置成功

```bash
# 1. 凭证是否就位（只看 ✅/❌）
node <spapi-dev-assistant>/scripts/sp-api-client.js --env-check

# 2. 规范是否就位（应列出 50 个 API）
node <spapi-dev-assistant>/scripts/spapi-spec.js --list

# 3. 运营助手能否识别环境
node <amazon-ops-assistant>/scripts/ops.js check
```

三项全绿即可开始调业务模块。

### 沙盒业务模块注意点
- **静态沙盒（如 Orders）**：`getOrders` 只有精确传测试用例参数才返回 mock 数据
  （`CreatedAfter=TEST_CASE_200` + `MarketplaceIds=ATVPDKIKX0DER`，**多一个参数就匹配失败**）。`ops.js` 已做沙盒感知，自动切换。
- **动态沙盒（如 FBA Inventory）**：`getInventorySummaries` 默认返回空，**需先用沙盒专用
  `createInventoryItem`（`POST /fba/inventory/v1/items`）播种商品**（`sellerSku`/`marketplaceId`/`productName`），
  播种后汇总即出现该 SKU（但数量为 0，会被判断货）。
- 沙盒返回的是**预置/mock 数据，非真实店铺**；切生产后才返回真实业务数据。
