---
name: hicustom-api
description: 指纹科技（HICUSTOM）按需定制开放平台 API 客户端。用 Laravel 哲学（依赖注入容器 + 服务提供者 + 服务层 + artisan 式命令总线 + 配置分离）封装。覆盖 OAuth2 获取/刷新 access_token、图库上传/分类（后续扩展空白产品/定制产品合成/订单）。触发词：hicustom、指纹科技、开放平台、图库上传、图库分类、创建订单、定制产品合成、access_token、refresh_token、POD 下单、按需定制 API、指纹 API、停掉ERP、启动ERP、重启ERP、ERP服务。
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
| 要把设计**合成到空白产品**、拿**干净效果图**再叠宣传文字（成品展示图） | `references/design-area.md`（「变体流程」节） |
| 给任意图案叠加**可配置文字**（N 行/颜色/字体/粗细/位置，config 驱动，本地零 API） | `references/stamp.md` |
| 要算/回填物流运费（含 cookie 抓取、8 国口径、推荐渠道、写回 shipping_* 列） | `references/shipping-quote.md` |
| 要按规范算运费+存档到 CSV/detail_json、查易错点、看提取范例 | `references/shipping-pricing-flow.md` |
| 要生成亚马逊上架文案/关键词/填 xlsm/通用预览模板 | `references/listing-flow.md` |
| 要搭/改**网页化流程**（首页/design/listing 页面、按钮触发、异步任务、共用 Flows） | `references/flows.md` |
| 页面要**唤起 AI 协作**（改提示词/出方案/问答…；统一网关 `/api/ai/run`，可升级转 OpenClaw agent） | `references/ai-bridge.md` |
| 要从商家后台**拉「我的图库 / 图库收藏」图片原图**（花瓣素材等，导出 ZIP 取件） | `references/gallery-pull.md` |
| 要让**叠字的位置/大小与空白商品占位文字一致**（标定+本地mockup迭代+出图，不靠碰运气） | `references/design-align.md` |

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
| `gallery:pull` | **商家后台**拉「图库/图库收藏」**原图**（列→建导出任务→轮询→ZIP→解压，默认落 `input/gallery-fav/`）；cookie 鉴权 | 见 `references/gallery-pull.md` |
| `product:list` | 空白产品列表(分页) | `GET /api/v1/product-types` |
| `product:categories` | 空白产品分类(树状) | `GET /api/v1/product-type-categories` |
| `product:detail` | 空白产品详情(颜色/尺码/价格/印刷区) | `GET /api/v1/product-type/{id}` |
| `product:removed` | 近一个月下架的空白产品id列表 | `GET /api/v1/product-type-remove/list` |
| `design:list` | 定制产品列表(分页) | `GET /api/v1/products` |
| `design:detail` | 定制产品详情(颜色/尺码/效果图/SKU) | `GET /api/v1/product/{code}` |
| `design:preview` | 定制产品自动合成 效果图预览 | `GET /api/v1/product-preview` |
| `design:align` | **排版对齐**：一次性标定(印刷区→商品照片单应+可见区遮罩) → 量空白占位目标 → **本地 mockup 免费迭代** → 出图（**默认只主面加字+另出无字版**，`--faces all` 可全面加字）→ 可选线上复核(真实渲染 IoU) | 见 `references/design-align.md` |
| `design:composite` | 定制产品**自动合成**（出完整展示图：颜色多场景） | `POST /api/v1/product` |
| `listing:generate` | **一条龙**：抓详情→处理图→上传→合成→缓存 CSV+HTML | 见 `references/workflow.md` |
| `design-area:generate` | **独立**：解析**排版样稿**（`type-setting-images/`，`--sample <名字\|auto>`）或**空白产品主图** + AI 文生图 → **★先按印刷区 cover 居中裁切（`--face <面id>`，`--no-fit` 可关）再**用 `stamp` 叠定制区文字（无底/无描边），存 edited/<id>/ | 见 `references/design-area.md` |
| `stamp` | **独立**：给图案叠加 **N 行可配置文字**（颜色/字体/粗细/垂直位置/水平对齐/文字块宽高比/按词换行/`--preset` 预设），本地零 API，存同目录 `<原名>_add_text.jpg` | 见 `references/stamp.md` |
| `sample:list` | 列出排版样稿库 `type-setting-images/`（design-area `--sample` 用） | 本地 |
| `db` | CSV**类数据库**增删改查 + 管理后台 | `list/get/add/update/delete/admin` |
| `order:create` | 创建订单 | `POST /api/v1/order` |
| `order:list` | 订单列表(近180天) | `GET /api/v1/orders` |
| `order:detail` | 订单详情(含物流/地址) | `GET /api/v1/order/{order_id}` |
| `order:by-out-id` | 按商户订单号查订单详情 | `GET /api/v1/out-order-id/{out_order_id}` |
| `order:item-production` | 商户订单项生产信息(单件码) | `POST /api/v1/common/order_item_production_info` |
| `trade:list` | 交易记录查询 | `GET /api/v1/common/trade_record` |
| `shipping:quote` | **运费试算**（商家后台 cookie 鉴权）：按国/邮编/重量体积/数量 → 各物流渠道运费 | `www.hicustom.com/merchant/shippingRule/calculateNew`（见 `references/shipping-quote.md`） |
| `pricing:calc` | **定价计算**：(采购+物流)÷汇率÷(1-30%利润率-平台成本)；汇率实时取中间价、取小，非MX留前2位/MX留前3位 | 汇率 ECB(Frankfurter)中间价·open.er-api后备；见 `references/listing-flow.md` |
| `pricing:backfill` | **多国售价回填**：一次拉ECB汇率→为每商品算8国售价→写 `detail_json.pricing`，`product.html` 显示多国售价 | 同 `pricing:calc` |
| `listing:translate` | **上架文案→中文**（审阅用，`listing.html` 中文按钮/单独命令），写入 `translation.json`，**不改 record/xlsm** | 智谱 glm-4 翻译 |
| `shipping:backfill` | **物流费规范·批量回填**：逐规格 × 8 国试算 → 写回 `products.csv` 的 `shipping_*` 列 + 详情页「运费试算（各国优选）」`profile.shipping` + 刷新后台 | 同 `shipping:quote`（见 `references/shipping-quote.md`） |

