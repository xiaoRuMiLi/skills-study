---
name: hicustom-api
description: 指纹科技（HICUSTOM）按需定制开放平台 API 客户端。用 Laravel 哲学（依赖注入容器 + 服务提供者 + 服务层 + artisan 式命令总线 + 配置分离）封装。覆盖 OAuth2 获取/刷新 access_token、图库上传/分类（后续扩展空白产品/定制产品合成/订单）。触发词：hicustom、指纹科技、开放平台、图库上传、图库分类、创建订单、定制产品合成、access_token、refresh_token、POD 下单、按需定制 API、指纹 API。
---

# hicustom-api（指纹科技开放平台客户端）

**定位**：把「指纹科技 HICUSTOM 开放平台」的 HTTP API 封装成干净、解耦、可扩展的 Node 客户端。
**目标**：为「亚马逊出单 → hicustom 采购」及「批量图库/定制/下单」提供稳定、可复用的程序化接入。

## 设计哲学（Laravel 风）
- **依赖注入容器**（`core/Container.js`）：统一 `bind/singleton/make`，服务不直接 new 依赖，由容器装配。
- **服务提供者**（`app/Providers/AppServiceProvider.js`）：集中注册绑定（Laravel 式），加新域 = 加 Provider/Service + 绑定一行。
- **服务层**（`app/Services/*`）：业务语义（图库/商品/订单），不碰 HTTP 细节、不打印业务结果。
- **HTTP 客户端**（`app/Http/HttpClient.js`）：统一 baseUrl、鉴权注入(`access_token`)、query/form/json、错误归一；复用底层 fetch（零第三方依赖）。
- **鉴权**（`app/Auth/TokenManager.js`）：OAuth2 获取/刷新/缓存 access_token（带过期判断 + 本地缓存 token.json）。
- **命令总线**（`core/Router.js` + `app/Console/Commands/*`）：artisan 式命令路由；新增命令 = 加一个文件 + 注册。
- **配置分离**：`config/hicustom.json` 放端点；`.env` 放密钥（app_key/app_secret/refresh_token）。

## References（何时引用 / 加载）
当任务命中下表场景时，**先读对应 references 文档**再动手：

| 场景 | 加载 |
|------|------|
| 用户给商品链接/ID，要抓详情、处理客户图、自动合成、出上架素材/报表/HTML | `references/workflow.md` |
| 要理解/扩展 `product.json` 的 `profile` 结构 | `references/product-profile-schema.md` |
| 要核对 CSV 列含义 / 改列 | `references/csv-schema.md` |
| 要改/扩展产品浏览 HTML 模板（加 section） | `references/html-template.md` |
| 要在前端嵌 hicustom 设计器（iframe + 事件） | `references/designer-sdk.md` |
| 要管理/增删改查商品、看管理后台、扩数据库字段 | `references/database.md` |
| 给商品图加"定制区"文字标记（独立流程） | `references/design-area.md` |

> 核心命令：`listing:generate --product-id <id> --images "图.jpg[:面]" [--dry-run]`
> 图像步骤需 **sharp**（`scripts/tools/`，已装）；其余零第三方依赖。

## 快速开始
```bash
# 0. 看全部命令
node scripts/hi.js list

# 1. 拿到/刷新 access_token（首次需 .env 填 HICUSTOM_APP_KEY/HICUSTOM_APP_SECRET 或 HICUSTOM_REFRESH_TOKEN）
node scripts/hi.js token:get

# 2. 图库分类（GET /api/v1/gallery-categories）
node scripts/hi.js gallery:categories [--lang 2]

# 3. 图库上传（POST /api/v1/gallery，form-data）
node scripts/hi.js gallery:upload --file ./test-upload.png [--cn-name 徽章] [--en-name badge] [--cn-tags "徽章,复古"] [--en-tags "Badge,vintage"] [--external-id 4235234213] [--external-customer-id 22010642566]
```

## 命令一览
| 命令 | 作用 | 接口 |
|------|------|------|
| `token:get` | 获取/刷新 access_token | `/oauth/token`（+ 刷新 `/oauth/refresh-token`） |
| `error:describe` / `error:list` | 全局错误码中文说明（`--code`/`--grep`） | — |
| `gallery:upload` | 上传图片→指纹图库 | `POST /api/v1/gallery` |
| `gallery:batch` | 读输入夹批量上传→结果写输出夹清单 | `POST /api/v1/gallery` |
| `gallery:categories` | 图库分类列表 | `GET /api/v1/gallery-categories` |
| `gallery:list` | 图库列表(分页) | `GET /api/v1/galleries` |
| `gallery:detail` | 单张图片详情 | `GET /api/v1/gallery/{code}` |
| `gallery:edit` | 编辑图库图片(名称/标签/分类/类型) | `PATCH /api/v1/gallery/{code}` |
| `product:list` | 空白产品列表(分页) | `GET /api/v1/product-types` |
| `product:categories` | 空白产品分类(树状) | `GET /api/v1/product-type-categories` |
| `product:detail` | 空白产品详情(颜色/尺码/价格/印刷区) | `GET /api/v1/product-type/{id}` |
| `product:removed` | 近一个月下架的空白产品id列表 | `GET /api/v1/product-type-remove/list` |
| `design:list` | 定制产品列表(分页) | `GET /api/v1/products` |
| `design:detail` | 定制产品详情(颜色/尺码/效果图/SKU) | `GET /api/v1/product/{code}` |
| `design:preview` | 定制产品自动合成 效果图预览 | `GET /api/v1/product-preview` |
| `design:composite` | 定制产品**自动合成**（出完整展示图：颜色多场景） | `POST /api/v1/product` |
| `listing:generate` | **一条龙**：抓详情→处理图→上传→合成→缓存 CSV+HTML | 见 `references/workflow.md` |
| `design-area:generate` | **独立**：给商品图加"定制区"文字标记（YOUR DESIGN HERE 虚线框），存 edited/<id>/ | 见 `references/design-area.md` |
| `db` | CSV**类数据库**增删改查 + 管理后台 | `list/get/add/update/delete/admin` |
| `order:create` | 创建订单 | `POST /api/v1/order` |
| `order:list` | 订单列表(近180天) | `GET /api/v1/orders` |
| `order:detail` | 订单详情(含物流/地址) | `GET /api/v1/order/{order_id}` |
| `order:by-out-id` | 按商户订单号查订单详情 | `GET /api/v1/out-order-id/{out_order_id}` |
| `order:item-production` | 商户订单项生产信息(单件码) | `POST /api/v1/common/order_item_production_info` |
| `trade:list` | 交易记录查询 | `GET /api/v1/common/trade_record` |
| （待扩）`design:...` / `order:...` | 定制合成 / 订单 | 见开放平台 API 文档 |

