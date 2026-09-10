# 物流费试算规范（运费计算 · shipping:*）

> 本规范把「计算物流费」固化为标准流程：**cookie 鉴权 → 按规范参数试算 → 回填数据库 shipping_* 列 → 刷新管理后台**。
> 关联命令：`shipping:quote`（单次试算）、`shipping:backfill`（批量回填）。

## 适用范围
- 选品/上架前评估每单物流成本；下单前确定 `order:create` 的 `shipping_amount`。
- 开放平台（`api.hicustom.com`）**没有**运费试算端点；必须走商家后台 `www.hicustom.com/merchant/shippingRule/calculateNew`，**会话 cookie 鉴权**。

## 前置条件：登录 cookie（必备）
- 在浏览器登录 `www.hicustom.com/merchant`，然后把会话 cookie 写入 `.env` 的 `HICUSTOM_MERCHANT_COOKIE`。
- 抓取方式（从已登录的浏览器，无需手粘）：
  1. 确定浏览器已开 hicustom 商家页（如 `/merchant/customerProduct/index`）。
  2. 用 Chrome DevTools Protocol 直接连该页 target，取 `Network.getCookies`（urls 含 `https://www.hicustom.com`），拼成 Cookie 头写入 `.env`。
  3. 工具脚本：`scripts/dev/oneshot/get-merchant-cookie.js`（自取 CDP 端口/页面，写入 `.env`，不打印 cookie 值）。
- 起效键：`PHPSESSID`、`UCSDK_COOKIES`（登录态）。cookie 过期 → `shipping:quote` 报 `COOKIE_EXPIRED`，重取即可。

## 计算参数口径（固定）
| 项 | 取值 |
|----|------|
| `qty` | 默认 `1`（可用 `--qty` 改） |
| 包裹尺寸 | 用**该规格（变体）**的包装 `L×W×H cm`（`package_*_cm`） |
| 计费重 | `weight_g`（发海外走体重；体积重由平台按 L×W×H 自动算） |
| 目的国 + 邮编 | 见下表（对应 `products.csv` 的 `shipping_*` 列） |
| 物流公司及线路 | 云途、递四方、燕文专线、顺丰国际，专线燕文和顺丰只选一些专线，云途和递四方选择全部 |
| 运费口径 | **推荐渠道**（`selectChannel`：时效较优+价低，排除特殊/国内/平台专享通道，MX 只取云途精选） |

## 标准国家清单（8 国）+ 邮编
| 列 | 国家码 | 邮编例 |
|----|--------|--------|
| `shipping_US` | US | 10001 |
| `shipping_UK` | **UK**（不是 GB） | SW1A1AA |
| `shipping_CA` | CA | M5V 2T6 |
| `shipping_DE` | DE | 10115 |
| `shipping_FR` | FR | 75001 |
| `shipping_ES` | ES | 28001 |
| `shipping_IT` | IT | 00184 |
| `shipping_MX` | MX | 01000 |

> ⚠️ **英国必须用 `UK`**。`GB` 会返回 0 条有效通道（已验证），导致试算为空。

## 命令
```bash
# 0. 先确保 cookie 在 .env（见上）
# 1. 单次试算（看全部渠道+推荐）
node scripts/hi.js shipping:quote --country US --postcode 10001 --weight 244 --length 21.5 --width 19.5 --height 3.5 --qty 1

# 2. 批量回填：对商品的每个规格 × 8 国试算，写 products.csv 的 shipping_* 列，并刷新 manage.html
node scripts/hi.js shipping:backfill --ids 12664,12661,12660,12659,12658
node scripts/hi.js shipping:backfill                              # 缺省回填数据库里全部商品
node scripts/hi.js shipping:backfill --ids 12664 --dry-run        # 只看不写
```
- `shipping:backfill` 逐规格（每行=1规格）按各自包装/重量试算，避免不同码数尺寸重量差异导致运费失真；同时把每国「优选+备用渠道」rich 对象写入 `detail_json.profile.shipping`，供详情页「运费试算（各国·优选渠道）」区块渲染。
- 回填后 `db get <id>` 的 `shipping` 字段、`manage.html`、`product.html`（规格表运费列 + 各国优选区块）都会显示该商品 8 国运费。
- ⚠️ 服务端代码/数据变更后要**重启 `serve.js`** 生效。

## 渠道选择规则（selectChannel）
- 剔除 `amount < 5`、以及「送货上门/蜂鸟发仓默认物流」等非跨境/特殊通道。
- MX：只保留「云途（优先含"精选"）」系列。
- 优先在「妥投率≥95% 且 最迟时效≤20天」的渠道里取价最低；否则取「有时效」里最低；再否则取有效集里最低。
- 推荐渠道含义：**时效+价格较优**（非绝对最低价）。

---

## 接口细节（逆向记录，非官方文档）
页面：`https://www.hicustom.com/merchant/shippingRule/calculation`（MFN）、`/calculationFba`（FBA）。
结果表为 Vue 组件 `calculation.*.js`（`window.vueTable`），数据由父页面 `setData` 事件注入。

### 接口
```
GET https://www.hicustom.com/merchant/shippingRule/calculateNew?isSearch=1&shipping_status=&country=US&province=&postcode=10001&platform=&transport_type=&shipping_method_id=0&shipping_id_flag=0&weight=200&length=20&width=10&height=5&qty=1&express_price=&page=1
```
- 方法：GET；host：`www.hicustom.com`（商家 web 后端，**cookie 鉴权**，非开放平台）。

### 请求参数（query）
| 参数 | 说明 |
|------|------|
| `isSearch` | 1 |
| `shipping_status` | 空 |
| `country` | 目的地国家码（如 US、**UK**） |
| `province` | 州/省（可空） |
| `postcode` | 邮编 |
| `platform` | 平台（空=全部；电铺） |
| `transport_type` | 货物类型 |
| `shipping_method_id` | 0 |
| `shipping_id_flag` | 0 |
| `weight` | 计费重量(g)（必填） |
| `length`/`width`/`height` | 包裹长宽高(cm)（体积重） |
| `qty` | 数量 |
| `express_price` | 申报金额（可空） |
| `page` | 1 |

### 响应结构
```json
{ "status": 1000, "code": "success", "msg": "成功",
  "data": { "data": [ { ...渠道对象... } ] } }
```
渠道对象关键字段：`id/charge_id/rule_id`、`name`、`amount`(元字符串)、`weight/origin_weight`、`qty`、`volume/volume_divisor`、`is_bilister`、`day_from/day_to`、`shippingDeliveredPeriod.delivered_time_effect_day_begin/end`、`delivered_rate`、`country_code`、`transport_type_text`、`platform_text`、`remote_area_surcharge/is_remote_area`、`freight_formula`、`discount`、`description/size_limit_text`、`warehouse_remark`。

### 注意
- `order:create` 载荷有 `shipping_amount` 字段（错误码 4014 印证），运费需在下单前试算得出填入。
