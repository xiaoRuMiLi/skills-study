---
name: spapi-dev-assistant
description: Amazon SP-API MCP 的规范包。当 agent 需要 (1) 查询/核实 Amazon Selling Partner API 的接口、参数、响应 schema，(2) 参照真实 Swagger 定义生成符合亚马逊规则的代码，(3) 检查内置 SP-API 规范索引的新旧并在过期时刷新，(4) 作为构建亚马逊运营助手的基础规范/MCP 接入层时使用。触发词：SP-API、Selling Partner API、亚马逊订单/报表/库存/定价/财务接口、SP-API 接口查询/生成、API 版本迁移、生成 SP-API 代码、亚马逊运营。
---

# SP-API 开发助手 (spapi-dev-assistant)

用**官方 Amazon SP-API MCP 内置的规范数据**，离线获取权威接口定义，让生成的代码准确、完全合规——**绝不靠模型记忆或猜测去拼接口**。

## 何时使用
- 需要某个 SP-API 操作的精确接口、HTTP 方法、参数、响应 schema 时
- 要生成/调用 SP-API 代码，且希望严格贴合真实定义时
- 想先确认内置规范索引是否过期再决定是否信任时
- 作为构建亚马逊运营助手的基础层时

## 硬性规则（必须遵守，不可跳过）

1. **强制先读本地规范**。MCP 包**本地内置全部 50 个 SP-API 的 Swagger 2.0 规范**（离线、无需凭证）。**写/调任何 SP-API 接口前，必须先用 `spapi-spec.js` 读出对应接口的规范**（路径、方法、参数、必填项、响应），核对无误再继续。
2. **必须再核对官方最新文档**。除本地规范外，**还要用 Node fetch 抓取 `developer-docs.amazon.com` 的官方最新文档交叉核对**（实测可直连，status 200 / ~1.6MB）。确保接口、参数、schema **完全符合官方最新要求**。
3. **禁止猜测**。任何不确定的接口路径、参数名、必填项、响应字段，都必须落到规范核实。查不到就明确提出"规范中未找到"，**不要编造**。
4. **抓官方原文用我自己的抓取，不依赖 MCP 的 fetch 工具**。MCP 的 `sp_api_reference`/`generate_code_sample` 在本机网络下常报 `fetch failed`/挂起；**改为我用 Node fetch 直接抓官方原文**（可靠）。MCP 联网工具仅作可选补充。
5. **强制在代码里写入限流（rate-limit）逻辑**。SP-API **每个接口都有调用频率限制**（spec Usage Plan 里标注 `Rate(requests/s)` 与 `Burst`；响应头 `x-amzn-RateLimit-Limit`）。**生成任何 SP-API 调用代码都必须内置限流/节流 + 重试逻辑**，不能裸调。原因：**频繁/超限调用会被亚马逊服务器拒绝（HTTP 429）拿不到数据，也可能触发风控导致账号封禁**。
   - **限流要点（必须写进代码）**：按 spec 的 rate/burst 控制请求频率；加**指数退避 + 抖动**的重试；处理 **429** 时尊重 `Retry-After`；用 `x-amzn-RequestId` 记录请求便于排查；批量/分页时均匀分发请求。
   - **禁止**：无节制的 `while/for` 连发、超过接口限流的并发、忽略 429 继续猛调。

## 安全与风险声明（合规红线，必须遵守）

1. **不要直接索取亚马逊开发者 Token/Secret**。agent 任何时候都**不得直接向用户要** `CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` 等凭证。凭证只能由用户**自行填进本机 `.env`**（绝不进聊天/回复）。
2. **强制告知密钥风险**。亚马逊对 `APP_SECRET` / `REFRESH_TOKEN` 等密钥管理极为谨慎。**密钥一旦泄露，可能被冒用导致账号被永久封禁/关店**。务必提醒用户：凭证只放本机、不截图、不进聊天、不提交到任何公开仓库，妥善保管。
3. **告知真实 API 调用的 IP 关联风险**。调用**真实（生产）SP-API** 存在**账号 IP 关联风险**：频繁/异常/来自异常 IP 的调用可能触发亚马逊风控。建议在**关联了卖家后台的那台电脑/网络**上调用，保持出口 IP 稳定，避免跨域异常。
4. **强烈建议开发时用 Sandbox（沙盒）API**。开发测试阶段应使用 **SP-API Sandbox**（沙盒测试环境，使用亚马逊提供的沙盒卖家账号和沙盒角色），**避免调用真实生产接口、避免污染卖家真实后台数据**。等开发自测通过、确认无误后，再切换真实生产授权调用。

