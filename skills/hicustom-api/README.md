# hicustom-api 操作手册

> 指纹科技 HICUSTOM 开放平台客户端 + 定制产品上架素材一条龙 + CSV 类数据库管理 + 叠字/排版。
> 设计哲学：Laravel 风（DI 容器 + 服务提供者 + 服务层 + artisan 命令总线 + 配置分离）。零第三方依赖（仅图像步骤用 sharp）。
>
> **分层原则**：业务进 `app/`，页面进 `app/pages/`，库进 `tools/`，服务进 `server/`，实验进 `dev/`，数据进 `output/`（**output 只放数据/图片**）。

---

## 目录
1. [安装 / 配置](#1-安装--配置)
2. [快速上手](#2-快速上手)
3. [核心工作流：listing:generate](#3-核心工作流listinggenerate)
4. [命令一览](#4-命令一览)
5. [CSV 类数据库 + 管理后台](#5-csv-类数据库--管理后台)
6. [设计器 SDK 对接](#6-设计器-sdk-对接)
7. [本地页面服务](#7-本地页面服务)
8. [文件结构 / References](#8-文件结构--references)

---

## 1. 安装 / 配置

```bash
# 安装图像处理依赖（sharp，仅图像步骤需要）
cd scripts/tools && npm install && cd ../..

# 密钥：复制 .env.example 为 .env（skill 根）并填写
HICUSTOM_APP_KEY=
HICUSTOM_APP_SECRET=        # 首次换 token 用
HICUSTOM_REFRESH_TOKEN=     # 刷新用（可选，会自动保存）
```

> access_token 自动缓存到 `.hicustom/token.json`，**绝不明文出示**。
> `HICUSTOM_MERCHANT_COOKIE`（运费试算用）由 `app/Support/MerchantCookie.js` 读写 **skill 根 `.env`**。

## 2. 快速上手

```bash
node scripts/hi.js list                 # 看全部命令
node scripts/hi.js token:get            # 拿/刷新 access_token
node scripts/hi.js product:detail --id 11243   # 抓空白产品详情
node scripts/hi.js db admin             # 生成管理后台 pages/manage.html（访问 /manage.html）

# 叠字（本地、零 API）
node scripts/stamp.js input/x.jpg "YOUR DESIGN HERE" "#FFE873" bold 800 居中 \
  "Any Color Text Logo Photo" "#9AD8FF" modern 500 偏下
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
```

可选项：`--fit cover|contain`（默认 cover 填满）、`--default-color-id`、`--default-view-id`、`--external-id`、`--customer-id`。

产物：
- **数据**（`output/<id>/`）：`product.json`、`product.csv`、`images/…`
- **页面**（`pages/<id>/`）：`index.html`（详情页，URL `/<id>/index.html`）
- 并自动 `upsert` 进数据库 + 刷新后台 `pages/manage.html`

> ⚠️ 设计稿**宽高比贴合印刷区**，否则合成时 `cover` 会裁掉侧边（或用 `--fit contain`）。

## 4. 命令一览

| 命令 | 作用 |
|------|------|
| `token:get` | 获取/刷新 access_token |
| `gallery:categories / list / detail / edit` | 图库分类 / 列表 / 详情 / 编辑 |
| `gallery:upload --file x` / `gallery:batch` | 上传图库 / 批量上传输入夹 |
| `product:list / categories / detail / removed` | 空白产品 列表/分类/详情/下架 |
| `design:list / detail / preview` | 定制产品 列表/详情/效果图预览 |
| `design:composite` | **自动合成**（出完整展示图） |
| `listing:generate` | **总编排**（一条龙） |
| `design-area:generate` | **独立**：解析**排版样稿**(`type-setting-images/`, `--sample <名字\|auto>`) 或空白产品主图 → 文生图 → 用 `stamp` 叠定制区文字 |
| `stamp` | **独立**：给图案叠加 N 行可配置文字（本地零 API）；入口 `node scripts/stamp.js` |
| `sample:list` | 列出排版样稿库 `type-setting-images/` |
| `shipping:quote` / `shipping:backfill` | 运费试算 / 批量回填（商家后台 cookie 鉴权） |
| `pricing:calc` / `pricing:backfill` | 定价计算 / 多国售价回填 |
| `listing:translate` / `listing:table` | 上架文案→中文（审阅） / 读模板数据列 |
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
  node scripts/hi.js db admin     # 重新生成后台 → pages/manage.html
  ```
- **后台**：`pages/manage.html`（列出所有商品 + 详情/编辑入口）。访问 `http://127.0.0.1:8098/manage.html`。

## 6. 设计器 SDK 对接

前端 iframe 嵌入 hicustom 设计器（供用户在线设计）。回调服务器：`node scripts/server/server.js`（默认 `http://127.0.0.1:8899`）。
详见 `references/designer-sdk.md`。

## 7. 本地页面服务

```bash
# 托管 数据(output/) + 页面(pages/)，默认 8098
node scripts/server/serve.js
# 访问: http://127.0.0.1:8098/<id>/index.html 、 /product.html?id=<id> 、 /manage.html
```

> 路由：**`.html` 先查 `scripts/app/pages/`，未命中回退 `output/`**；`api/… / images/… / json/csv` 一律走 `output/`（**URL 不变**）。
> 改动 serve.js / MerchantCookie / 数据后需**重启 serve.js**。

## 8. 文件结构 / References

```
scripts/
├── hi.js · stamp.js         # 入口（CLI / 叠字薄壳）
├── core/                    # 内核 Container/Config/Router/bootstrap/ServiceProvider
├── app/                     # 业务 Providers/Http/Auth/Services/Sdk/Support/Console(Commands)/pages(页面)
├── server/                  # 常驻服务 serve.js(8098) · server.js(8899 设计器回调)
├── tools/                   # 复用库 csv/image/watermark/pick-color + sharp 锚点(node_modules)
└── dev/                     # 非生产：tests/ flows/ oneshot/ py/ _view_server.js（可随时清）
config/hicustom.json         # baseUrl + endpoints + merchant + paths
database/products.csv        # CSV 类数据库
output/<id>/                 # 每商品【数据】：product.json / product.csv / images/
scripts/app/pages/           # 【页面】：product.html / listing.html / manage.html / <id>/index.html …
type-setting-images/         # 排版样稿库（文件名=商品名/类别）
references/                  # 文档（见下）
```

| References（何时引用） | 用途 |
|-----|------|
| `references/workflow.md` | 抓详情→处理图→上传→合成→登记，一条龙 |
| `references/product-profile-schema.md` | product.json 画像结构 |
| `references/csv-schema.md` | CSV 列定义 |
| `references/html-template.md` | 详情 HTML section 扩展 |
| `references/database.md` | CSV 数据库 + 后台 + 扩展 |
| `references/designer-sdk.md` | 前端设计器 iframe 对接 |
| `references/design-area.md` | 给商品图/效果图加定制区文字（含"以效果图为底"变体） |
| `references/stamp.md` | 本地叠字命令（N 行/颜色/字体/位置/换行/预设） |
| `references/shipping-quote.md` | 运费试算（cookie、8 国口径、推荐渠道） |
| `references/shipping-pricing-flow.md` | 运费规范 + 存档 + 易错点 |
| `references/listing-flow.md` | 亚马逊上架文案/关键词/填模板/预览 |

---

**一次典型使用**：给商品链接/ID + 设计图 → `listing:generate` → 后台 `manage.html` 看全部 → `db` 查/改 → 需要下单走 `order:create`（谨慎，涉及资金）。
