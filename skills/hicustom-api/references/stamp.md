# 独立流程：给图案叠加可配置文字（stamp）

> 用途：在一张「图案」图上叠加 **N 行文字**（内容 / 颜色 / 字体 / 粗细 / 位置），
> 用于批量制作带占位/提示文案的上架素材。**纯本地、只依赖 sharp、零 API 调用**。
>
> 与 `design-area:generate` 的区别：后者是「AI 文生图 + 图片理解」的重链路；
> `stamp` 是「图已就绪、只精确叠字」的轻链路，互相独立、可串联
> （先用 design-area 生成带标记的图，或直接用 stamp 批量叠字）。

## 用法

```bash
# 位置参数（省略或填 "-" = 取 config/stamp.json 默认）：
node scripts/stamp.js <图案文件路径> \
  第一行内容 第一行颜色 第一行字体 第一行粗细 第一行位置 \
  第二行内容 第二行颜色 第二行字体 第二行粗细 第二行位置

# 例：全部默认（config 里 YOUR DESIGN HERE / Any Color Text Logo Photo，淡黄粗体居中）
node scripts/stamp.js input/12661/面1.clean.jpg

# 例：覆盖两行（颜色 / 字体别名 / 粗细 / 位置）
node scripts/stamp.js input/12661/面1.clean.jpg \
  "CUSTOMIZABLE" "#FFE873" bold 800 居中 \
  "Add Your Text · Logo · Photo" "#67E8F9" elegant 400 偏下

# 也可走主入口子命令（等价）
node scripts/hi.js stamp input/12661/面1.clean.jpg

# 套用预设（config/stamp.json 的 presets）：一条命令出样板样式
node scripts/stamp.js input/12661/面1.clean.jpg --preset sample
node scripts/stamp.js --preset            # 单用 = 列出全部预设
```

## 图案文件路径（必选，第一个参数）
- 传**文件**：处理该文件。
- 传**文件夹**：处理夹内所有图片（`png/jpg/jpeg/webp`），并**跳过已带 `out.suffix`（默认 `_add_text`）的文件**（可重复跑、幂等）。

## 取值规则
| 字段 | 取值 |
|---|---|
| 位置（垂直） | `居中`(默认) / `偏上` / `偏下`；兼容 `middle/top/bottom`、`上/下/中间`、`center` |
| 对齐（水平） | `左` / `居中`(默认) / `右`；兼容 `left/center/right`（`lines[].align`，或 `--l1-align/--l2-align`） |
| 颜色 | `#RRGGBB` / CSS 颜色名 / `auto`(按底图明暗自动反差) |
| 字体 | 别名：`modern / bold / elegant / script / comic`；也接受系统字族字符串 |
| 粗细 | 关键字：`细/常规/中/半粗/粗/特粗`，或数字 `100–900` |
| 内容 | 整行留空则该行不渲染（可只做单行） |

> **自动配色（工具，不用模型）**：`node scripts/tools/pick-color.js <图> [--region x,y,w,h]`
> → 按「WCAG 对比度 + 色相距离 + 饱和度」在浅色候选里挑**与底图反差大**的颜色，并给出**两行互异**配色；
> 实现：`scripts/app/Support/ContrastColor.js`（`pickContrastColor` / `pickDistinctColors`）。

## 输出
- 存到**图案文件所在目录**，文件名 `<原文件名>_add_text.jpg`（如 `面1.clean.jpg` → `面1.clean_add_text.jpg`）。
- 自动生成前后对比页：`output/stamp-compare.html`（→ http://127.0.0.1:8098/stamp-compare.html）。

## 文字块与自动换行
- `block.widthRatio`（0.1~1，默认 **0.7**）：整块文字占图案宽度比 = 块内最宽行宽度上限。
- `block.heightRatio`（0.1~1，默认 **0.9**）：整块文字占图案高度比 = 块高度上限。
- `block.safeMargin`（默认 **0.045**）：**安全边距**——**任何情况下文字都不贴图案边**；可用区 = 画面减去安全边距，换行宽度 / 水平对齐 / 垂直夹取都以此为界。
- **逐单词换行**：某行文字按其字号宽度**超过块宽**时，按单词贪心折行。
  例：`DESIGN YOUR CAR SHADE`（显式大字号）→ `DESIGN` / `YOUR CAR` / `SHADE`。
