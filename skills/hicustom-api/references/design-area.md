<!--
 * @Description:
 * @Author: lyq
 * @Date: 2026-09-08 19:29:48
 * @LastEditTime: 2026-09-10 15:44:14
 * @LastEditors: lyq
-->
# 独立流程：给商品图加"定制区"文字标记

> 用途：在商品图 / 设计源图 / **产品效果图**上，叠加一个醒目的**定制区标记/占位文字**
> （如 `YOUR DESIGN HERE`、`Custom Door Mat`），告诉顾客这里可以放自定义设计。
>
> **两种叠字方式**（可单用也可配合）：
> - **`stamp`（本地叠字，推荐做精确文字）**：纯本地、零 API、配置驱动、N 行、颜色/字体/粗细/位置可配、支持按词换行。
> - **`design-area:generate`（AI 辅助出图+排版）**：智谱文生图生成图案 + 图片理解给排版方案。

## 何时使用（触发场景）
- 用户给出商品图 / 设计图 / 产品效果图，想在上面**标注"可定制区域"**或**叠占位文案**；
- 用户需要 `YOUR DESIGN HERE / Any Color Text Logo Photo` 这类**提示文字**；
- 想给多个商品图批量加同款文字。

---

## 方式 A：`stamp` —— 本地叠字引擎（推荐）

> 覆盖：N 行文字，每行 独立 颜色 / 字体 / 粗细 / 位置 / 字号 / 字间距 / 描边；文字块占图案宽高比；按词自动换行。
> 详见 `references/stamp.md`。**不调 AI、零成本。**

```bash
# 位置参数：内容 颜色 字体 粗细 位置（省略/填 "-" = 取 config/stamp.json 默认）
node scripts/stamp.js <图案文件路径> \
  第一行内容 第一行颜色 第一行字体 第一行粗细 第一行位置 \
  第二行内容 第二行颜色 第二行字体 第二行粗细 第二行位置

# 例：门垫成品图上的两行（第一行粉、第二行黄）
node scripts/stamp.js output/11485/images/effect_1.jpg \
  "Custom Door Mat" "#FF6FB5" modern 700 居中 \
  "Photo/Image/Text/Logo" "#FFE873" modern 700 居中

# 预设：config/stamp.json 里存整套样式，一键套用
node scripts/stamp.js output/11485/images/effect_1.jpg --preset sample

# 文件夹 → 批量，自动跳过已带 _add_text 的
node scripts/stamp.js output/11485/images
```
### 参数一览

**位置参数**（有序；省略或填 `-` = 取 config 默认）
| # | 参数 | 说明 |
|---|------|------|
| 1 | `图案文件路径` | **必选**。文件=处理单个；文件夹=批量处理，自动跳过已带 `_add_text` 的 |
| 2 | 第1行·内容 | 留空则该行不渲染 |
| 3 | 第1行·颜色 | `#RRGGBB` / CSS 颜色名 / `auto`（按底图明暗自动反差） |
| 4 | 第1行·字体 | 别名 `modern / bold / elegant / script / comic`，或系统字族字符串 |
| 5 | 第1行·粗细 | `细/常规/中/半粗/粗/特粗` 或数字 `100–900` |
| 6 | 第1行·位置 | `居中`(默认) / `偏上` / `偏下`（兼容 `middle/top/bottom`、`上/下/中间`） |
| 7–11 | 第2行·同 2–6 | 内容 颜色 字体 粗细 位置 |

**具名参数**（`--kebab-case`，可放任意位置；省略=取 config 默认）
| 参数 | 说明 | 默认 |
|------|------|------|
| `--out <文件\|目录>` | **输出图片路径**：传**文件**=按该文件名存；传**目录**=存进该目录、按 `<原名>_add_text.jpg` 命名 | 图案文件同目录 |
| `--preset <名字>` | 套用 `config/stamp.json` 的整套预设；`--preset` 单用=列出全部 | — |
| `--l1-size` / `--l2-size <占比\|像素>` | 第 1/2 行字号（≤1=占图案宽比，>1=像素） | `auto`（自适应块宽） |
| `--width-ratio <0.1~1>` | 文字块占图案宽度比 | `0.7` |
| `--height-ratio <0.1~1>` | 文字块占图案高度比 | `0.9` |
| `--no-bg` | 关闭半透明衬底 | 关（默认纯透明底） |
| `--no-compare` | 不生成前后对比页 | 生成 |
| `--compare-name <文件名>` | 前后对比页文件名 | `stamp-compare.html` |
| `--config <文件>` | 指定配置文件 | `config/stamp.json` |

