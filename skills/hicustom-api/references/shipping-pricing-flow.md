# 运费试算 → 同步 product.csv → 生成各国价格/上架文案

> 用途：在指纹科技创建定制商品后，调用「运费试算」拿到各国物流运费，同步进 `database/products.csv`，
> 后期据此生成**不同国家的售价**和**上架文案**。保存**完整试算报价 JSON** 供后续挑选物流单位。

## 整体链路
```
指纹科技创建定制商品 → listing 入库 database/products.csv（含包装尺寸/重量）
        │
        ▼
shipping:quote --country <国> --postcode <邮编> --weight <weight_g> --length <package_L_cm> --width <package_W_cm> --height <package_H_cm> --qty 1
        │  （商家后台 cookie 鉴权，见 shipping-quote.md）
        ▼
① 保存【完整报价 JSON】→ shipping_quotes 列（该变体 × 所有国家 的全部物流渠道列表）
② 按「时效 + 价格较优」选渠道 → 写入各国金额列 shipping_<国家> + detail_json.shippingByVariant
        │
        ▼
后期：用 商品成本 + 各国运费 → 生成 各国售价 + 上架文案
```

## 支持国家（8 国）与邮编
| 国家 | country | 参考邮编 |
|------|---------|---------|
| 美国 | `US` | 10001 |
| 英国 | `UK` | SW1A 1AA |
| 加拿大 | `CA` | M5V 3L9 |
| 德国 | `DE` | 10115 |
| 墨西哥 | `MX` | 06000 |
| 法国 | `FR` | 75001 |
| 西班牙 | `ES` | 28001 |
| 意大利 | `IT` | 00100 |

## 选价规则（写死于 `ShippingService.selectChannel`）
1. **排除**：金额 <=0 或 <5（特殊/平台专享/超廉小包）、「送货上门」（国内 CN）、「蜂鸟发仓默认物流」。
2. **墨西哥 `MX` 仅选「云途精选」**：优先取名称含「精选」的云途渠道，否则退回云途系列（`/云途/`）；墨西哥不走其它物流。
3. **时效+价格较优**：在候选里优先选「有时效（妥投率≥95 且 最迟时效≤20 天）」且价格最低者；
   无则退选「有时效」里价最低；再无则取有效集价最低。
4. 被选渠道若**无妥投时效**，`note` 自动标注：`XX 元最低但未给妥投时效；可选用 YY 元（d1~d2天/rate%）`。

## product.csv 存储（精简）
> ⚠️ 只存每国 **优选 1-2 个渠道**，字段精简；**不存**完整物流列表（避免数据过大拖垮上千商品）。

- **金额列**（快查/价格生成）：`shipping_US/UK/CA/DE/MX/FR/ES/IT`（元），一行=一个变体，按该变体 `weight_g`+`package_L/W/H_cm` 试算填入（= 优选渠道 amount）。已加进 `ProductRepository.SCHEMA`。
- **detail_json.profile.shippingByVariant**（按 variant_id 聚组，每变体每国为**数组，最多 2 个**渠道）：
  ```json
  {
    "7037": {
      "MX": [ { "id":11125,"name":"云途精选普货","amount":63.22,"day_from":9.79,"day_to":12.69,"rate":98.48,"transport_type_text":"...","remote_area_surcharge":"0","freight_formula":"[...]=63.22元" } ],
      "US": [ {..."递四方服装专线"...}, {..."顺丰国际电商专线"...} ]
    }
  }
  ```
  精简字段：`id / name / amount / day_from / day_to(时效) / rate(妥投率) / transport_type_text(货物类型) / remote_area_surcharge(偏远费) / freight_formula(运费公式)`。
  `profile.shipping`=默认变体(7037)；`profile.specs[].shipping`=各规格 8 国金额对象。
- `selectTopN(channels,{country,n})`（ShippingService）返回前 N 优的精简渠道数组。大列 `shipping_quotes` 已移除。

## product.html 展示
- `/api/products.json` 返回 `detail`（含 `profile.shippingByVariant`/`profile.specs`）与 `specs`（含 8 国 shipping）。
- `output/product.html`：
  - 「运费试算（各国 · 优选渠道）」区块：默认变体的 8 国 **优选渠道 + 备用渠道**（渠道/运费/时效/妥投率/货物类型/偏远费）。
  - **规格表**每行「运费 US/UK/CA/DE/MX/FR/ES/IT」列（各变体 8 国金额）。
- 访问：`http://127.0.0.1:8098/product.html?id=<商品id>`（先 `node scripts/tools/serve.js`）。
