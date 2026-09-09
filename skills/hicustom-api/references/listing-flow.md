# 亚马逊上架文案流程（listing 生成 · 规范）

> 定位：把 hicustom 定制商品 → 亚马逊**上架文案 + 上架表格(xlsm) + 预览页面**。
> 触发词：上架文案、listing 生成、亚马逊标题/五点/描述/关键词、xlsm 填充、上架预览。
> 性质：**独立流程规范**（初版已固化，不足点后续迭代）。实现脚本 `scripts/run-listing-flow.js`。

## 流程总览
```
商品库(products.csv / product.json 获取商品真实属性)
      │
      ▼
① 字段规范   ← 亚马逊 Inventory 模板(Data Definitions) / 后期接 SP-API
      │
      ▼
② 关键词     ← 亚马逊站点联想词接口(suggestions) + 搜索结果词
      │
      ▼
③ 文案生成   ← 大模型(智谱 glm-4) 按《上架规范》生成（只用真实属性，禁止虚构）
      │
      ▼
④ 填表       ← 写入 xlsm(亚马逊模板对应列) + record.json
      │
      ▼
⑤ 检查       ← 平台政策(规则) + 图片侵权(glm-4v)
      │
      ▼
⑥ 渲染       ← 通用模板 output/listing.html?id=<id>（Amazon 详情页风格，用 output/<id>/images）
      │
      ▼
⑦ 给出数据完整性报告,交人工审阅
```

## 数据源（真实属性，禁止编造）
- 商品：`database/products.csv` 或 `output/<id>/product.json`（`profile`：identity/attributes/designFaces/variants/pricing/colors/sizes/images）。
- **定制标识**：`products.csv` 的 `is_custom` 列（`1`=定制商品，由 `listing:generate` 写入；非定制为 `0`）。
- **主图区分**：定制合成接口返回 `colors[].renderings[]`（无显式主图标记，按**视图顺序**，第 1 张 = 正面/主图 = `default_view_id`）。落盘到 `output/<id>/images/` 时**命名区分**：`main-1.jpg`（主图）+ `other-N.jpg`（非主图）；`main_image` / `other_images` 列存对应 CDN URL（`|` 分隔）。
- 只取**真实存在**的属性（材质/尺寸/颜色/领型/口袋/松紧腰/印花/场景/洗涤），LLM 只可基于给定事实，不得虚构材质/颜色/尺寸/功能。
- 品牌：用户未提供时用 **`Generic`（无牌）**。

## 字段规范（来源：亚马逊 Inventory 模板）
- 模板文件：用户提供（如 `D:/Downloads/PAJAMAS_TOILET_SEAT (1).xlsm`），含 `Data Definitions`（字段/必填性）、`Template`（列结构）、`Instructions` 等 sheet。
- 上架核心字段（亚马逊 UK `en_GB` / `A1F83G8C2ARO7P`）：
| 字段 | 列(示例) | 必填 | 说明 |
|------|---------|------|------|
| `item_name` | col7 | Required | 标题 ≤70 字符，核心词前置 |
| `brand` | col9 | Required | 无牌填 Generic |
| `bullet_point` #1-#5 | col38-42 | Required | 5 卖点各 ≤400 字 |
| `product_description` | col37 | Required | ≤1500 字，`</br>` 分段 |
| `generic_keyword` #1 | col43 | Optional | ≤250 字，空格分隔无符号 |
| `material` | col60 | Recommended | |
| `color` / `colour_map` | col69/70 | Conditional | |
| `apparel_size`(system/class/body) | col54-59 | Conditional | |
| `main_product_image_locator` | col27 | Optional | 主图 URL |
| `other_product_image_locator_1-8` | col28-35 | Optional | 附图 URL |
| `product_type` | col2 | Required | 服饰类（如 SHIRT） |

## ② 关键词
- 亚马逊站点联想词接口：`https://completion.amazon.co.uk/api/2017/suggestions?mid=<MID>&alias=aps&prefix=<词>&limit=12` 返回 `suggestions[].value`。
- 用多条**种子词**（产品词/核心词）批量取联想词，按词频排序取前，也可以按照销量和评分高的在售商品选取和他一样的关键词 N，例如: 搜“custom tablecloth” 提取销量高的和评分高的套用其关键词。
- ⚠️ 只有**参考热度/词频**代理，**真实转化率需 PPC 广告数据**。

## ③ 文案规范（提取自《ZW-12000 弹性行李箱保护套》prompt，通用化到任意定制商品）
> 定位：亚马逊欧美站运营专家，用英式英文编写英国站&加拿大站 Listing（标题、亮点、关键词、5 卖点、描述、参数）。
> 输出顺序：**标题 → 产品亮点 → 关键词 → 卖点 → 产品描述 → 产品参数(材质/尺寸)**。

### 1) 整体要求
- 尽量多埋入**高转化率关键词**（长尾+核心），且融入同一产品**不同表达**的关键词；一个产品**至少 3 个不同表达的核心产品词**。