- 输出默认：**图案文件同目录** / `<原名>_add_text.jpg`；对比页 `output/stamp-compare.html`（8098）。
- 参数优先级：**CLI > 预设(--preset) > config/stamp.json 默认**。
- **指定输出路径示例**：
  ```bash
  # 输出到指定文件
  node scripts/stamp.js input/x.jpg "行1" "#FF6FB5" modern 700 居中 "行2" "#FFE873" modern 700 居中 --out output/x_add_text.jpg
  # 输出到指定目录（批量时各自按 <原名>_add_text.jpg 命名）
  node scripts/stamp.js input/batch --out output/batch_out
  ```

---

## 方式 B：`design-area:generate` —— AI 辅助（文生图 + 图片理解）

> 当**没有现成图案**时，用智谱生成图案，再叠定制区文字。**不依赖 AI 的轻量场景请用 `stamp`。**

```bash
# 源图默认读取 input/ 下所有图片；结果存 edited/<商品ID>/
node scripts/design-area:generate ...   # 见下
node scripts/hi.js design-area:generate --product-id 12563
node scripts/hi.js design-area:generate --product-id 12563 --image "D:/图.jpg"
node scripts/hi.js design-area:generate --product-id 12563 --text "YOUR DESIGN HERE|Any Color Text Logo Photo"

# 排版样稿（type-setting-images/）：指定名 / 自动挑
node scripts/hi.js design-area:generate --product-id 12583 --image "图案.jpg" --sample 网球拍
node scripts/hi.js design-area:generate --product-id 12583 --image "图案.jpg" --sample auto
```

### ★ 尺寸适配：**先裁切、后加字**（关键顺序，别搞反）
用户指定源图时，必须先把它**适配到空白产品印刷区的尺寸**，**再**叠字。顺序反了（先加字后裁切）文字会被切掉——这正是"加字后的图案文字显示不全"的主因。

- 目标尺寸 = 所选印刷面 `print_areas[].width × height`（默认第 1 面）。
- 适配方式 = **cover 居中裁切**（`tools/image.js fitImage`，`position:'centre'`）。
- 命令行：
  - `--face <印刷面id>` 指定适配哪一面（默认第一面）；`node scripts/hi.js sample:list` 式的面列表见 `product:detail`。
  - `--no-fit` 关闭适配（少数"最终展示图、不再进印刷区"的场景才用）。
- 产物：先出 `<原图名>.print.jpg`（= 裁切后画布），再叠字 → `<原图名>.jpg`；归档进 `output/<id>/原稿/`（`设计原稿.jpg` = 加字前 / `设计原稿_加文字.jpg` = 加字后）。
- **为什么这样最稳**：画布比例已等于印刷区比例 → 下游 `listing:generate` 的默认 `fit=cover` 裁切变成 no-op → 文字绝不会被切。

> ⚠️ 若源图比例 ≠ 印刷区比例，cover 会**裁掉**溢出的一边（偏长的一侧两端被裁）。想让内容完整不裁，请换 `contain`（会留边）——目前 CLI 只做 cover。

### 图片来源（两种，优先级）
1. **用户指定**：`--image 路径`。
2. **智谱文生图**（未指定图且配了 `ZHIPU_API_KEY`）：`glm-image` 生成，提示词紧扣**商品名/材质/推荐风格**，尺寸按**印刷区宽高比**挑选；明确**禁止文字/水印/logo、禁止版权图案**。
3. 兜底：读 `input/` 下图片。

### 图片理解 → 文字方案
- **优先自带理解**：agent 支持图片理解就直接用；**不支持再调 `glm-4v`**（智谱）。
- **排版来源（优先级）**：
  1. **自定义样稿**（推荐，客户可指定）——调用时带 `--sample`，去 `type-setting-images/` 找样稿解析排版：
     - `--sample 网球拍` → 找该目录里名为「**网球拍**」的样稿（先精确名，再包含，再字符模糊）；
     - `--sample auto`（或 `--sample 样稿`）→ 按**商品名**自动挑最契合的样稿（字符契合度 ≥ 0.4，否则回退主图）；
     - 样稿文件命名 = **商品名 / 商品类别**（如 `衬衫.jpg`、`网球拍.jpg`、`地垫.jpg`），详见 `type-setting-images/README.md`；用 `node scripts/hi.js sample:list` 查看现有样稿。
     - 指定名未命中 → 回退空白产品主图。
  2. **未指定 `--sample`** → 默认解析**「空白产品详情主图」**（`renderings_info[0].renderings[0]`）上的占位文字布局。
  - ⚠️ **解析对象永远是「样稿 / 主图」这类排版参考图**，**不是**要叠字的图案图；拿图案图去解析会把排版带偏。
  - 模型输出（适配 stamp）：`{titleLines, title:{font,weight,posV,posH,widthRatio,letterSpacing}, sub:{...}, block:{widthRatio,heightRatio}}`：
    - **`posV`（垂直：top/middle/bottom）+ `posH`（水平：left/center/right）= 文字相对图案的方位**（如左上角 = `top`+`left`）；
    - `titleLines≥2` 时主标题用 `size:"wrap"` **逐词堆叠**复刻同款排版。
  - 匹配逻辑见 `scripts/app/Support/TypeSetting.js`（`pickSample`）。
