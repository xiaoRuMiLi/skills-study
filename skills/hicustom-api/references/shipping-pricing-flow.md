# 运费试算 → 存档 → 各国价格/上架文案（规范 + 范例）

> 用途：指纹科技创建定制商品后，调用「运费试算」拿各国物流运费，**规范化存档**进 `database/products.csv`，
> 后期据此生成不同国家售价、上架文案。API/cookie 细节见 `shipping-quote.md`，本文聚焦「怎么算、存到哪、怎么验」。

## 一、整体链路
```
创建定制商品 → listing 入库 products.csv（含每规格包装尺寸/重量）
      │
      ▼
shipping:quote / shipping:backfill   （商家后台 cookie 鉴权）
      │
      ▼
① 写回 CSV 金额列 shipping_US/UK/CA/DE/MX/FR/ES/IT（一行=1变体）
② 写回 detail_json.profile.shipping（商品级：每国 优选+备用渠道 rich 对象）
      │
      ▼
重启 serve.js → /api/products.json 输出 → product.html 两个区块渲染
      │
      ▼
后期：成本 + 各国运费 → 各国售价 + 上架文案
```

## 二、标准口径（防错 · 必须一致）
| 列 | country | 邮编(规范) | 说明 |
|----|---------|-----------|------|
| `shipping_US` | `US` | 10001 | |
| `shipping_UK` | **`UK`** | SW1A1AA | ⚠️ **用 UK，不是 GB**（GB 试算返回 0 通道） |
| `shipping_CA` | `CA` | M5V 2T6 | |
| `shipping_DE` | `DE` | 10115 | |
| `shipping_FR` | `FR` | 75001 | |
| `shipping_ES` | `ES` | 28001 | |
| `shipping_IT` | `IT` | 00184 | |
| `shipping_MX` | `MX` | 01000 | |

- 参数：`qty=1`（默认）；包裹尺寸用**该变体**的 `package_L/W/H_cm`；计费重用 `weight_g`。
- 运费口径 = **推荐渠道**（`selectChannel`，规则见下）。

## 三、⛔ 易错点（本次已踩坑，务必遵守）
1. **英国国家码用 `UK`**：`GB` 会返回 1 条无效通道 → `selectChannel` 空抛错 / 结果为空。
2. **改了代码/数据必须重启 `serve.js`**：8098 是常驻进程，模块会被缓存；不重启则 `/api/products.json` 返回旧结构（如 `spec.shipping` 缺失 → 详情页运费列显示 “—”）。
   - 重启：`taskkill /PID <8098进程> /F` → `node scripts/tools/serve.js`。
3. **详情页两个区块数据源不同，要分别有值**：
   - 「运费试算（各国·优选渠道）」← 读 `detail.profile.shipping`（rich 对象：每国 优选+备用渠道数组）。
   - 「规格表 运费 US/UK/CA/DE/MX/FR/ES/IT 列」← 读 `/api/products.json` 的**顶层 `specs[].shipping`**（金额对象，来自 CSV `shipping_*` 列）。
   - ❌ 若只写 CSV 列：规格表有、**各国优选区块缺失**；只写 profile.shipping：反之。**两处都要写**。
4. **详情页规格表不能读 `profile.specs[].shipping`**（profile 里没有），要读顶层 `specs[].shipping`。
5. **国家码 `GB` 之外也别用其它错误码**；邮编建议用上表规范值，保持跨商品可比。

## 四、存储结构（写死）
| 位置 | 字段 | 说明 |
|------|------|------|
| `products.csv` | `shipping_US/UK/CA/DE/MX/FR/ES/IT` | 一行=1变体；存该变体**优选渠道金额**（元） |
| `products.csv` `detail_json` | `profile.shipping` | 商品级 `{ 国家: [优选渠道, 备用渠道] }`，每渠道含 `id/name/amount/day_from/day_to/rate/transport_type_text/remote_area_surcharge/freight_formula` |
| `/api/products.json` | `specs[].shipping` | 顶层规格数组，每规格 `{US,UK,CA,DE,MX,FR,ES,IT}` 金额 |
| `/api/products.json` | `detail.profile.shipping` | 同上 rich 对象（供「各国优选」区块） |

> 只存每国优选 1-2 渠道，**不存完整物流列表**（避免数据过大）。

## 五、命令 + 前端一键按钮
```bash
# 单次试算（看全部渠道 + 推荐）
node scripts/hi.js shipping:quote --country US --postcode 10001 --weight 244 --length 21.5 --width 19.5 --height 3.5 --qty 1
# 批量回填（每规格×8国 → CSV 列 + profile.shipping + 刷新后台）
node scripts/hi.js shipping:backfill --ids 12664,12661,12660,12659,12658
node scripts/hi.js shipping:backfill            # 全库
node scripts/hi.js shipping:backfill --ids 12661 --dry-run   # 只看不写
# cookie 抓取（登录态浏览器 → .env）
node scripts/tools/get-merchant-cookie.js
```

