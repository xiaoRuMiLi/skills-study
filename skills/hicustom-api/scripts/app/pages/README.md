# pages/ — 可复用页面层

与「数据目录 `output/`」分离的**页面层**。存放**可复用的网页文件**（通用模板/落地页），
不放数据（数据永远在 `output/`）。

## 放什么（全部页面）
- 通用模板：`product.html`（商品详情，`?id=` 取数）、`listing.html`（上架预览）、`index.html`（落地页）。
- 生成型页面（也归此处）：
  - `manage.html`（管理后台，`AdminRenderer`）
  - `<id>/index.html`（产品详情页，`ListingRenderer`）
  - `design-area-compare.html` / `stamp-compare.html`（前后对比，`CompareRenderer`）
  - `view-all.html`（总览，`_build_view.js`）

## 不放什么（只留数据）
- `output/` 只放**数据**：`<id>/images/`、`product.json`、`product.csv`、`database/products.csv`、`gallery-random/` 等。
- 页面里对数据的引用一律走 **URL 相对/绝对路径**（`api/…`、`./<id>/images/…`），与物理位置无关。

## 取数方式
页面里一律用 **URL 相对/绝对路径**取数（如 `fetch('api/products.json')`、`fetch('/api/listing.json?id=…')`、`./<id>/images/…`），
由 `scripts/server/serve.js` 统一路由，**与物理位置无关**：
- `*.html` → 先查本目录，未命中回退 `output/`；
- `api/…`、`images/…`、`json/csv` → 一律走 `output/`。

## 配置
- 目录可用 `HICUSTOM_PAGES_DIR` 覆盖（默认 `scripts/app/pages`）。