- **职权划分**：模型只产出**文本内容 + 排版结构**（`font/weight/posV/size/行数`）；**配色不交给模型**。
- **配色：用本地工具算（不用图片理解模型）** — 客户未指定颜色时，取「与图片来源整体反差大的浅色系」：
  - 工具：`scripts/app/Support/ContrastColor.js`（CLI：`node scripts/tools/pick-color.js <图> [--region x,y,w,h]`）。
  - 方法：sharp 缩图读像素 → 背景**平均色 / 平均亮度 / 主色相 / 饱和度** → 在一组**浅色候选**里按
    `score = WCAG对比度(vs 背景) + α·色相距离 + β·饱和度` 打分取优（背景偏灰时降低色相权重）；
    多行文字用 `pickDistinctColors()` 取**色相拉开**的不同色，避免几行趋同。
  - 输出 `{color, contrast, hueDist, bgHex, bgLum, bgHue, ranked[]}`（含候选取色排名）。
- **输出排版 JSON：直接适配 `stamp` 的用法**（`lines / block / background`，见下），可整段作为 `config/stamp.json` 默认或 `--preset` 一项，也可翻译成 `stamp` 的位置参数。
- 失败 / 未配 key → 回退自动（按亮度选字色，即 `ContrastColor` 的兜底模式）。
- **手动参数优先级最高**：客户 / CLI 指明的颜色、位置、字体等覆盖以上一切。

#### 输出 JSON（适配 `stamp`）
```jsonc
{
  "lines": [
    { "text": "Custom Door Mat",       "font": "bold",   "weight": 800, "posV": "middle", "size": "auto", "letterSpacing": 0.06, "color": "#FF7AB6", "outline": { "color": "#000000", "width": 0 } },
    { "text": "Photo/Image/Text/Logo", "font": "modern", "weight": 700, "posV": "middle", "size": "auto", "letterSpacing": 0.02, "color": "#8FD3FF", "outline": { "color": "#000000", "width": 0 } }
  ],
  "block": { "widthRatio": 0.7, "heightRatio": 0.9, "vAlign": "middle" },
  "background": { "enabled": false }
}
```
- **用法一（推荐）**：整段写进 `config/stamp.json`（或做成 `--preset` 一项）→ `node scripts/stamp.js <图> --preset <名字>`。
- **用法二**：翻译成 CLI 位置参数 →
  `node scripts/stamp.js <图> "Custom Door Mat" "#FF7AB6" bold 800 居中 "Photo/Image/Text/Logo" "#8FD3FF" modern 700 居中`

字段映射（模型 JSON → `stamp`）：

| JSON 字段 | `stamp` 对应 |
|---|---|
| `lines[].text` | 位置参数「内容」 |
| `lines[].color` | 「颜色」（由 `ContrastColor` 工具计算填入） |
| `lines[].font` | 「字体」别名 `modern/bold/elegant/script/comic` |
| `lines[].weight` | 「粗细」`100–900` |
| `lines[].posV` | 「位置」`middle/top/bottom`（居中/偏上/偏下） |
| `lines[].size` | `--l1-size/--l2-size`（`auto` = 自适应块宽） |
| `lines[].letterSpacing` | 字间距（相对字号） |
| `lines[].outline` | 描边（`width:0` = 无描边） |
| `block.widthRatio/heightRatio` | `--width-ratio/--height-ratio` |
| `background.enabled` | `--no-bg`（默认关） |