## 合成图片（出干净效果图）+ 叠字

> 场景：把设计图合成到「空白产品」上 → 得到**干净的产品效果图**（无 `YOUR DESIGN HERE` 占位）→ 再叠宣传/占位文字 → 产出**成品展示图**。
>
> ⚠️ **别直接拿空白产品的 `renderings_info` 当底**：那是带占位文字的版本，直接叠字会**重叠**；必须走 `design:composite` 拿干净效果图。

```bash
# ① 抓空白产品（拿印刷区尺寸 print_areas）
node scripts/hi.js product:detail --id 11485

# ② 设计图 sharp fit 到印刷区尺寸（如 2560x1772）；③ 上传图库 → 拿 gallery_code
node scripts/hi.js gallery:upload --file design.jpg --cn-name demo --en-name demo

# ④ 自动合成（占位被设计覆盖 → 出干净效果图 colors[].renderings[]）
node scripts/hi.js design:composite --product-type-id 11485 \
  --cfgs '[{"view_id":1,"gallery_code":"XXXXXX","width":2560,"height":1772,"top_x":0,"top_y":0}]'

# ⑤ 下载主图（colors[0].renderings[0].big_img）→ effect_1.jpg
# ⑥ 叠定制区/宣传文字（第一行粉、第二行黄；两行居中的堆叠由引擎处理）
node scripts/stamp.js output/11485/images/effect_1.jpg \
  "Custom Door Mat" "#FF6FB5" modern 700 居中 \
  "Photo/Image/Text/Logo" "#FFE873" modern 700 居中
```

- ③④ 可整体用一条龙 `listing:generate --product-id <id> --images "设计图.jpg"` 代替（顺带缓存 CSV/HTML、自动归档原稿）。
- 完整步骤、`cfgs` 语义与门垫实跑示例见 `references/design-area.md`「变体流程：以产品效果图为底」。