## 文件夹 / 密钥
- 密钥：`.env`（`HICUSTOM_APP_KEY`/`HICUSTOM_APP_SECRET`/`HICUSTOM_REFRESH_TOKEN`），只放本机。
- 输入图文件夹：`config/paths.input`（或 env `HICUSTOM_INPUT_DIR`，默认 `./input`）。
- 输出图文件夹：`config/paths.output`（或 env `HICUSTOM_OUTPUT_DIR`，默认 `./output`），`gallery:batch` 的清单写这里。
- `access_token` 缓存：`.hicustom/token.json`（自动有效期判断+刷新）。

## 鉴权（OAuth2）
- 首次：`GET /oauth/token`，`app_key` + `app_secret` 换 `access_token`（见 config `endpoints.token`）。
- 刷新：`GET /oauth/refresh-token`，`app_key` + `refresh_token`；`refresh_token` 有效期 2 天。
- `access_token` 有效期 7200s；`TokenManager` 自动判断过期并刷新，缓存到 `.hicustom/token.json`。
- ⚠️ `access_token` 只能保存在后台，绝不给前端/聊天明文。

## 目录结构
```
scripts/
├── hi.js                    # 入口：bootstrap -> dispatch（artisan 式）
├── server.js                # 设计器 SDK 回调服务器（供 HICUSTOM 调用）
├── self-test.js             # 离线自测（mock fetch，全链路）
├── self-test-sdk.js         # SDK 回调自测（sign + list/original）
├── core/
│   ├── Container.js         # DI 容器 bind/singleton/make
│   ├── Config.js            # 加载 config/hicustom.json + .env
│   ├── ServiceProvider.js   # 服务提供者基类
│   ├── Router.js            # 命令路由 + 参数解析(--kebab->camel)
│   └── bootstrap.js         # 组装容器/Provider/Kernel 的引导
└── app/
    ├── Providers/AppServiceProvider.js
    ├── Http/HttpClient.js
    ├── Auth/TokenManager.js
    ├── Services/            # Gallery/Product/Design/Order/Trade
    ├── Sdk/DesignerCallback.js  # 设计器 SDK 回调（取图源/原图+签名）
    ├── Support/             # ProductProfile/CsvReport/ListingRenderer
    └── Console/Commands/    # 20+ 命令（含 design:composite / listing:generate）
scripts/tools/               # 图像处理（sharp，见 package.json）→ image.js
config/hicustom.json         # baseUrl + endpoints 映射
references/                  # workflow / schema / csv / html / designer-sdk 说明
.env.example                 # 密钥模板
```

## 设计器 SDK 回调（scripts/server.js）
HICUSTOM 定制设计器在「取图」「保存设计」时**回调你提供的服务器**：
- `GET /gallery/list` — 自定义图库（设计器取图源；图源 = `config/paths.input` 图片，本服务器 `/files/<name>` 提供）。
- `GET /gallery/original?ids=A,B&timestamp=..&sign=..` — 原图地址（保存设计时 HICUSTOM 拉原图），**hmacsha256 验签**（app_secret）。
- 在 HICUSTOM 设计器 iframe 加 `customer_gallery_list` / `customer_gallery_map` 参数即可接入。
- 运行：`node scripts/server.js`（默认 `http://127.0.0.1:8899`；`HICUSTOM_CALLBACK_PORT`/`HICUSTOM_CALLBACK_BASE_URL` 可改）。

## 扩展新接口（开闭原则）
1. `config/hicustom.json` 加 endpoint 路径。
2. `app/Services/<Domain>Service.js` 写业务方法。
3. `AppServiceProvider` 注册绑定。
4. `app/Console/Commands/<X>Command.js` 写命令。
5. Router 注册命令。
核心 Container/HttpClient/TokenManager 零改动。

## 来源
- 官方开放平台：https://www.hicustom.com/open_platform/home
- API 文档（xiaoyaoji）：http://xiaoyaoji.cn/project/1jPL8Hr5Xf7/1jUCjXS9TCC
- 端点以 `api.hicustom.com` 为准。