### 智谱配置
- `.env`：`ZHIPU_API_KEY=<在 open.bigmodel.cn 生成的 key>`（只放本机）。
- 模型：文生图 `glm-image`；图片理解 `glm-4v`。
- **尺寸约束（glm-image）**：宽高各 **512~2880**、**32 的整数倍**、总像素 **≤ 2²²**。`ZhipuService.pickSize(印刷区w,h)` 按比例自动算合法尺寸（长边 2048）；`generateImage` 发送前再用 `normalizeSize` 兜底。⚠️ 别再用 `1280x720 / 720x1280`（720 不是 32 的倍数，会报 "size…32整数倍" 错）。
- ⚠️ **费用**：图片理解和文生图每次调用都计费，**非必要不要频繁调用**。

### 水印去除（强制，必须有）
- 智谱 `glm-image` 会在右下角盖 **"AI生成"** 官方水印。
- **首选（白边裁切）**：生成提示词已要求**底部留 ~12% 纯白边**，水印落在白边里 → `scripts/tools/watermark.js` 的 `cropBottomMargin` 裁掉底部白边（`*.clean.jpg`），零痕迹。
- 回退：`removeCornerWatermark`（克隆补丁 + 高斯模糊）。
- 之后才做图片理解 + 叠加文字，保证**成品无水印**。

---

## 变体流程：以「产品效果图」为底（出**成品展示图**，推荐）

> 场景：把「指纹科技空白产品」的**效果图**当底，再叠定制区文字，产出像客户样板那样的成品图。
> 例：拉空白「地垫/门垫」→ 合成干净效果图 → 叠 `Custom Door Mat` / `Photo/Image/Text/Logo`。

### ⚠️ 关键坑：不要直接用空白产品的 `renderings_info`
空白产品详情里的 `renderings_info[].renderings[]` 是**带 `YOUR DESIGN HERE` 占位版**的效果图；
直接把文字叠上去会**和占位文字重叠**。正确做法是先 `design:composite` 把设计压上去（占位被覆盖），拿到**干净效果图**再叠字。

### 步骤
```
① 抓空白产品详情         product:detail --id <id>            → 拿印刷区尺寸(print_areas)、风格
② 处理设计图             sharp fit 到印刷区尺寸                → tools/image.js fitImage()
③ 上传图库               gallery:upload --file design.jpg     → 拿到 gallery_code
④ 自动合成（换掉占位）    design:composite --cfgs '[{view_id,gallery_code,width,height,top_x:0,top_y:0}]'
                          → 返回 colors[].renderings[]（干净效果图 URL）
⑤ 下载效果图             fetch 主图 → 本地 effect_1.jpg
⑥ 叠定制区文字            stamp output/<id>/images/effect_1.jpg "行1.." .. "行2.."
```
- ③④ 也可用一条龙 `listing:generate --product-id <id> --images "设计图.jpg"`（它会自动处理图→上传→合成→下载→缓存）。
- ⑤ 主图 = 合成结果 `colors[0].renderings[0].big_img`（正面平铺），其余为场景图。

### 示例（本技能实跑：空白门垫 11485）
```bash
# ③ 上传设计图（先 fit 到 2560x1772 印刷区）
node scripts/hi.js gallery:upload --file output/11485/images/design-all.jpg --cn-name doormat-demo --en-name doormat-demo
# ④ 合成（把上面拿到的 gallery_code 填进 cfgs）
node scripts/hi.js design:composite --product-type-id 11485 \
  --cfgs '[{"view_id":1,"gallery_code":"4KFHZ5","width":2560,"height":1772,"top_x":0,"top_y":0}]'
# ⑤ 下载效果图后，⑥ 叠字（第一行粉、第二行黄）
node scripts/stamp.js output/11485/images/effect_1.jpg \
  "Custom Door Mat" "#FF6FB5" modern 700 居中 \
  "Photo/Image/Text/Logo" "#FFE873" modern 700 居中
```
> 产出：干净门垫效果图 + 两行定制文字（`effect_1_add_text.jpg`）。
> 提示：区域要落在**产品表面**，用 `居中`（产品占画面中部）即可；若产品偏下，用 `偏下` 或调 `--height-ratio`。

---

## 流程（design-area:generate 内部）
1. 抓空白商品详情（`product:detail`）→ 商品名 / 印刷面数 / 属性 / 描述 / **主图 `renderings_info`**。
2. **解析排版（客户未指定时）**：图片理解（优先**样稿** `type-setting-images/`，否则**空白产品主图**）→ 产出**同款排版** JSON（`{titleLines,title,sub,block}`，结构适配 `stamp`），**含文字相对图案的方位（`posV` 垂直 + `posH` 水平）**。
   - ⚠️ 解析对象是**主图**，**不是**要叠字的图案图；优先 agent 自带图片理解，不支持再调 `glm-4v`。
   - `titleLines≥2` → 主标题用 `size:"wrap"` **逐词堆叠**复刻同款；宽度取 `title.widthRatio`。
