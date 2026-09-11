# 叠字排版对齐（design:align）—— 让字"长"得和空白商品一样

> ## ★★ 加字（贴字）首选方案
> **凡涉及给图案/商品加文字，优先用本流程**（优于 `design-area:generate`）。位置/大小对齐空白商品占位文字、**不产生刊登记录**；支持多行（标题逐词堆叠 + 副标题单行/逐词换行）、逐段字体/颜色/字号、自动配色。

> **要解决的问题**：图案适配印刷区 + 叠字后，字在商品上的**位置/大小**往往和空白商品自带的占位文字对不上
> （过去只能走 `listing:generate` 真合成去"碰运气"，而且每试一次上游就多一条刊登记录）。
> **本流程**：一次性标定 → 本地 mockup 无限次免费迭代 → 达标后才用 1 次线上预览复核。

## 命令

```bash
# 首次（自动标定 + 量目标 + 本地扫描，再出图）
node scripts/hi.js design:align --product-id 12659 --image input/xxx.jpg --text "YOUR DESIGN HERE"

# 出图 + 线上复核（多花 1 次上传，给真实渲染的 IoU）
node scripts/hi.js design:align --product-id 12659 --image input/xxx.jpg --text "..." --verify

# 强制重新标定（2 次上传 + 2 次预览，一次性成本）
node scripts/hi.js design:align --product-id 12659 --calibrate

# 只做本地参数扫描（零上传）
node scripts/hi.js design:align --product-id 12659 --sweep
```

| 参数 | 说明 |
|---|---|
| `--product-id <id>` | 空白产品 id（必填） |
| `--face <n>` | 印刷面 id（默认 `1` 前片；睡衣类只有主面加字） |
| `--image <素材>` | 客户图/图案（cover 适配印刷区） |
| `--text "<文案>"` | 叠字内容（默认 `YOUR DESIGN HERE`）。**支持多行**：用 `\|` 或换行分隔。多行时——**第 1 段逐词一行堆叠成大标题**（统一字号=最宽词撑满块宽，酷似占位 `YOUR/DESIGN/HERE`）；**其余段各作一整行小字**（似空白图里的 `1182 * 1863 px` 那行；单行、不超自身 fit 宽，**不溢出/不断词**）。单段时按 `--mode` 逐词堆叠/整块贴合 |
| `--color #RRGGBB` | 字色；缺省用本地 `pickDistinctColors` 按底图自动选 |
| `--line-colors "c1,c2"` | **多行**每行颜色（逗号分隔）；**缺省自动配色**——多行会挑 N 个「彼此区分」的反差色（`ContrastColor.pickDistinctColors`） |
| `--line-scales "1,0.5"` | **多行**每段字号倍率（`[标题段, 副标题段2, …]`，相对标题字号 T）。默认 `[1, 0.5, 0.5…]`；副标题恒为**单行**（超宽会被压回自身 fit 宽）。可覆盖（如 `"1,0.35"`） |
| `--font bold\|modern\|elegant\|script\|comic` | 全局字体别名（或直接给 CSS 字体族字符串）；缺省 `bold`。别名：`bold`=Arial Black/Impact、`modern`=Arial、`elegant`=Georgia、`script`=Segoe Script、`comic`=Comic Sans |
| `--line-fonts "f1,f2"` | **多行每段独立字体**（逗号分隔，如 `"Franklin Gothic Medium,Segoe Script"`）；缺省用 `--font`。**本机实测可渲染**：`Arial Black`/`Impact`/`Georgia`/`Segoe Script`/`Franklin Gothic Medium`/`Bahnschrift`/`Trebuchet MS`/`Candara`/`Corbel`/`Cambria`/`Constantia`/`Palatino Linotype`/`Tahoma`/`Comic Sans MS`（`Ink Free` 等会回退，慎用） |
| `--faces main\|all` | **多面策略**：`main`（默认）只主面加字、其余面用无字版；`all` 所有面都加字 | 
| `--no-plain` | `--faces main` 时**不**另出无字版（只出带字图） |
| `--mode wrap\|box` | **排版模式**：`wrap`=逐词堆叠（每词一行，如 `YOUR`/`DESIGN`/`HERE`）；`box`=整块贴合（字距拉伸，适合包/袋类占位）。缺省 `auto`：按「IoU − **结构惩罚**」自动择优——**中段断词**（每个片段 −0.05）和**行数不符**（每行 −0.03）会被扣分，从而让「逐词堆叠」在占位是逐词排布时胜出 |
| `--width-ratio / --row-gap / --nudge-up` | 手动覆盖排版参数（默认用缓存里扫描出的最优） |
| `--retarget` | 强制重新量目标（②：重算占位目标） |
| `--pick-main` | **实验性**：②量目标时在候选主图里挑取景最贴合的（**默认关**；实测易误选非占位图，会发散） |
| `--calibrate` | 强制重新标定 |
| `--sweep` | 强制重跑本地参数扫描 |
| `--verify` | 线上复核（1 次上传 + 1 次预览） |
| `--iterate N` / `--no-iterate` | **迭代收敛**（配合 `--verify`）：复核后 `correction` 若变化且 IoU<0.9 → 自动「重扫参数→重出图→再复核」，默认 **1 轮**（`--no-iterate` 关闭）。**保最优**：某轮真实 IoU 未超过历史最优则**自动回滚**到最优轮（绝不倒退）。**每轮 +1 次上传** |
| `--out <目录>` | 产物目录（默认 `output/<id>/align/`） |