## 本地 HTTP 服务（serve.js，端口 8098）
`node scripts/server/serve.js` 启动，托管 **`output/`（数据）+ `scripts/app/pages/`（可复用页面）**：
**`.html` 先查 `pages/`，未命中回退 `output/`**；`api/…`、`images/…`、`json/csv` 一律走 `output/`（**URL 不变**，故页面里的相对取数不受物理位置影响）。
页面目录可用 `HICUSTOM_PAGES_DIR` 覆盖。并暴露接口（`product.html` 靠它渲染）：
| 接口 | 说明 |
|------|------|
| `GET /api/products.json` | 读 `products.csv` → 商品列表（含 `specs[].shipping` 与 `detail.profile.shipping`），供 manage.html / product.html 前端渲染 |
| `POST /api/shipping/calc` body `{id, commit}` | 前端「🧮 物流算价」：`commit=false` 试算预览（服务端缓存 PENDING，不写库）；`commit=true` 写入 CSV `shipping_*` + `profile.shipping` + 刷新 manage.html。cookie 只在服务端 |
| cookie 自动刷新 | 算价时 cookie 失效 → serve 自动从已登录浏览器 CDP 抓新 cookie 写 `.env`（清 `process.env` 缓存）→ 重试一次。脚本：`scripts/app/Support/MerchantCookie.js`；手动：`node scripts/dev/oneshot/get-merchant-cookie.js` |
### ★ ERP 服务起停规范（口头约定 · 必须遵守）
> **“ERP” = 本页服务 `serve.js`（端口 8098）。**
>
> | 用户说 | 你执行 |
> |---|---|
> | **“停掉 ERP”** / “关掉 ERP” / “停服务” | `node scripts/server/erp.js stop` |
> | **“启动 ERP”** / “拉起 ERP” / “把 ERP 开起来” | `node scripts/server/erp.js start` |
> | “重启 ERP” | `node scripts/server/erp.js restart` |
> | （想确认状态时） | `node scripts/server/erp.js status` |
>
> ⚠️ **同步/替换项目文件前必须先「停掉 ERP」**：serve.js 常驻会把项目目录设为 CWD，
> 并因加载 `tools/image.js → sharp` 锁住 `scripts/tools/node_modules/sharp/lib`、
> `@img/sharp-win32-x64/lib` 等 `lib` 目录，Windows 会报「lib 文件夹正在被使用」。
> 完事后再「启动 ERP」恢复。改动 serve.js / MerchantCookie / 数据后也需 restart。
>
> 状态文件：`.hicustom/erp.pid`；日志：`.hicustom/erp.log`。等价手动命令：`taskkill /PID <pid> /T /F` + `node scripts/server/serve.js`。

## 文件夹 / 密钥
- 密钥：`.env`（`HICUSTOM_APP_KEY`/`HICUSTOM_APP_SECRET`/`HICUSTOM_REFRESH_TOKEN`），只放本机。
- `HICUSTOM_MERCHANT_COOKIE`：商家后台会话 cookie（运费试算 `shipping:quote` 用）。**注意**：开放平台无运费试算端点，该 endpoint 走 `www.hicustom.com` 商家后台、需 cookie；过期会报「会话过期」，需重新登录商家后台更新。「过期刷新 .env 即可」，秘钥勿明文外泄。
- 输入图文件夹：`config/paths.input`（或 env `HICUSTOM_INPUT_DIR`，默认 `./input`）。
  - `input/gallery-fav/`：`gallery:pull` 从商家后台「图库收藏」拉下来的**原图**（花瓣素材等），可直接当设计源图。
