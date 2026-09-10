<!--
 * @Description: 
 * @Author: lyq
 * @Date: 2026-09-08 19:29:48
 * @LastEditTime: 2026-09-09 12:24:33
 * @LastEditors: lyq
-->
# 工作流：hicustom 定制产品 → 上架素材（listing:generate）

> 本技能核心场景：把「空白产品 + 自定义设计图」一键变成「定制产品 + 上架展示图 + 文案 + 报表」。
> 触发词：获取商品详情、抓取商品、处理图片上传、自动合成、上架素材、listing 生成。

## 何时使用
当用户需要以下任一需求时，**加载本工作流**（`references/workflow.md`）：
- 给了链接 `https://www.hicustom.com/productType/item/<id>` 或商品 id；
- 需要把客户图/自定义图做成商品上架图；
- 需要批量抓取商品属性、价格、包装、印刷区做 listing / 选品。

## 5 步流程（+ 可选「合成后叠字」分支）
```
① 抓空白产品详情        GET  /api/v1/product-type/{id}          → product:detail
② 解析产品画像          把原始 JSON 解析成结构化画像            → ProductProfile.js
③ 处理客户图→填充尺寸    从上下文获取图片源，如果客户没有提供，询问客户使用的图片来源，是否需要做定制款（定制款需要加文字，参照design-area.md处理图片来源和加工），sharp fit(cover/contain) 到印刷区尺寸   → tools/image.js
④ 上传图库 + 自动合成    gallery:upload → design:composite
⑤ 缓存 + CSV + HTML     product.json / product.csv / index.html  → 可扩展模板

⑥（可选）合成效果图 → 叠字   用 ④ 的干净效果图(colors[].renderings[])当底 → stamp 叠宣传/占位文字
   ⚠️ 用④合成后的效果图当底；别拿空白产品的 renderings_info（带 YOUR DESIGN HERE 占位，叠字会重叠）
   → node scripts/stamp.js <效果图> "行1 颜色 字体 粗细 位置" "行2 ..."（见 references/stamp.md / design-area.md「变体流程」）
```
> `stamp` 是纯本地叠字引擎（N 行/颜色/字体/粗细/位置/文字块宽高比/按词换行/`--preset`），
> 与 ④`design:composite`（云合成出效果图）前后配合：**先合成出底图，再本地叠字**。

## 原稿归档规范（必做 ✅）
每个「合成/设计」所用的图案原稿，必须归档到 **`output/<产品id>/原稿/`**，便于客户后续索要图案时直接取用。
- **加文字前原稿**：始终保存，文件名取源文件/固定名（如 `设计原稿.jpg`）。
- **加文字后版本**：若在图案上叠加了文字（定制区标记 / 品牌字 / 标语），必须**额外保存一份**，文件名加 `_加文字` 后缀（如 `设计原稿_加文字.jpg`），做到前后两份都在。
- **触发接口**：
  - `listing:generate`（自动合成）→ 归档「图案原稿」（加文字前源图）。
  - `design-area:generate`（定制区加文字）→ 归档「加文字前」+「加文字后」两份。
- 归档由 `scripts/app/Support/OriginalArchive.js` 自动完成（`archiveOriginal()`），无需手工拷贝。

## 一条龙命令
```bash
# 单图（默认应用到所有可设计面）
node scripts/hi.js listing:generate --product-id 11243 --images "客户图.jpg"

# 不同面不同图（:view 指定面）
node scripts/hi.js listing:generate --product-id 11243 --images "图A.jpg:1,图B.jpg:2"

# dry-run：只拉数据+处理图+报表，不写入图库、不合成（推荐先跑）
node scripts/hi.js listing:generate --product-id 11243 --images "客户图.jpg" --dry-run

# 可选项
--fit cover|contain     # 图片填充方式，默认 cover（居中裁切填满）
--default-color-id N    # 合成预设颜色
--default-view-id N     # 合成预设面
--external-id X         # 自定义产品编码（用于后续查重/幂等）
--customer-id Y         # 自定义会员编码
```

## 独立子命令（每一步可单独用）
| 命令 | 作用 |
|------|------|
| `product:detail --id 11243` | 抓空白产品详情 |
| `gallery:upload --file x.jpg ...` | 上传图库 |
| `design:composite --product-type-id 11243 --cfgs '[...]'` | 自动合成（出干净效果图） |
| `stamp <效果图> "行1 颜色 字体 粗细 位置" "行2 ..."` | 本地叠字（合成后叠宣传/占位文字） |
| `listing:generate ...` | 一条龙 |

## 完成后自动登记
- `listing:generate` 会把结果 **upsert 进 CSV 类数据库**（`database/products.csv`）并刷新管理后台 `output/admin.html`。
- 用 `db list/get/update/delete` 管理；`db admin` 重新生成后台。详见 `references/database.md`。

## 何时 NOT 用
- 真实下单（`order:create`）→ 涉及资金，需用户明确同意（走 `order:*` 命令）。
- 翻译成他国文字 → 本流程默认保留中/英原始描述，不自动翻译。

## 依赖
- 图像处理需 **sharp**，已装入 `scripts/tools/node_modules`（见 `scripts/tools/package.json`）。
- 其余零第三方依赖（原生 fetch）。
