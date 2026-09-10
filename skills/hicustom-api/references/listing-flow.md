# 亚马逊上架文案流程（listing 生成 · 规范）

> 定位：把 hicustom 定制商品 → 亚马逊**上架文案 + 上架表格(xlsm) + 预览页面**。
> 触发词：上架文案、listing 生成、亚马逊标题/五点/描述/关键词、xlsm 填充、上架预览。
> 性质：**独立流程规范**（初版已固化，不足点后续迭代）。实现脚本 `scripts/run-listing-flow.js`。

## 流程总览
```
商品库(products.csv / product.json 获取商品真实属性)
      │
      ▼
⓪ 前置（必须，先于上架流程）   ← shipping:backfill 获取物流费 → pricing:backfill 定价
      │                            （若无物流费直接跑上架，售价会被算成极低，见 ⚠️ 下方）
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
④ 上架表格   ← 回填原始模板 → listing_filled.xlsx；亚马逊模板 xlsm 只读参考
      │
      ▼
⑤ 检查       ← 平台政策(规则) + 图片侵权(glm-4v)
      │
      ▼
⑥ 渲染       ← 通用模板 output/listing.html?id=<id>（Amazon 详情页风格，用 output/<id>/images）
      │
      ▼
⑦ 给出数据完整性报告,交人工审阅，并给出output/listing.html?id=<id>访问路径。
```

> ⚠️ **⓪ 前置：必须先获取物流费(运费)再跑上架流程**。若跳过 `shipping:backfill`，商品的 `shipping_*` 列为空 → 定价用 0 运费算 → 售价会被严重低估（如 12609 因物流费缺失算成 £3.35，明显错误）。所以**流程顺序必须是：先 `shipping:backfill --ids <id>` （再 `pricing:backfill --ids <id>` 自动触发定价）→ 再 `run-listing-flow.js <id>`**。

## 数据源（真实属性，禁止编造）
- 商品：`database/products.csv` 或 `output/<id>/product.json`（`profile`：identity/attributes/designFaces/variants/pricing/colors/sizes/images）。
- **定制标识**：`products.csv` 的 `is_custom` 列（`1`=定制商品，由 `listing:generate` 写入；非定制为 `0`）。
- **主图区分**：定制合成接口返回 `colors[].renderings[]`（无显式主图标记，按**视图顺序**，第 1 张 = 正面/主图）。落盘到 `output/<id>/images/` 时**命名区分**：`main-1.jpg`（主图）+ `other-N.jpg`（非主图），对应 CDN URL 记为 **`customization.effectImages`**。⚠️ **上架表格的图一律用 `customization.effectImages`（设计后效果图）；`products.csv` 的 `main_image`/`other_images` 是指纹科技空白商品图，绝不用于上架**。
- 只取**真实存在**的属性（材质/尺寸/颜色/领型/口袋/松紧腰/印花/场景/洗涤），LLM 只可基于给定事实，不得虚构材质/颜色/尺寸/功能。
- 品牌：用户未提供时用 **`Generic`（无牌）**。

## 字段规范（来源：亚马逊 Inventory 模板）
- 模板文件：用户提供（如 `D:/Downloads/PAJAMAS_TOILET_SEAT (1).xlsm`），含 `Data Definitions`（字段/必填性）、`Template`（列结构）、`Instructions` 等 sheet读取该表格获取上架数据规范。
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
| `product_type` | col2 | Required | **只读提取模板下拉合法值**（命名范围 `product_type1.value` → `Dropdown Lists` 表，当前 = `PAJAMAS` / `TOILET_SEAT`），按商品名自动匹配（`scripts/app/Support/TemplateProductTypes.js`）；匹配不到留空进缺失清单 |

## ② 关键词
- 亚马逊站点联想词接口：`https://completion.amazon.co.uk/api/2017/suggestions?mid=<MID>&alias=aps&prefix=<产品英文名称需自行翻译>&limit=12` 返回 `suggestions[].value`。如果获取到的不是对应产品，可换名称多次执行直到获取到正确内容。
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