> **多行文案**（`--text` 含 `|`/换行）会**跳过参数扫描与 IoU 达标判定/迭代**——它是"把自定义文案套进占位框"，不是"复刻占位"，故 IoU 不适用。

**产物**：`output/<id>/align/design.jpg`（印刷区设计图）、`mockup.jpg`（本地效果图）、`compare.jpg`（空白/设计/本地/[真实] 对比）。
可用 ERP 直接看：`http://127.0.0.1:8098/<id>/align/compare.jpg`

## 内部流程

| 步 | 做什么 | 成本 |
|---|---|---|
| ① 标定 | 生成「9宫格彩色标记图」+「纯色图」→ 各上传 1 次 → `design:preview` 各 1 次 → 按色检测标记解 **单应 H**（印刷区 px → 商品照片 px）；两图做差得 **可见印刷区遮罩**（自动带扣子/领口遮挡） | 2 上传 + 2 预览（**每产品×每面一次**，长期缓存） |
| ② 量目标 | 抓空白产品**第 1 张主图** → 蓝色文字掩码 + 行带 → 占位标题块 bbox → 经 H⁻¹ 换算成**印刷区归一化目标**（宽/高/中心/行数）。`--pick-main`（**实验性，默认关**）会改为挑「取景与标定渲染最接近」的候选图——**实测易误选到非占位图（蓝色元素/生活场景）→ 目标发散，慎用** | 0（1 次抓图；`--pick-main` 时 ≤8 次） |
| ③ 本地扫描 | 网格搜 `widthRatio / rowGap / nudgeUp`，每组合成一次设计 + 本地 mockup + 量 bbox + 算 IoU（对「等效目标」） | **0（全本地，秒级）** |
| ④ 出图 | 素材 cover 适配印刷区 → 按参数叠字 → 本地 mockup | 0 |
| ⑤ 复核（可选） | 用**红字孪生图**上传 1 次 → `design:preview` → 量红字 bbox → 与目标比 **IoU**，并回写 `correction`。**★D：IoU<0.9 且 correction 变化 → 自动重扫→重出图→再复核（默认 1 轮）** | 1 上传 + 1 预览/轮 |

**收敛判据**：IoU ≥ 0.9（实测本技能可到 **0.97+**）。

## 缓存（每产品×每面一条）

`.hicustom/align/<产品id>-v<面>.json`：
```
printArea / imageSize / H / baseFile / maskFile / coverage / maxResidual
target      (占位文字目标: bboxPrint + norm)
params      (扫描出的 widthRatio / rowGap / nudgeUp)
correction  (本地mockup ↔ 真实渲染 的系统修正系数)
verify      (最近一次线上复核的 IoU / 图库码)
uploads     (标定/复核用掉的图库码，便于事后清理)
```
底图/遮罩/标定渲染也在 `.hicustom/align/`。

## 关键坑 ⚠️

| 坑 | 说明 |
|---|---|
| **前片被门襟/领口分裂** | 同一印刷区坐标在顶行会落到两个位置 → 不能全幅标定；标记要放在**胸口带**（fy 0.45~0.75） |
| 印刷区 > 可见区 | 顶部被领口挡、两侧被手臂挡 → 文字必须落在**可见安全区**（本流程靠遮罩天然保证） |
| 本地 mockup ≠ 100% 真实 | 有 ~1.4% 系统差 → 用 `correction` 把目标换算成「等效目标」再扫描；`--verify` 会用实测比例自动更新 |
| 空白主图只有 500px | 目标测量精度受限；量的是"标题块"（前 3 行带），已够用 |
| 上传成本 | 标定 2 次/产品面（一次性）；复核 1 次/稿。图库码记在缓存 `uploads` 里，**事后统一清理**：`POST /merchant/customerGallery/batchdelete {ids}` + `deleterecycle` |
| 文案 | 本技能**不用 AI 写文案**（字色可用本地工具自动算） |

## 多面策略（默认只主面加字）★

睡衣/套装这类产品有多个印刷面（前片/后片/领子/袖/短裤…）。**同一张图会被贴到所有面**——
所以"带字的图"贴满全部面，会出现 **短裤、袖子上也有字**（很难看）。

**默认行为（`--faces main`）**：只主面加字，并**另出一张无字版**：
```
output/<id>/align/design.jpg         ← 带字（给主面）
output/<id>/align/design-plain.jpg   ← 无字（给其余面）
```
命令末尾会直接打印下一步的真合成命令（下游 `listing:generate` 的 `--images` 本就支持逐面指定）：
```bash
node scripts/hi.js listing:generate --product-id <id> \
  --images "output/<id>/align/design.jpg:1,output/<id>/align/design-plain.jpg:all"
#                              ↑面1用带字      ↑其余面用无字
```
> 想**全部面都加字**：`--faces all`（此时只出一张 design.jpg，命令给出 `...:all`）。

## 与既有流程的关系

- `design-area:generate`：**先按印刷区 cover 裁切，再叠字**（保证字不被裁）——本流程的"第 0 环"。
- `design:align`：**再解决"字的大小/位置与商品占位一致"**——第 1 环。
- `listing:generate`（workflow）：真合成/入库；对齐好的设计图可直接喂给它。
- 推荐链路：`design:align`（本地对齐到 IoU≥0.9，可选 `--verify`）→ `listing:generate`（真合成入库）。