### 2) 标题（item_name）
- 不超过 **70 字符**；**核心关键词前置**；至少埋入 1-2 个核心关键词；整标题**单词重复 ≤3 次**（介词、连接词除外）。

### 3) 产品亮点 / Item Highlight（title_differentiation）
- 不超过 **120 字符**；关键词和标题**不重复**；以产品长尾词和核心卖点构成；单词重复 ≤3 次（介词/连接词除外）。

### 4) 关键词（generic_keyword）
- 总计 ≤ **250 字符**；相同单词**不超过 3 次**；**不使用逗号或符号隔开**（空格分词）；加入标题中未出现、但符合买家搜索习惯且产品符合的**扩展搜索词**。

### 5) 卖点（bullet_point ≥5 条）
- ①每个卖点埋入**不同表达**的产品核心关键词，且**每个卖点开头包含核心关键词**；
- ②包含基础属性：**材质、尺寸、颜色**（多个可合并到一个卖点统一阐述）；
- ③有**使用场景**描述，带动想象力；
- ④其中一条要阐述产品帮目标消费者**在什么场景解决什么问题**（多场景可用英文排比句简化）；
- ⑤加一条**礼物**卖点：哪些场景/节日、向哪些人群赠送（适用则包含**宠物爱好者、公司/企业团队**；多种人群用英文排比句简化）；
- ⑥加一条**其他用途拓展**（本品还可当什么用/作其他产品）；
- ⑦总共 **5 条**，每条 ≤ **400 字符**；
- ⑧卖点前**不要用 `-`、`•`**；
- ⑨如果属于定制商品每条卖点都要包含**如何定制**：引导客户点击 **“Customized Now”** 进入定制页，上传图片/文字/logo 即可获得定制商品。

### 6) 产品描述（product_description）
- ①**列点式**，核心信息前置；
- ②包含**如何定制**描述（“Customized Now” 引导）；
- ③增加卖点未提到的**使用场景**；
- ④ ≤ **1500 字符**；
- ⑤每段/每个要点之间加 **`</br>`** 实现上架段分段，**不能用其他 HTML 代码或语言**；
- ⑥描述中**不要用 `•`**，可用 `-`；
- ⑦整段回答：**我们的产品是什么？目标人群的使用场景？**
- ⑧优先展示**和卖点不重复**的信息。

### 7) 注意事项（合规红线）
- 只针对**成年人**人群；**不要提及未成年人**（孩子、儿童等）。
- **禁用词**：`promotion / promotional / environment friendly / brand / branded / advertising / advertised / advertisement / vendors / vendor` 及任何**品牌词**（如 mac 等）。
- 英式英文（UK / CA）。

### 8) 保真后处理（防虚构）
- 所有内容**只基于商品库真实属性**（`products.csv` / `product.json`），禁止虚构材质/颜色/尺寸/功能。
- 材质为 polyester satin（仿真丝）时**不得写成 silk**（自动 `silk → satin`）。
- 缺「Customized Now」定制引导则自动补；描述缺 `</br>` 分段则按句拆分。

## ④ 填表
- 映射到 xlsm `Template` 表对应列（见上表），写一个数据行（单 SKU/Parent）。
- 生成 `output/<id>/listing/record.json`（结构化字段）+ `listing_filled.xlsm`（保留 VBA 填充件）。
- **主图/附图**：record 的 `main_image_url` = 合成图第 1 张（`main-1.jpg` 对应 CDN URL），`other_image_urls` = 其余（`other-N.jpg`）。
- **定制商品（is_custom=1）必须补定制属性**：说明“可定制任意颜色、任意图案（全幅印花）”，并引导点击 “Customized Now” 上传图片/文字/logo 实现个性化。
- **定制一致性（强制规则）**：以 `products.csv` 的 `is_custom` 列为准——`is_custom=1` **必须**写定制说明（任意颜色/图案 + Customized Now）；`is_custom=0` **绝对不能**描述为定制（自动清洗掉 customise / Customized Now / upload your image 等措辞）。`check_report.custom_consistency`（is_custom ↔ copy_mentions_custom）校验一致性。
- **自动补 + 缺失清单**：流程自动填 `Fabric Type=Polyester`、`Country of Origin=CN`、`Dangerous Goods=No`、包裹尺寸/重量、`Fulfillment=AMAZON_EU`、`Quantity=1`、`Number of Boxes=1`，并输出 **`output/<id>/listing/listing_missing.json`**（待用户/账号补的必填：Product Type 类目码、UPC/EAN 等），便于一次性看缺什么。
- 服饰类字段（size system=UK / class=Regular / body_type / number_of_pieces 等）按类目补；不足的以示例/占位，后期按账号类目校准。

## ⑤ 检查
- **平台政策**（规则库）：标题≤200/70、五点非空、命中禁词/未成年人词等。
- **图片侵权**（glm-4v 看主图）：识别真实人物肖像/名人/品牌商标/版权角色 → RISK；否则 OK。
- 输出 `check_report.json`（policy + image 结论）。⚠️ 尽力而为，不能保证过审。

