# CSV"类数据库" + 管理后台（Laravel 风格）

> 把 `listing:generate` 产物登记成一条条记录，用 CSV 当数据库，可增删改查；HTML 后台统一浏览管理。
> 触发词：数据库、管理后台、CSV管理、增删改查、商品管理、db。

## 架构（遵循 Laravel 哲学）
```
CSV 数据库 (database/products.csv)
   └─ ProductRepository (app/Support/ProductRepository.js)  ← 数据访问层(Repository)
          └─ 绑定到容器: app.singleton('productRepo', ...)   ← AppServiceProvider
                 └─ db:* 命令 (app/Console/Commands/DbCommand.js)  ← artisan 式命令总线
                 └─ AdminRenderer (app/Support/AdminRenderer.js)  ← 后台 HTML 展示
```
- **Repository**：CSV 增删改查（all/find/create/update/remove/upsert），字段白名单见 `SCHEMA`。
- **绑定**：已注册 `productRepo` 到 DI 容器（`AppServiceProvider`）。
- **命令**：`db`（list/get/add/update/delete/admin）。
- **自动登记**：`listing:generate` 跑完自动 `upsert` 进数据库，并刷新 `output/admin.html`。

## 数据源
- `database/products.csv`（主表，config.databasePath 可改）
- 每行一个商品，含 **`specs_json`** 列：把该商品所有规格的详细属性（颜色·尺码、包装、重量、各档售价等）序列化，保证 CSV "很全面"。
- `output/<id>/product.json`：`profile.specs[]` 与 CSV specs_json 一致，为结构化全量数据。

## db 命令
```bash
node scripts/hi.js db list                # 列出全部
node scripts/hi.js db get 11243           # 查看单条
node scripts/hi.js db add --id X --cn-name ... --min-price ...
node scripts/hi.js db update 11243 --status synced --notes "..."
node scripts/hi.js db delete 11243
node scripts/hi.js db admin               # 生成管理后台 output/admin.html
```

## 主表列（SCHEMA）
`id, spu_code, cn_name, en_name, factory, material, min_price, design_face_w, design_face_h, variants_count, package_L_cm, package_W_cm, package_H_cm, weight_g, gallery_codes, composite_product_code, effect_image_count, dir, html, status, notes, created_at, updated_at`

## 后台（统一管理页 + 可复用详情模板）
- **`output/manage.html`**：单个统一**商品列表**（每行点击 → 详情）。
- **`output/product.html`**：**一个可复用模板**，通过 `?id=<商品id>` 参数，前端 `fetch('/api/products.json')` 从 `database/products.csv` 取数据并渲染详情（含规格聚合表、全部图片、入口）。
  - 详情地址：`http://127.0.0.1:8098/product.html?id=11243`
  - **无论几千个商品，只有 manage.html + product.html 两个页面** + 一个 CSV。
- 访问（输出服务器）：`http://127.0.0.1:8098/manage.html`
- 生成：`node scripts/hi.js db admin`（重建 manage.html）
- JSON API：`http://127.0.0.1:8098/api/products.json`（返回全部商品 + specs + detail）
- 刷新单商品：`node scripts/dev/oneshot/refresh-product.js <商品id>`（重抓详情补 specs → 更新 CSV，不重新合成）
- 商品文件夹（`output/<id>/`）只存**数据**（product.json / product.csv / images），展示统一走模板，无逐商品 HTML。

## 扩展
- 加字段 → 在 `SCHEMA`（ProductRepository）加列 + `FieldMap`（DbCommand）加映射。
- 后台加操作 → 改 `AdminRenderer` 卡片/表格。
- 新功能（订单/图库/多语言）→ 加 Service + 在 Provider 绑定 + 加命令；数据落库走 Repository。