- **字号 `size` 取值**（`--l1-size/--l2-size` 或 config `lines[].size`）：
  - `"auto"`（默认）= 单行自适应到块宽；
  - `"wrap"` = **逐词堆叠**（字号取「最宽单词占满块宽」→ 每行≈一个单词，如 `YOUR`/`DESIGN`/`HERE`）；
  - 数字（≤1 = 占图案宽比；>1 = 像素）。
- 若整块高度**超过块高上限**，则整体**等比缩小**字号直至放得下（宽度仍以换行优先）。
- 位置：整块相对 `block.vAlign`（默认居中）垂直居中；`block.lineGap` 行间距、`block.rowGap` 折行行距。

## 预设（preset）
把一整套样式（`lines` + `block` + `background` 等）存进 `config/stamp.json` 的 `presets` 里，用 `--preset <名字>` 一键套用。
- `node scripts/stamp.js <图> --preset sample`；`--preset` 单用 = 列出全部预设。
- 优先级：**CLI 参数 > 预设 > config 默认**（预设只覆盖它写了的部分）。
- 内置 `sample`：主句 `DESIGN YOUR CAR SHADE` 大字按词换行 + 下方 `any text color image logo` 脚本副行。

```jsonc
"presets": {
  "sample": {
    "desc": "示例：主句大字按词换行 + 下方脚本副行",
    "block": { "widthRatio": 0.7, "heightRatio": 0.9 },
    "lines": [
      { "text": "DESIGN YOUR CAR SHADE", "color": "#FF7A2E", "font": "bold", "weight": 800, "posV": "middle", "size": 0.16, "letterSpacing": 0.02, "outline": { "color": "#000000", "width": 0 } },
      { "text": "any text color image logo", "color": "#FFFFFF", "font": "script", "weight": 600, "posV": "middle", "size": "auto", "letterSpacing": 0, "outline": { "color": "#000000", "width": 0 } }
    ]
  }
}
```

## 可选具名参数
`--config <文件>` · `--preset <名字>` · `--out <文件|目录>` · `--no-compare` · `--no-bg` · `--l1-size/--l2-size <占比|像素>` · `--l1-align/--l2-align <left|center|right>` · `--width-ratio/--height-ratio <0.1~1>` · `--safe-margin <0~0.2>` · `--compare-name <文件名>`

## 配置文件 `config/stamp.json`
默认值来源，**CLI 位置参数 > config > 内置兜底**。要点：
- `out.suffix`（默认 `_add_text`）· `out.compare`（默认 true）
- `block.{widthRatio,heightRatio,vAlign,nudgeUp,lineGap,rowGap}`：文字块尺寸与排版（见上「文字块与自动换行」）
- `background.{enabled,color,radius,padX,padY}`：文字衬底，**默认关闭 = 纯透明背景**（开启后按位置分组各画一块）
- `lines[].outline.width`：**默认 0 = 不加描边**（>0 才画描边）；在配置里改数值即可开/关
- 默认两行颜色不同：第 1 行 `#FFE873`（淡黄）、第 2 行 `#9AD8FF`（浅蓝）
- `lines[]`：N 行数组；CLI 位置参数只覆盖**前两行**
- `fonts` / `posAlias` / `weightAlias`：别名表

## 实现
- `scripts/app/Services/TextStampService.js`：通用叠字引擎（N 行、独立样式、字号自适应、分组衬底、按词换行）。
  - ⚠️ **librsvg 不生效 `dominant-baseline`**：SVG `y` 即**基线**，所以渲染时用 `基线 = 行中心 + 0.35×字号` 换算，否则文字整体偏高、大字号会顶边/裁切。
  - ⚠️ 多行「逐词堆叠」时，同一位置组的行会按序堆叠；design-area 里主标题多行时会把副行并入同组，避免与标题重叠。
  - 组位置有上下边距夹取（3.5%H），防裁切。
- `scripts/app/Console/Commands/StampCommand.js`：命令装配（配置/路径/批量/对比页）。
- `scripts/stamp.js`：独立入口薄壳。
- 双行同「居中」时：第 1 行落中线之上、第 2 行落中线之下，堆叠不重叠。