## ⑤b 主图规范化（本地 sharp，零费用）
- 目的：产出符合亚马逊主图规范的产品图（纯白底、≥1600px、留白居中、高质量 JPG）。
- **纯本地 sharp 处理，不调用任何模型/图片理解接口**（零 API 费用）：`rotate → flatten(白底) → resize(1600x1600, fit=contain, 白边) → JPEG(95)`。
- 源图：优先本地 `images/**/main-1.jpg`（产品渲染图），否则下载 `record.main_image_url`。
- 产物：`output/<id>/images/main-amazon.jpg`；`/api/listing.json` 把它排第一（`main`），模板作为主图。
- 背景：指纹科技图片通常已符合亚马逊规范，本步骤是安全兜底（幂等），不改内容、只保证尺寸/白底。

## ⑥ 渲染（通用模板，不逐产品一个）
- 一份 `output/listing.html`，读取 `GET /api/listing.json?id=<id>`（返回 record + 本地图片列表 output/<id>/images/**）。
- 布局仿 Amazon 商品详情页：左图库（本地 images），右标题/品牌/价格/五点/属性，下方描述、搜索词。
- 访问：`http://127.0.0.1:8098/listing.html?id=<id>`。
- serve.js 端点：`GET /api/listing.json?id=`（无 record 则 404 提示先跑流程）。

## ⑦ 定价（pricing:calc / pricing:backfill）
- 公式：**售价 = (采购 + 物流费) ÷ 汇率 ÷ (1 - 利润率30% - 平台成本)**
- **配置驱动**：国别参数集中在 **`config/pricing.json`**（佣金/退款率/VAT/汇损/平台成本/数字税/精度/汇率/汇率更新时间），改配置即可，无需改代码。
- **汇率缓存(1天)**：实时取 **ECB(Frankfurter) 中间价**(open.er-api 后备)，**取小不四舍五入**（非墨前2位=1位小数、墨前3位=2位小数），写入 config 并记 `rate_updated_at`；**>1天 才重新拉取，1天内复用缓存**，避免重复拉取。
- **自动触发**：`shipping:backfill` 跑完会自动跑 `pricing:backfill`（同批商品 8 国定价 → detail_json.pricing）。
- 平台成本（国别，来自定价逻辑表）：
| 站点 | 币种 | 平台成本 | 参考汇率 |
|------|------|---------|---------|
| UK | GBP | 43.23% | 9 |
| DE | EUR | 38.36% | 7.7 |
| FR | EUR | 42.36% | 7.7 |
| US | USD | 20.00% | 6.7 |
| CA | CAD | 23.45% | 4.8 |
| MX | MXN | 20.00% | 0.38 |
| ES | EUR | 44.01% | 7.7 |
| IT | EUR | 44.01% | 7.7 |
- 采购价 = 商品 `min_price`（CNY）；物流 = 该国家 `shipping_*`（CNY）。
- 命令：
```bash
node scripts/hi.js pricing:calc --product-id 12563 --country UK          # 参考汇率
node scripts/hi.js pricing:calc --product-id 12563 --country UK --live   # 实时汇率(中间价，取小)
node scripts/hi.js pricing:calc --product-id 12664 --country MX
node scripts/hi.js pricing:backfill [--ids 12664,...]                    # 一次算8国售价→detail_json.pricing
```
- **多国售价展示**：`pricing:backfill` 把 8 国售价写入 `detail_json.pricing` → `/api/products.json` 返回 → **`product.html` 详情页显示「各国建议售价」表**（国家/售价/汇率/来源）；`listing.html` 显示目标站点建议售价（record.price）。

## ⑧ 中文审阅翻译（listing:translate / listing.html 中文按钮）
- 目的：审阅国外文案时，点 `listing.html` 顶栏「🌐 中文」按钮，把英文标题/五点/描述/搜索词**下方显示中文**（或切换），便于发现问题。
- **只读**：翻译写入 `output/<id>/listing/translation.json`，**不改 record.json / 上架表格(xlsm)**。
- 单独命令：`node scripts/hi.js listing:translate --product-id <id> [--force]`。
- 前端按钮调 `GET /api/listing/translate?id=X`（有缓存直接返回，无则用智谱 glm-4 翻译并缓存）。

## 实现脚本
- `scripts/run-listing-flow.js`：读取商品 → 关键词 → LLM 文案 → record.json + check_report.json（不含 HTML，预览走通用模板）。
- `scripts/tmp_fill_xlsm.py`：读 record.json → 写 `output/<id>/listing/listing_filled.xlsm`。
- 所需 LLM：智谱 `glm-4`(文本) / `glm-4v`(图片审查)；联想词接口无鉴权。

## 已知不足（待迭代）
- 关键词转化率无真实 PPC 数据。
- xlsm 服饰类必填字段（variation 尺寸矩阵/browse node/合规字段）为占位，需按账号类目校准。
- 图片主图非纯白底产品照（用了合成效果图），正式上架需处理主图规范。
- 政策/侵权检查为尽力而为，人工复核为主。
- 未接 SP-API 权威字段校验（后续接入 spapi-dev-assistant）。