- 输出图文件夹：`config/paths.output`（或 env `HICUSTOM_OUTPUT_DIR`，默认 `./output`），`gallery:batch` 的清单写这里。
- **排版样稿**：`type-setting-images/`（design-area 解析排版用；文件名 = 商品名/类别，如 `衬衫.jpg`；env `HICUSTOM_TYPE_SETTING_DIR` 可改）。
- **页面 vs 数据（分离）**：**HTML 页面一律放 `scripts/app/pages/`**（可复用，后续做成 **ERP 复用页**）；**`output/` 只放数据/图片**（`<id>/images`、`product.json/csv`、`database/products.csv`、`gallery-random`）。serve 按 URL 路由：`.html`→`pages/`，其它→`output/`（URL 不变）。env `HICUSTOM_PAGES_DIR` 可改。
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
├── stamp.js                 # 独立入口：叠字（薄壳 → stamp 命令）
├── core/                    # 内核
│   ├── Container.js         # DI 容器 bind/singleton/make
│   ├── Config.js            # 加载 config/hicustom.json + .env
│   ├── ServiceProvider.js   # 服务提供者基类
│   ├── Router.js            # 命令路由 + 参数解析(--kebab->camel)
│   └── bootstrap.js         # 组装容器/Provider/Kernel 的引导
├── app/                     # 业务层
│   ├── Providers/AppServiceProvider.js
│   ├── Http/HttpClient.js
│   ├── Auth/TokenManager.js
│   ├── Services/            # Gallery/Product/Design/Order/Trade/Shipping/CustomerGallery(商家后台图库)/DesignAlign(排版对齐)/…
│   ├── Sdk/DesignerCallback.js  # 设计器 SDK 回调（取图源/原图+签名）
│   ├── Support/             # ProductProfile/CsvReport/ListingRenderer/ContrastColor/MockupEngine(本地效果图引擎)…
│   ├── pages/               # ★ 可复用页面（product.html / listing.html / manage.html …）；.html 优先此目录
│   └── Console/Commands/    # 20+ 命令（含 design:composite / listing:generate / stamp）
├── server/                  # ★ 常驻服务：serve.js（本地页服务/ERP 8098）、server.js（设计器回调 8899）、erp.js（ERP 起停器）
├── tools/                   # ★ 复用库 + sharp 锚点：image / watermark / csv / pick-color（+ node_modules/sharp）
└── dev/                     # ★ 非生产（可随时清）
    ├── tests/               # self-test.js / self-test-sdk.js
    ├── flows/               # run-listing-flow.js / run-trump-design.js
    ├── oneshot/             # _build_view / _probe_prompt / make-compare / refresh-product / regen-detail / build-pj / find-complex-product / get-merchant-cookie
    ├── py/                  # tmp_check_xlsm.py / tmp_fill_xlsm.py
    └── _view_server.js      # 旧版静态查看服务（8099）
config/hicustom.json         # baseUrl + endpoints 映射
references/                  # workflow / schema / csv / html / designer-sdk 说明
.env.example                 # 密钥模板
```

## 代码组织约定（加新功能"去哪"）★
**原则：按"职责"分层，生产链路只依赖 `core/ app/ tools/ server/`；`dev/` 可随时清。**

| 要加的东西 | 放哪 | 做法 |
|---|---|---|
| 新业务域/接口 | `app/` | 加 `Services/<X>Service.js`（语义）+ `Console/Commands/<X>Command.js`（命令）+ `Providers/AppServiceProvider` 绑一行 + `Router/bootstrap` 注册；**核心 Container/Http/Token 零改动**（开闭原则） |
| 新页面（复用） | `app/pages/` | 通用模板放 `pages/` 根；`<id>` 级页面放 `pages/<id>/`；取数一律用 **URL 相对/绝对路径**（`api/…`、`./<id>/images/…`），不写物理路径 |
| 复用工具/库 | `tools/` | `image / watermark / csv / pick-color`…；**`tools/node_modules/sharp` 是依赖锚点**（app 按固定相对路径引用），勿随意搬 |
| 常驻服务 | `server/` | `serve.js`（本地页服务 8098）、`server.js`（设计器回调 8899） |
| 一次性脚本/实验/测试 | `dev/` | `dev/tests`（自测）、`dev/flows`（流程原型）、`dev/oneshot`（一次性）、`dev/py`（python）——**随便堆，不进生产** |
| 配置 | `config/` | `hicustom.json` / `pricing.json` / `stamp.json`；密钥只进 `.env` |
| 数据/产物 | `input/ edited/ output/` | **`output/` 只放数据/图片**（`<id>/images`、`product.json/csv`、`database`、`gallery-random`），**不放 HTML** |
| 排版样稿 | `type-setting-images/` | 文件名 = 商品名/类别 |
| 文档 | `references/` | 每个流程一篇；在 SKILL.md 的 References 表登记 |

> 一句话：**业务进 `app/`，页面进 `app/pages/`，库进 `tools/`，服务进 `server/`，实验进 `dev/`，数据进 `output/`。**

## 设计器 SDK 回调（scripts/server/server.js）
HICUSTOM 定制设计器在「取图」「保存设计」时**回调你提供的服务器**：
- `GET /gallery/list` — 自定义图库（设计器取图源；图源 = `config/paths.input` 图片，本服务器 `/files/<name>` 提供）。
- `GET /gallery/original?ids=A,B&timestamp=..&sign=..` — 原图地址（保存设计时 HICUSTOM 拉原图），**hmacsha256 验签**（app_secret）。
- 在 HICUSTOM 设计器 iframe 加 `customer_gallery_list` / `customer_gallery_map` 参数即可接入。
- 运行：`node scripts/server/server.js`（默认 `http://127.0.0.1:8899`；`HICUSTOM_CALLBACK_PORT`/`HICUSTOM_CALLBACK_BASE_URL` 可改）。

