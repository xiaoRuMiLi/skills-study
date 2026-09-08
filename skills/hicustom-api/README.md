# hicustom-api 操作手册

> 指纹科技 HICUSTOM 开放平台客户端 + 定制产品上架素材一条龙 + CSV 类数据库管理。
> 设计哲学：Laravel 风（DI 容器 + 服务提供者 + 服务层 + artisan 命令总线 + 配置分离）。零第三方依赖（仅图像步骤用 sharp）。

---

## 目录
1. [安装 / 配置](#1-安装--配置)
2. [快速上手](#2-快速上手)
3. [核心工作流：listing:generate](#3-核心工作流listinggenerate)
4. [命令一览](#4-命令一览)
5. [CSV 类数据库 + 管理后台](#5-csv-类数据库--管理后台)
6. [设计器 SDK 对接](#6-设计器-sdk-对接)
7. [本地预览服务器](#7-本地预览服务器)
8. [文件结构 / References](#8-文件结构--references)

---

## 1. 安装 / 配置

```bash
# 安装图像处理依赖（sharp，仅图像步骤需要）
cd scripts/tools && npm install && cd ../..

# 密钥：复制 .env.example 为 .env 并填写
HICUSTOM_APP_KEY=
HICUSTOM_APP_SECRET=        # 首次换 token 用
HICUSTOM_REFRESH_TOKEN=     # 刷新用（可选，会自动保存）
```

> access_token 自动缓存到 `.hicustom/token.json`，**绝不明文出示**。

## 2. 快速上手

```bash
node scripts/hi.js list                 # 看全部命令
node scripts/hi.js token:get            # 拿/刷新 access_token
node scripts/hi.js product:detail --id 11243   # 抓空白产品详情
node scripts/hi.js db admin             # 生成管理后台 output/admin.html
```

## 3. 核心工作流：listing:generate

一条龙：抓详情 → 处理客户图 → 上传图库 → 自动合成 → 缓存 CSV/HTML → 登记数据库。

```bash
# dry-run（只拉数据+处理图+报表，推荐先跑）
node scripts/hi.js listing:generate --product-id 11243 --images "客户图.jpg" --dry-run

# 正式（上传图库 + 自动合成）
node scripts/hi.js listing:generate --product-id 11243 --images "客户图.jpg"

# 不同面不同图（:view 指定面）
node scripts/hi.js listing:generate --product-id 11243 --images "图A.jpg:1,图B.jpg:2"

# 也可传 URL 图
node scripts/hi.js listing:generate --product-id 11243 --images "https://.../xx.jpg"
```

可选项：`--fit cover|contain`（默认 cover 填满）、`--default-color-id`、`--default-view-id`、`--external-id`、`--customer-id`。

产物（`output/<id>/`）：`product.json`、`product.csv`、`images/`、`index.html`；并自动 `upsert` 进数据库 + 刷新后台。

## 4. 命令一览

| 命令 | 作用 |
|------|------|
| `token:get` | 获取/刷新 access_token |
| `gallery:categories / list / detail / edit` | 图库分类 / 列表 / 详情 / 编辑 |
| `gallery:upload --file x` | 上传图库 |
| `gallery:batch` | 批量上传输入夹 |
| `product:list / categories / detail / removed` | 空白产品 列表/分类/详情/下架 |
| `design:list / detail` | 定制产品 列表/详情 |
| `design:preview` | 效果图预览（GET，单张） |
| `design:composite` | **自动合成**（POST /api/v1/product，出完整展示图） |
| `listing:generate` | **总编排**（一条龙） |
| `order:create / list / detail / by-out-id / item-production` | 订单 创建/列表/详情/按店铺/生产信息 |
| `trade:list` | 交易记录 |
| `error:describe / list` | 错误码中文说明 |
| `db list / get / add / update / delete / admin` | CSV 数据库增删改查 + 后台 |
| `list` | 列出全部命令 |

## 5. CSV 类数据库 + 管理后台

- **数据库**：`database/products.csv`（config.databasePath 可改）。
- **Repository**：`app/Support/ProductRepository.js`（all/find/create/update/remove/upsert），字段白名单 `SCHEMA`。
- **命令**：
  ```bash
  node scripts/hi.js db list
  node scripts/hi.js db get 11243
  node scripts/hi.js db update 11243 --status synced --notes "..."
  node scripts/hi.js db delete 11243
  node scripts/hi.js db admin     # 重新生成后台
  ```
- **后台**：`output/admin.html`（列出所有商品 + 详情/编辑/定制列表入口）。访问 `http://127.0.0.1:8098/admin.html`。

## 6. 设计器 SDK 对接

前端 iframe 嵌入 hicustom 设计器（供用户在线设计）。详见 `references/designer-sdk.md`；demo 页 `imgtool/designer-demo.html`。

## 7. 本地预览服务器

```bash
# 托管 output/ 目录（商品详情 + 后台 + CSV），默认 8098
node scripts/tools/serve.js
# 访问: http://127.0.0.1:8098/<id>/ 、 /admin.html
```

## 8. 文件结构 / References

```
scripts/
├── hi.js            # 入口（artisan 式）
├── server.js        # 设计器 SDK 回调服务器
├── self-test.js     # 离线自测（mock fetch）
├── core/            # Container/Config/Router/bootstrap/ServiceProvider
├── app/  Providers/Http/Auth/Services/Sdk/Support/Console(Commands)/
├── tools/           # image.js(sharp) / csv.js / serve.js / regen-detail.js
config/hicustom.json # baseUrl + endpoints + merchant + paths
database/products.csv # CSV 类数据库
output/<id>/         # 每商品产物（profile/images/csv/html）
references/          # 文档（见下）
```

| References（何时引用） | 用途 |
|-----|------|
| `references/workflow.md` | 抓详情→处理图→上传→合成→登记，一条龙 |
| `references/product-profile-schema.md` | product.json 画像结构 |
| `references/csv-schema.md` | CSV 列定义 |
| `references/html-template.md` | 详情 HTML section 扩展 |
| `references/database.md` | CSV 数据库 + 后台 + 扩展 |
| `references/designer-sdk.md` | 前端设计器 iframe 对接 |

---

**一次典型使用**：给商品链接/ID + 设计图 → `listing:generate` → 后台 `admin.html` 看全部 → `db` 查/改 → 需要下单走 `order:create`（谨慎，涉及资金）。
