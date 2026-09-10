# type-setting-images（排版样稿库）

存放**排版样稿**图片——用它们来定义 design-area 流程里「定制区文字」的**排版方式**。

## 规则
- **文件命名 = 商品名 / 商品类别**，例如 `衬衫.jpg`、`网球拍.jpg`、`遮阳罩.jpg`、`地垫.jpg`。
- 支持格式：`png / jpg / jpeg / webp`。

## 用法（design-area:generate）
- **指定用某样稿**：`--sample 网球拍`
  → 在该目录找名为「网球拍」的样稿（先精确名，再包含，再模糊）来解析排版。
- **只说"用样稿"**：`--sample auto`（或 `--sample 样稿`）
  → 按**商品名**自动挑最契合的样稿。
- **不指定**（不带 `--sample`）
  → 回退用**空白产品详情主图**解析排版（默认行为）。

> 目录路径可用 `HICUSTOM_TYPE_SETTING_DIR` 覆盖（默认 `./type-setting-images`）。
> 匹配逻辑见 `scripts/app/Support/TypeSetting.js`。