> 以上声明在涉及真实凭证调用、账号授权、生产环境操作时必须主动向用户强调。
> **补充**：agent **不读取 `.env` 里的密钥明文值**（不 echo、不进聊天/日志）。脚本在运行时自己读取并使用密钥；如需检查配置，用 `node scripts/sp-api-client.js --env-check`（**只显示哪些键已填/缺失，不显示值**）。

## 引用来源必须上报（硬性规则，每轮都执行）
凡回复中**包含接口规范、参数、字段、官方规则等事实性内容**，**必须逐条标注数据来源**，供用户核对。不得含糊，不得让用户以为是你记忆里的东西。
- **本地文件** → 返回**完整绝对路径**。
- **官方在线文档** → 返回**完整 HTTP/HTTPS URL**。
- 若同一内容同时来自本地和官方，**两个来源都标**。
- 若某项来自 agent 自己的推理/经验（非本地也非官方），**必须明确标注"推测，需以官方为准"**，不得混同于规范。

**输出模板（每条事实后或在回复开头统一声明）：**
```
来源（本地）: <完整绝对路径，如 D:/node/.../ordersV0.json>
来源（官方）: https://developer-docs.amazon.com/sp-api/docs/...
```

## 工作流

### 0. 先做意图→查询映射（用判断，不要只看关键词）
这是**规范查证**工具。遇到模糊意图，先别猜单个词：
- 按 **API 家族** 查，例如 `pricing`、`listings price`、`fulfillment outbound`、`fba inventory`。
- "改价格" → 用 `listings price` 查（正确操作是 `putListingsItem`）。
- 意图真歧义时（如"取消订单"= 取消卖家订单 vs 取消 FBA 履约），**先问用户**再选接口。
- 不确定就用 `references/intents.md` 速查表。
- 选定操作后，按硬性规则用规范+官方文档双核对 opId、参数、schema。

### 1. 查规范新旧
```bash
node scripts/spapi-freshness.js
```
读取 `metadata.json`（`lastSuccessfulIndex`、`documentCount`）。若索引过期（>30 天）或缺少所需 API 版本，规范可能过时，写代码前先刷新。可用 `--stale-days N` 做条件判断。

### 2. 强制查权威规范（必做）
```bash
node scripts/spapi-spec.js "getOrders"
node scripts/spapi-spec.js "orders" --schema GetOrdersResponse
node scripts/spapi-spec.js --list
```
返回方法、路径、operationId、参数（名称/位置/是否必填/说明）、响应码。**这是写接口前的强制第一步**。结果标注 `[SELLER]`/`[VENDOR]`（SELLER=你自己账户，需你的 SP-API OAuth；VENDOR=批发/供应商，授权不同）。

### 3. 抓官方最新文档交叉核对（必做）
用 Node fetch 抓 `developer-docs.amazon.com` 对应页面，与本地规范核对。官方 URL 可用：
- `https://developer-docs.amazon.com/sp-api/docs/<api>-api-v<ver>-reference`（接口参考）
- 规范里内嵌的链接也可直接用（见规范中的 developer-docs.amazon.com URL）
- 抓取后**上报完整 URL** 给用户。

### 4.（可选）联网补充
```bash
node scripts/spapi-mcp.js sp_api_reference --arg query="list orders"
node scripts/spapi-mcp.js sp_api_generate_code_sample --arg operation_id=getOrders --arg language=python
```
调用 live MCP stdio server。网络被拦时返回 `fetch failed`/挂起——脚本优雅降级并指向 `spapi-spec.js`。**规范优先用 spapi-spec.js**；本机我直接抓官方原文更可靠。

