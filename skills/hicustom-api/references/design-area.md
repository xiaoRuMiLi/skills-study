# 独立流程：给商品图加"定制区"文字标记（design-area:generate）

> 用途：在商品图/设计源图上，叠加一个醒目的**定制区标记**（"YOUR DESIGN HERE" 等文字），
> 告诉顾客这里可以放自定义设计。**不依赖 AI、不上传图库、不合成**，纯粹做图。

## 何时使用（触发场景）
- 用户给出商品图/设计图，想在上面**标注"可定制区域"**；
- 用户需要"YOUR DESIGN HERE / Any Color Text Logo Photo"这类**占位/提示文字**；
- 想给多个商品图批量加同款定制区标记。

## 用法
```bash
# 源图默认读取 input/ 下所有图片；结果存 edited/<商品ID>/
node scripts/hi.js design-area:generate --product-id 12563

# 指定单张源图（用户提供）
node scripts/hi.js design-area:generate --product-id 12563 --image "D:/图.jpg"

# 无 --image 且已配 ZHIPU_API_KEY → 自动用智谱文生图(紧扣商品/尺寸/无文字无版权)
node scripts/hi.js design-area:generate --product-id 12563

# 自定义文字（主文字|副文字）
node scripts/hi.js design-area:generate --product-id 12563 --text "YOUR DESIGN HERE|Any Color Text Logo Photo"

# 布局手动覆盖（优先级高于 AI 图片理解方案）
node scripts/hi.js design-area:generate --product-id 12563 --image "图.jpg" --box dashed --text-color "#FFD700" --scale 0.8 --posV bottom
```

## 图片来源（两种，优先级）
1. **用户指定**：`--image 路径`。
2. **智谱文生图**（未指定图且配了 `ZHIPU_API_KEY`）：`glm-image` 生成，提示词紧扣**商品名/材质/推荐风格**，尺寸按**印刷区宽高比**挑选；并在提示词里明确**禁止文字/水印/logo、禁止版权或侵权图案**。
3. 兜底：读 `input/` 下图片。

## 图片理解 → 文字方案（智谱 glm-4v）
- 生成/指定图片后，调用 `glm-4v` 理解图片，输出**排版方案 JSON**：`{font, color, posV, boxW, box, scale}`。
- `font`：script/bold/elegant/modern/comic（映射到具体字族）；`color`：JSON 里给具体 hex（与背景对比醒目）。
- 失败或未配 key → 回退**自动**（按亮度选字色 + 默认无边框居中）。
- **手动参数**（`--posV/--boxW/--scale/--text-color/--box/--font`）**优先级最高**，覆盖 AI 方案。
## 注意
- 非必要不要频繁调用图片理解和图片生成每次调用都会产生费用，做到该用则用。
## 智谱配置
- `.env`：`ZHIPU_API_KEY=<在 open.bigmodel.cn 生成的 key>`（只放本机）。
- 模型：文生图 `glm-image`；图片理解 `glm-4v`。

## 水印去除（强制，必须有）
- 智谱 `glm-image` 会在右下角盖 **"AI生成" 官方水印**。
- **首选（白边裁切）**：生成提示词已要求**底部留 ~12% 纯白边**，水印落在白边里 → 用 `scripts/tools/watermark.js` 的 `cropBottomMargin` **裁掉底部白边**（`*.clean.jpg`），零痕迹。
- 回退：`removeCornerWatermark`（克隆补丁 + 高斯模糊），若裁切失败才用。
- 之后才做图片理解 + 叠加文字，保证**成品无水印**。

## 流程
1. 抓空白商品详情（`product:detail`）→ 拿到商品名、印刷面数、商品属性和描述。
2. 读取源图：`--image` 指定，或 `config.inputDir`（默认 `input/`）下所有图片，从上下文中提取客户需要处理的图片文件。
3. 如果客户提供了文件则使用图片理解方案理解图片内容，根据图片内容给出适合的文字排版方案。如果客户没有提供本地图片则利用文生图模型生成图案（切记是商品图案不是商品的效果图），需要生成的图案结合第一步拿到的商品信息、属性、印刷面数、商品描述生成提示词，提示词契合要契合商品并且图片不能包含侵权内容，商品的图案，图片大小根据第一步拿到的需要的图片参数加上下部需要裁切掉AI水印的大小，图片下方生成白边后期切掉水印。如果商品需要多张图片可以生成多张（正背面或者其他），也可以使用一张用到多个地方（根据你对商品的理解那种方式更美观）。图片出来后生成文字排版方案。
4. `DesignAreaService.mark()` 用 sharp 叠加：
   - 自动判断**明暗**（深底→白字，浅底→深字， 颜色要求和图案主体形成反差达到醒目的效果，不和内容颜色趋同的情形下优先使用丰富多彩的浅蓝，浅玫红，浅黄等）；
   - "YOUR DESIGN HERE" 主文字（粗体、居中、字间距）+ 副文字，文字适当使用字体使内容美观；
   -  标记定制区，半透明衬底提高可读性。
5. 保存到 `edited/<商品ID>/`（**商品 ID 命名的文件夹**），文件名同源图。
6. 把结果用HTML渲染文字之前的图片和之后的图片交给用户定夺，并一并返回前后的图片路径

## 依赖
- 图像处理用 `scripts/tools/` 的 sharp（无需 AI/外部 API）。
- 目录：`config.editedDir`（默认 `edited/`，可用 `HICUSTOM_EDITED_DIR` 改）。

## 与 listing:generate 的关系
- `listing:generate` = 抓详情→处理→上传→合成→入库（**生产链路**）。
- `design-area:generate` = 仅给图加定制区文字标记（**展示/占位图制作**，独立）。
- 两者可配合：先用 design-area 做出带标记的图，再作为 listing:generate 的源图。
