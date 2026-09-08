# 运费试算（邮费试算）接口 — 逆向记录

> ⚠️ 来源：从商家后台「订单 → 物流管理 → 运费试算」页面，用浏览器网络抓包逆向得出（**非官方文档**）。
> 页面：`https://www.hicustom.com/merchant/shippingRule/calculation`（MFN）、`/merchant/shippingRule/calculationFba`（FBA）。
> 结果表为 Vue 组件 `calculation.*.js`（`window.vueTable`），数据由父页面 `setData` 事件注入。

## 接口

```
GET https://www.hicustom.com/merchant/shippingRule/calculateNew?isSearch=1&shipping_status=&country=US&province=&postcode=10001&platform=&transport_type=&shipping_method_id=0&shipping_id_flag=0&weight=200&length=20&width=10&height=5&qty=1&express_price=&page=1
```

- **方法**：GET
- **路径**：`/merchant/shippingRule/calculateNew`
- **host**：`www.hicustom.com`（商家 web 后端，**会话 cookie 鉴权**；非开放平台 `api.hicustom.com`）

## 请求参数（query）

| 参数 | 说明 |
|------|------|
| `isSearch` | 1 |
| `shipping_status` | 空 |
| `country` | 目的地国家码（如 `US`、`GB`） |
| `province` | 州/省（可空） |
| `postcode` | 邮编 |
| `platform` | 平台（空=全部；电铺） |
| `transport_type` | 货物类型 |
| `shipping_method_id` | 0 |
| `shipping_id_flag` | 0 |
| `weight` | 计费重量(g)（**必填**参与计费） |
| `length` / `width` / `height` | 包裹长宽高(cm)（体积重） |
| `qty` | 数量 |
| `express_price` | 申报金额(可空) |
| `page` | 分页，1 |

## 响应结构

```json
{
  "status": 1000, "code": "success", "msg": "成功",
  "data": { "data": [ { ...渠道对象... } ] }
}
```

渠道对象关键字段（一次返回多物流渠道，按价格排序）：

| 字段 | 说明 |
|------|------|
| `id` / `charge_id` / `rule_id` | 物流/计费规则 id |
| `name` | 物流方式（如 递四方服装专线、E邮宝、顺丰国际电商专线） |
| `amount` | 运费（元，字符串），如 `"37.52"` |
| `weight` / `origin_weight` | 计费重 / 原始重(g) |
| `qty` | 件数 |
| `volume` / `volume_divisor` | 体积(cm³) / 材积除数（0=无抛） |
| `is_bilister` | 是否按材积重计费 |
| `day_from` / `day_to` | 妥投时效范围（天） |
| `shippingDeliveredPeriod.delivered_time_effect_day_begin/end` | 50%~90% 妥投时效（天） |
| `shippingDeliveredPeriod.delivered_rate` | 妥投率(%) |
| `shippingDeliveredPeriod.country_code` | 国家码 |
| `transport_type_text` | 货物类型（纺织品/带磁/含电…） |
| `platform_text` | 适用平台（亚马逊,独立站,…） |
| `remote_area_surcharge` / `is_remote_area` | 偏远附加费(元) / 是否偏远 |
| `freight_formula` | 运费公式明文，如 `"[11.50+⌈(200-101)/1⌉*0.081]*1.00+18.00+0.00+0=37.52元"` |
| `discount` | 折扣 |
| `description` / `size_limit_text` | 限制说明（尺寸/禁运） |
| `warehouse_remark` | 承运商/配送服务说明(HTML) |

## ⚠️ 关键待确认点

- 此接口是 **商家 web 后端**（`www.hicustom.com` + 会话 cookie），而 hicustom-api skill 用 **开放平台**（`api.hicustom.com` + access_token）。
- 需确认开放平台是否有**等价运费试算端点**，或能否用 access_token 直接调 `/merchant/shippingRule/calculateNew`（同后端不同网关？）。
- `order:create` 载荷已有 `shipping_amount` 字段（错误码 4014 印证），说明运费需在下单前由试算得出填入。