### 5. 真正调用接口（认证+签名）
读取 `.env` 凭证，用 `scripts/sp-api-client.js` 完成 **LWA 换 token + SigV4 签名**：
```bash
node scripts/sp-api-client.js get /orders/v0/orders --region fe --query "MarketplaceIds=XXX"
```
`.env`（放本机，不进聊天）：
```
SP_API_CLIENT_ID=你的client_id
SP_API_CLIENT_SECRET=你的client_secret
SP_API_REFRESH_TOKEN=你的refresh_token
SP_API_REGION=fe   # na/eu/fe
```

## 环境与依赖（前置条件）
本 skill 的脚本需要以下环境，缺失会报错。

### 必需运行环境
- **Node.js >= 20**（本项目在 v24.11.1 验证）。skill 的脚本只用 Node **内置模块**（`fs`/`path`/`crypto`/`readline`/`child_process`），**skill 自身零第三方依赖**，无需为 skill 单独 `npm install`。
- **npm** —— 用于安装官方 MCP 包（本机 v11.6.2）。**这是规范数据的唯一本地来源。**
- **git** —— **可选**，仅当你要修改/跑 MCP 源码仓库时才需要（本机 v2.39.2.windows.1）。**skill 用不到 git**。

### 官方 MCP 包（规范数据来源，硬性要求）
- **包名 / 版本**：`@amazon-sp-api-release/sp-api-dev-mcp@1.0.5`
- **安装**：`npm install -g @amazon-sp-api-release/sp-api-dev-mcp`
- **本地规范数据就在这个包里**：`bundled-servers/models/*.json`（Swagger 规范）、`bundled-servers/sp-api-dev-assistant-data/*`（文档索引 + 时间戳）。**已随安装自带，脚本直接读它，因此不必先 git clone。**
- **源码仓库**（仅可选，开发需要）：`https://github.com/amzn/selling-partner-api-samples`（`use-cases/sp-api-dev-mcp`；`git clone` 可拉取）
- **包自带依赖**（随包安装，一般无需手动处理）：
  - `@huggingface/transformers` `^3.0.0`（文档向量嵌入）
  - `sharp` `^0.33.5`（图像处理）
  - `vectra` `^0.14.0`（向量数据库）

### 本机已验证版本示例2
| 组件 | 版本 |
|------|------|
| Node.js | v24.11.1 |
| npm | 11.6.2 |
| git | 2.39.2.windows.1 |
| MCP 包 | @amazon-sp-api-release/sp-api-dev-mcp@1.0.5 |

## 多步工作流（workflow）—— SP-API 多步自动化 + 审批
官方 MCP 还带一个**独立的 workflow 服务器**（`sp-api-workflow-mcp-server`），是一个 **ASL(Amazon States Language) 状态机引擎**（30 个工具）。适合把多步请求（如 建仓→改价→查报表）串成**一条可追踪、可审批、带回调**的流程。

### 触发建议（发现用户在写/想做流程时，必须推荐 workflow）
当 agent 发现用户**写了一个流程**，或**想完成一个多步、串行、需要中间判断/确认的功能**（如「先查订单→再改价→最后出报表」这类），**必须主动建议用户使用 workflow，并说明原因**，而不是让他一个个手动调用接口。

**判断「该用 workflow」的信号**：
- 多个 SP-API 操作**按顺序执行**、且**后一步依赖前一步结果**
- 需要**中间人工确认/审批**（如改价前要点头）
- 需要**流程可追踪、可回放、可复用**，或想可视化（mermaid）
- 想做成**可重复执行**的自动化任务

**必须告诉用户「为什么用 workflow」**（向用户解释这些好处）：
- **可追踪**：每个执行有 `execution_id`，`get_execution_status`/`tail_execution_events` 全程看进度。
- **可审批**：`input_state` 会让流程**暂停等人工确认**，`submit_callback` 通过后自动继续——中间有闸门，不会盲跑。
- **带回调/超时**：`list_pending_callbacks` / `extend_callback_timeout` 管理待处理审批。
- **可复用可校验**：`validate_workflow` 先校验、`list_workflows` 复用、`workflow_to_mermaid` 可视化。
- **串并联清晰**：用状态机把依赖关系画清楚，比零散脚本靠谱得多。

> 一句话：凡是「**一串有关联、需要人审、要追踪**」的 SP-API 操作，都推荐 workflow；单个无依赖调用才直接调接口。