### 前端「一键算价」按钮（product.html）
- 详情页新增「🧮 物流算价」卡片：**试算 → 确认保存** 两步。
- 走本地 serve.js 端点，**cookie 始终留在服务端**：
  - `POST /api/shipping/calc` body `{ id, commit }`
  - `commit=false` → 试算预览（结果缓存到服务端 PENDING，不写库；避免预览+保存重复请求）。
  - `commit=true` → 用缓存（无则现算）写入 CSV `shipping_*` 列 + `profile.shipping` + 刷新 `manage.html`。
- 预览展示：每国「优选/备用渠道」+ 各规格 8 国金额。
- **cookie 过期**：serve.js 算价时若 cookie 失效，会**自动从已登录浏览器刷新** `.env` 的 `HICUSTOM_MERCHANT_COOKIE`（`MerchantCookie.refreshMerchantCookie`，CDP 抓取）并重试一次（本次未成功则返回错误，前端提示确认浏览器已登录 hicustom）。cookie 始终只在服务端，前端拿不到。

### 本地 serve.js 接口（端口 8098）
`node scripts/tools/serve.js` 启动，托管 `output/` 并暴露：
| 接口 | 说明 |
|------|------|
| `GET /api/products.json` | 读 `products.csv` → 商品列表（含 `specs[].shipping`、`detail.profile.shipping`），供前端渲染 |
| `POST /api/shipping/calc` `{id, commit}` | 前端「🧮 物流算价」；cookie 只在服务端 |
| cookie 自动刷新 | 失效 → 自动 CDP 抓新 cookie 写 `.env`（清 `process.env` 缓存）并重试一次；`MerchantCookie.js`；手动 `get-merchant-cookie.js` |
> ⚠️ 改动 serve.js / MerchantCookie / 数据后需**重启 serve.js**。

### 物流商偏好（「各国优选」存档过滤，服务端 `ShippingService._provPref`）
| 承运商 | 过滤 |
|--------|------|
| 云途 | **全部** |
| 递四方 | **全部** |
| 燕文 | 仅保留名称含「专线」 |
| 顺丰国际 | 仅保留名称含「专线」 |
> 每国仅存优选+备用共 ≤2 条（`selectTopN(n=2, preferProviders=true)`），避免数据过大。

## 六、📌 范例：数据提取 + 存档（以 12661 为例）
**1) 提取/算运费**（写库）
```bash
node scripts/hi.js shipping:backfill --ids 12661
```
输出（节选）：`12661 黑色/One Size | 包裹 17.5x15x2.5 135g | US=32.25 UK=22.13 CA=27.89 DE=28.4 FR=27.67 ES=25.27 IT=31.86 MX=31.88`

**2) 存档后校验**
```bash
# a. CSV 金额列
node scripts/hi.js db get 12661
# b. 线上 products.json（serve 运行中）
node -e "fetch('http://127.0.0.1:8098/api/products.json').then(r=>r.json()).then(j=>{const p=j.products.find(x=>String(x.id)==='12661');console.log('specs[0].shipping=',JSON.stringify(p.specs[0].shipping));console.log('profile.shipping.US=',JSON.stringify(p.detail.profile.shipping.US));})"
```
预期输出：
- `specs[0].shipping = {"US":32.25,"UK":22.13,"CA":27.89,"DE":28.4,"MX":31.88,"FR":27.67,"ES":25.27,"IT":31.86}`
- `profile.shipping.US = [{"name":"递四方服装专线","amount":32.25,"day_from":7.88,"day_to":10.79,"rate":98.57,...}, {...备用渠道...}]`

**3) 详情页自检**：`http://127.0.0.1:8098/product.html?id=12661`
- 应出现「运费试算（各国·优选渠道）」区块（8 国，每国 优选/备用渠道）。
- 规格表每行「运费 US/UK/CA/DE/MX/FR/ES/IT」应显示金额（非 “—”）。

## 七、提交前自检清单
- [ ] 国家码：英国用 `UK`；邮编用规范值。
- [ ] `products.csv` 8 列 `shipping_*` 已填（每变体）。
- [ ] `detail_json.profile.shipping` 已写（每国 ≥1 渠道数组）。
- [ ] 重启 `serve.js` 后 `/api/products.json` 的 `specs[].shipping` 与 `detail.profile.shipping` 均有值。
- [ ] 详情页两个区块都显示（非 “—”）。
- [ ] 原生数据（原始报价）已按精简字段存档，未存过量数据。

## 八、选价规则（写死于 `ShippingService.selectChannel`）
1. 排除：金额 ≤0 或 <5、名称含「送货上门」（国内）、「蜂鸟发仓默认物流」。
2. MX 仅「云途（含精选）」系列。
3. 优先「时效优（妥投率≥95 且 最迟≤20 天）且价最低」；否则退「有时效」里价最低；再无取有效集价最低。
4. 被选渠道无妥投时效时，`note` 提示更优备选。