## 扩展新接口（开闭原则）
1. `config/hicustom.json` 加 endpoint 路径。
2. `app/Services/<Domain>Service.js` 写业务方法。
3. `AppServiceProvider` 注册绑定。
4. `app/Console/Commands/<X>Command.js` 写命令。
5. Router 注册命令。
核心 Container/HttpClient/TokenManager 零改动。

## 接口归属：官方优先 ★

> 原则：**能用官方接口就用官方**（`api.hicustom.com`）；只有下列 3 项官方没有，才用商家后台（cookie 鉴权，会过期）。

| 能力 | 走哪 | 说明 |
|---|---|---|
| 图库 上传/列表/详情/编辑/分类 | **官方** | `gallery:*` |
| 产品详情/合成/预览、订单、交易、错误码 | **官方** | `product:* / design:* / order:* / trade:* / error:*` |
| **作图与刊登全流程**（`design:align`、`listing:generate`、`design-area:generate`） | **官方** | **不需要商家 cookie** |
| 运费试算 | 商家后台 | 官方无此端点（候选路径全 404，见 `references/shipping-quote.md`） |
| 「图库收藏」原图导出 | 商家后台 | 官方无此端点（`gallery:pull`） |
| **删除图库图片** | 商家后台 | 官方**没有**删除接口（已探测 `/api/v1/gallery/delete`、`batch-delete` 均为假接口） |

- 官方 token：由 `.env` 的 `HICUSTOM_APP_KEY/APP_SECRET` 换取，**有效期 7200s**；`access_token` 以**查询参数**传（不是 Bearer 头）。
  ✅ **已内置自动兜底**：接口返回 token 无效/过期类错误（`2000 / 2106 / status -10001` 等）时，
  `HttpClient` 会自动 `invalidate()` 作废缓存 → 强制重取（refresh_token → 否则 app_key/app_secret）→ **重试一次**。
  因此**作图/刊登等官方链路不会因 token 过期而阻塞**。
  ⚠️ 仅当 app_key/app_secret 也失效（或账号被禁用）时才需人工处理。
- **待清理清单**：为跑流程上传的测试图（标定图/复核孪生图）会自动登记到 `.hicustom/_cleanup-pending.json`，
  用 `node scripts/hi.js gallery:clean`（`--list` 只看 / `--add a,b` 手工加 / `--prune` 剔除失效）一次性清理。
  删除走商家后台（官方无删除接口），cookie 不可用时会**明确报错并给出重新登录的办法**，不会静默失败。
- 商家后台 cookie：`.env` 的 `HICUSTOM_MERCHANT_COOKIE`；过期后需重新登录商家后台，再
  `node scripts/dev/oneshot/get-merchant-cookie.js` 抓取（走 CDP，浏览器保持登录即可）。
  **调用保护**（`app/Support/MerchantHttp.js`）：**串行 + 最小间隔 1.5s + 失败指数退避（默认重试 2 次）**，
  并**留痕**到 `.hicustom/_merchant-calls.jsonl`（查看：`node scripts/hi.js gallery:clean --log 20`）。
  env 可调：`HICUSTOM_MERCHANT_MIN_INTERVAL_MS`、`HICUSTOM_MERCHANT_RETRIES`。

## 来源
- 官方开放平台：https://www.hicustom.com/open_platform/home
- API 文档（xiaoyaoji）：http://xiaoyaoji.cn/project/1jPL8Hr5Xf7/1jUCjXS9TCC
- 端点以 `api.hicustom.com` 为准。