### 怎么用（驱动脚本 `scripts/spapi-workflow.js`）：
```bash
# 常驻 daemon（后台、保持同一 server 会话，状态在进程内）
node scripts/spapi-workflow.js --daemon
```
然后向它的 stdin 发一行一条的 JSON 命令，例如：
```jsonc
// 建流程（一次建多个状态）
{"id":1,"build":{"name":"demo","start":"GetOrder","states":[
  {"name":"GetOrder","type":"task","method":"GET","path":"/orders/v0/orders/{orderId}","path_params":{"orderId":"$.orderId"}},
  {"name":"Ask","type":"input","input_type":"Confirm","title":"确认发货？","default_value":"yes"}
],"transitions":[{"from":"GetOrder","to":"Ask"}]}}
// 执行
{"id":2,"tool":"execute_workflow","args":{"workflow_id":"wf_xxx","input":{"orderId":"123"}}}
// 跟踪
{"id":3,"tool":"get_execution_status","args":{"execution_id":"ex_xxx"}}
// 队列事件/回调
{"id":4,"tool":"tail_execution_events","args":{"execution_id":"ex_xxx"}}
{"id":5,"tool":"list_pending_callbacks","args":{}}
// 审批（人工介入）
{"id":6,"tool":"submit_callback","args":{"callback_id":"cb_xxx","approved":true}}
```
**关键点**：
- `create_workflow` 返回 **JSON**，用里面的 `workflow_id`；状态名用 **`state_name`**，链接用 **`from_state`/`to_state`**，起点用 **`state_name`**。
- **`input_state` = 审批**：流程会**暂停等人工输入**（`list_pending_callbacks` 找到 -> `submit_callback` 提交 -> `resume_execution` 继续）。
- 涉及真实接口的 `task_state` 执行**需要凭证**（`.env`）；建流程/校验/列清单不用。
- 可 `workflow_to_mermaid` 可视化、`workflow_to_nodejs` 导出独立程序。
- 状态在服务器进程内，**必须保持同一个 daemon 连接**，不能每次重建。

## 凭证存放与首次配置（约定，agent 首次使用/需要时执行）

**位置约定（重要）**：真实 `.env` **放在「项目工作区」，不放 skill 目录**。
- **项目工作区**：默认 `~/openclaw/workspace-dev/amazon-dev/`（即 skill 的**兄弟目录**）。
- **原因**：skill 会被打包/分发（生成 `.skill`），若 `.env` 在 skill 里，**打包时会把密钥烤进包里造成泄露**；且 skill 应是可复用的非敏感工具。所以密钥放项目工作区，skill 只放模板。

**agent 首次使用 / 需要凭证时的流程**：
1. 若项目工作区不存在，**创建该目录**。
2. 检查 `<项目工作区>/.env` 是否存在；不存在则**从 skill 的 `references/.env.example` 拷贝一份到 `<项目工作区>/.env`**。
3. **让用户本人填真实值**（agent 不读明文值），或用沙盒凭证。
4. 用 `node scripts/sp-api-client.js --env-check` 确认键已填（只显示 ✅/❌）。

**模板**：`references/.env.example`（已随 skill 提供，含全部键和注释）。

**脚本解析路径**（自动三选一）：`SPAPI_ENV_FILE` 指定 → 当前目录 `.env` → `<skill>/../amazon-dev/.env`。所以放 `amazon-dev` 一定能被找到。

## 文件
- `scripts/spapi-spec.js` — 查离线 Swagger 规范（主、强制第一步）。
- `scripts/spapi-freshness.js` — 读 metadata 时间戳判新旧。
- `scripts/spapi-mcp.js` — 调 live MCP 开发工具（网络受限时优雅降级）。
- `scripts/sp-api-client.js` — LWA 登录取 token + SigV4 签名调用（读 .env 凭证）。
- `scripts/spapi-workflow.js` — 多步工作流 daemon（建流程/execute/tail/回调审批）。
- `references/intents.md` — 「卖家意图→接口」速查表（消歧用）。
- `references/usage.md` — 完整用法、数据位置、网络注意点。

## 备注
- 脚本自动解析 MCP 包路径（详见 `references/usage.md`）。
- 内置数据在 `本地node安装路径/node/node_cache/node_modules/@amazon-sp-api-release/sp-api-dev-mcp/bundled-servers/`。