## ④ 上架文件（回填「亚马逊原始模板」xlsm —— 亚马逊只认原模板，新造表不认）
- **最终上架文件 = 回填后的原始模板（保存为 `.xlsx`）**：`scripts/tmp_fill_xlsm.py` 从原始模板 `.xlsm` 读取 → 按 `Template` 表列(第4行 label 定位列，写第7行数据行) → 去掉宏、保存为 **`output/<id>/listing/listing_filled.xlsx`**。⚠️ 亚马逊**只接受 `.xlsx`（工作簿）或 `.txt/.tsv`，不接受 `.xlsm`（宏）**，故必须输出 `.xlsx`。
- 模板路径 = `config/listing.templatePath`（默认 `PAJAMAS_TOILET_SEAT (1).xlsm`；可用环境变量 `LISTING_TEMPLATE_PATH` 覆盖）。
- **列不写死、按模板动态导出**（`ListingSheet.js` + `TemplateFields.js`）：读取模板 → 得到每列「列表签 + 底层 attribute + 必填状态」。**Product Id Type / Product Id（UPC/EAN）用户明确不需要，已从表格/缺失清单排除**。
- **Product Type 取值 = 模板下拉合法值**（命名范围 `product_type1.value`，只读提取，见 `TemplateProductTypes.js`），按商品名自动匹配（睡衣→PAJAMAS、马桶盖→TOILET_SEAT）；此逻辑**固化进流程**。
- **图片 URL 数据源 = 合成后的「设计效果图」`customization.effectImages`**（设计后 CDN 图，非空白商品图）。⚠️ **绝不能用 `database/products.csv` 的 `main_image`/`other_images`**（那是指纹科技**空白商品**默认图）。无设计图则进 `listing_missing.json`（需先 `design:composite` 合成）。
- 产物：`listing_filled.xlsx`（**上传用，回填原始模板**）+ `record.json`（全量字段）+ `listing_missing.json`（待补必填清单）。`listing_upload.csv/json` 不再生成；预览由 `listing:table`/`serve.js` 直接读 `listing_filled.xlsx`。
- **▶ 防漏（必须）**：下拉/枚举类必填项最容易漏，`tmp_fill_xlsm.py` 内置：
  1. **默认下拉值表 `DEFAULT_FILL`**：对已知下拉必填项自动补合法值（`Variation Theme Name=Size/Colour`、`Country of Origin=China`(国家全名非CN)、`Dangerous Goods Regulations=Not Applicable`、`Item Condition=New`、`Item Package Quantity=1`、`Fulfillment=AMAZON_EU`、`Quantity=1` 等）；服饰类(PAJAMAS)额外补 `Target Gender/Department Name/Apparel Size System/Class`，马桶盖(TOILET_SEAT)不补服饰字段。
  2. **漏填检测**：扫描关键/必填列（SKU/Product Type/Item Name/Brand/Variation Theme/Country of Origin/Dangerous Goods/Item Condition/Main Image/Description/Bullet/Price/Quantity），仍为空的会打印 `⚠️ 以下关键/必填列仍为空`。
  3. 输出 `✔ 关键/必填列已全部填写` 表示可上传；`⚠️ 仍为空` 则需人工补（多为 UPC/EAN 或类目码）。
- **轻量读取命令 `listing:table`**：只读原始模板 `Template` 表的第4/5/7行（列标签/attribute/回填数据行），不加载其它 sheet，读取量小。用法 `node scripts/hi.js listing:table --product-id <id> [--filled] [--json]`，返回回填列的 列号+列名+attribute+值。
- **定制商品（is_custom=1）必须补定制属性**：说明“可定制任意颜色、任意图案（全幅印花）”，并引导点击 “Customized Now” 上传图片/文字/logo 实现个性化。
- **定制一致性（强制规则）**：以 `products.csv` 的 `is_custom` 列为准——`is_custom=1` **必须**写定制说明；`is_custom=0` **绝对不能**描述为定制。`check_report.custom_consistency` 校验一致性。

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

## ⑥ 渲染（预览页，渲染「回填后的原始模板」数据）
- 一份 `output/listing.html`，读取 `GET /api/listing.json?id=<id>`（返回 **`sheet` = 原始模板回填数据（listing_filled.xlsm 第7行）** + 图片 URL 列表）。
- **预览渲染数据源 = 回填后的原始模板**（标题/品牌/价格/五点/描述/搜索词/属性取自其第7行；图片 = `Main Image URL` + `Other Image URL 1-8`）。页尾附「上架表格数据」折叠区。
- ⚠️ **上传文件 = `listing_filled.xlsx`（回填原始模板）；listing.html 仅预览**。
- 无设计图时提示先合成；布局仿 Amazon 详情页；访问 `http://127.0.0.1:8098/listing.html?id=<id>`。

## ⑦ 定价（pricing:calc / pricing:backfill）
> ⭐ **前置：必须先获取物流费**。售价公式含物流费，若 `shipping_*` 为空（没跑 `shipping:backfill`），**售价会被算成极低**（实测 12609 因无物流费 = £3.35）。所以**顺序必须是：先 `shipping:backfill --ids <id>` → (自动触发 `pricing:backfill`) → 再 `run-listing-flow.js <id>`**。流程脚本在无运费时会打印 ⚠️ 警告提示先跑物流。
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
- `scripts/run-listing-flow.js`：读取商品 → 关键词 → LLM 文案 → **回填原始模板(listing_filled.xlsx)** + record.json + check_report.json。
- `scripts/tmp_fill_xlsm.py`：**回填亚马逊原始模板 → 输出 `.xlsx`**（从 `.xlsm` 读、去宏存 `.xlsx`；按第4行 label 定位列，写第7行数据行；产物 listing_filled.xlsx，可直接上传）。
- `scripts/app/Support/ListingTable.js` + `scripts/app/Console/Commands/ListingTableCommand.js`：**`listing:table` 命令**——轻量读回填模板(仅Template表4/5/7行)的回填列(列号+列名+value)，serve/预览复用。
- `scripts/app/Support/TemplateProductTypes.js`：只读提取模板 Product Type 下拉合法值 + 按商品名匹配（固化进流程）。
- `scripts/app/Support/TemplateFields.js`：只读解析模板 → 每列「标签 + 底层 attribute + 必填状态」+ 可用的 product types。
- `scripts/app/Support/ListingSheet.js`：按模板动态导出预览列（Required + 实际填值列），并按 attribute 名把 record 映射到对应列。
- 所需 LLM：智谱 `glm-4`(文本) / `glm-4v`(图片审查)；联想词接口无鉴权；回填脚本需要 `python + openpyxl`。

## 已知不足（待迭代）
- 关键词转化率无真实 PPC 数据。
- xlsm 服饰类必填字段（variation 尺寸矩阵/browse node/合规字段）为占位，需按账号类目校准。
- 图片主图非纯白底产品照（用了合成效果图），正式上架需处理主图规范。
- 政策/侵权检查为尽力而为，人工复核为主。
- 未接 SP-API 权威字段校验（后续接入 spapi-dev-assistant）。