3. 读取源图：`--image` 指定，或 `config.inputDir`（默认 `input/`）下所有图片；无图且配了 `ZHIPU_API_KEY` → 用文生图生成**商品图案**（非实物效果图），紧扣商品信息/属性/印刷面数/描述、禁侵权；尺寸按印刷区 + 底部留白（便于裁水印）。可按面生成多张。
3.5 **★ 适配印刷区（先裁后加字）**：每张源图先 `fitImage(fit:'cover', position:'centre')` 到所选印刷面 `w×h` → 出 `<原名>.print.jpg` 作为叠字画布（`--no-fit` 可关）。
4. **配色**：用本地工具 `ContrastColor`（`pickDistinctColors`）算「与底图反差大的浅色系」，多行取互异色；**不喂模型**。
5. **叠加文字**：统一走 **`stamp`（`TextStampService`）引擎** —— 默认 **纯透明底、无描边**；支持 N 行 / 颜色 / 字体 / 粗细 / 位置 / 字号自适应 / **按词换行**。
6. 保存到 `edited/<商品ID>/`（**商品 ID 命名的文件夹**），文件名同源图；归档到 `output/<id>/原稿/`（加字前后各一份）。
7. 用 HTML 渲染「加文字前 / 加文字后」交用户定夺，并一并返回前后图片路径。
   - **对比页带规格行**（`CompareRenderer`）：每张图下方显示 `宽 × 高 px · 文件大小`；有原图时再显示 `原图 W×H → 裁切后 W×H`，尺寸不同打「**已裁切**」黄标、相同打绿色「（未裁切）」——用来核对适配是否裁到了内容。
   - 页面：`<pagesDir>/design-area-compare.html` → http://127.0.0.1:8098/design-area-compare.html（`stamp` 的 `stamp-compare.html` 同一渲染器，也有规格行）。

## 常见错误（避坑清单）⚠️
| ❌ 错误做法 | ✅ 正确做法 |
|---|---|
| 拿**图案图**去做图片理解解析排版 | 拿**空白产品主图**（`renderings_info[0].renderings[0]`）解析排版 |
| 让**模型输出配色**（常给棕色等低反差色） | 配色交给本地工具 `ContrastColor`（反差大的浅色系） |
| 文字带**半透明衬底 / 描边**（出现"阴影"） | `stamp` 默认**纯透明底、无描边**（`background.enabled=false`、`outline.width=0`） |
| 多词主标题排成一行、与主图不符 | `titleLines≥2` 时用 `size:"wrap"` **逐词堆叠** |
| 标题用整块宽度 → 顶边 / 过大 | 宽度取**主标题自身** `title.widthRatio` |
| 直接拿空白产品 `renderings_info` 当成品底图 | 先 `design:composite` 合成**干净效果图**再叠字 |
| **先加字、后适配/裁切**（字被裁掉 → 显示不全） | **先按印刷区 cover 居中裁切，再叠字**（`design-area:generate` 已默认这么做） |
| 中文/超长串当普通"空格词"换行 → 单行溢出画布被裁 | `TextStampService` 已对超宽 token **按字符断行**兜底（无需手动处理） |
| 想用自定义样稿却仍让模型读空白主图 | 用 `--sample <名字\|auto>` 从 `type-setting-images/` 选样稿 |

## 原稿归档规范（必做✅）
- 每个「合成/设计」所用的图案原稿，归档到 **`output/<产品id>/原稿/`**（加文字前必存；叠加了文字则另存 `_加文字` 版）。
- `design-area:generate` / `listing:generate` 由 `OriginalArchive.js` 自动完成。
- ⚠️ 独立的 `stamp` 命令**不自动归档**（它不知道 productId）；需要归档时按上述规范手工另存，或走 `design-area:generate` / `listing:generate`。

## 依赖
- 图像处理用 `scripts/tools/` 的 **sharp**（`stamp` 无需 AI/外部 API；`design-area:generate` 的文生图/理解需 `ZHIPU_API_KEY`）。
- 目录：`config.editedDir`（默认 `edited/`，可用 `HICUSTOM_EDITED_DIR` 改）。

## 与 listing:generate 的关系
- `listing:generate` = 抓详情→处理→上传→合成→入库（**生产链路**）。
- `design-area:generate` / `stamp` = 给图加定制区文字标记（**展示/占位图制作**，独立）。
- 三者可配合：`listing:generate` 合成干净效果图 → `stamp` 叠展示文字。
