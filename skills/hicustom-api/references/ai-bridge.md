# ai-bridge.md — 页面「唤起 AI 协作」统一网关

> 定位：给网页/命令一个**统一入口**去「唤起 AI 干活」——改提示词、出方案、问答、生成文案……
> 页面只管发「意图」（`type` + `payload`），网关负责翻译成一次 LLM 调用并返回结构化结果。
> 实现：`scripts/app/Services/AiAssistService.js` + `scripts/server/serve.js` 的 `POST /api/ai/run`。

## 为什么要有它
- 网页里"需要动脑"的地方越来越多（改提示词、调方案、审查、问答…）。
- 与其每个页面各自 `fetch` 智谱、各自拼 system prompt、各自读 key，不如**一个网关**：
  统一鉴权/模型/超时/错误/日志，页面只认 `type`。
- **可平滑升级**：今天网关走**本机 LLM（智谱 glm-4）**，自包含、可靠；
  将来要把某些 `type` 转给 **OpenClaw agent**（带 skill/记忆/工具）时，**只改 `AiAssistService.dispatch` 的实现**，页面与接口完全不变。

## 接口
```
POST /api/ai/run
Content-Type: application/json

{ "type": "<任务类型>", "payload": { ... } }
```
响应：
```jsonc
{ "ok": true, "type": "<任务类型>", "result": { ... } }
// 失败：{ "ok": false, "err": "<原因>" }（HTTP 4xx/5xx）
```
> 同步调用（页面按钮直接等结果，配合 loading 态）。耗时任务（如批量/多步）走 `JobStore` + `/api/flow/*`（见 `references/flows.md`）。

## 已注册的 type
| type | payload | result | 用途 |
|---|---|---|---|
| `pattern.prompt.rewrite` | `{ productId, base?, angle? }` | `{ prompt, angle }` | **用商品信息重写一版「明显不一样」的文生图提示词**（换风格/题材/构图，保留平铺印花、无实物/文字/logo、底部 12% 白边、画布比例等硬约束） |
| `pattern.prompt.fix` | `{ productId?, prompt, error }` | `{ prompt, note }` | **按文生图报错改进提示词**：判断报错是否与提示词相关——相关则改、无关则原样返回并说明（页面「🛠 按报错改进提示词」用） |
| `text.rewrite` | `{ text, instruction?, context? }` | `{ text, original }` | **通用「选区改写」**：任意文本框里选中一段 + 一句要求 → 改写后的该段（供通用挂件 `ai-edit.js` 用；指令与文本/字段无关） |
| `text.ask` | `{ question, context? }` | `{ text }` | 通用问答（页面任意位置可唤起） |

- `pattern.prompt.rewrite` 的 **变体保证**：服务端从 `ANGLES` 方向池**随机挑一个**风格方向，并把上一版提示词作为 `base` 传入，要求"与上一版明显不同"。故每次点击方案都不一样。
- `base` 不传则用 `ZhipuService.buildImagePrompt(商品)` 的默认作为基准。

## 页面用法（示例：design.html 的「✨ 用商品信息重写提示词」）
```js
const r = await fetch('/api/ai/run', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'pattern.prompt.rewrite', payload: { productId: ID, base: el.value } }),
});
const j = await r.json();
if (j.ok) el.value = j.result.prompt;   // 换一版方案
```

## 通用挂件：选中 → 右键 → AI 改写（`app/pages/ai-edit.js`）
- 页面引入一行即启用：`<script src="/ai-edit.js"></script>`（`serve.js` 已放开从 `pages/` 取 `.js/.css`）。
- 生效范围：所有 `textarea` / 可编辑区 `[contenteditable]` / `[data-ai-edit]`（自动挂载）。
- 交互：**选中文字 → 右键 → 菜单「✨ AI 改写」→ 对话框**（显示选中片段 + 输入要求 + 快捷词）→ **直接原地替换**。
- 撤销：走浏览器**原生 Ctrl+Z**（替换用 `document.execCommand('insertText')`，保留编辑历史）。
- 通用性：指令与文本无关；将来要支持"任意可选文字"，给元素加 `data-ai-edit`，或放宽挂件里的 `TARGET` 选择器即可。
- 依赖：`text.rewrite` 这个 type（见上表）。

## 加一个新的协作场景（开闭原则）
1. 在 `AiAssistService` 里加一个方法（如 `writeBullets({...})`）。
2. 在 `dispatch` 的 `switch` 里加一个 `case '<你的type>':`。
3. 页面/命令调 `POST /api/ai/run { type:'<你的type>', payload }`。
> `serve.js` / 容器绑定 / 页面骨架都**不用改**。

## 与 OpenClaw agent 的对接（升级路径）
- 现状：`AiAssistService` 用容器里的 `zhipuClient`（`app/Services/ZhipuClient.js`，glm-4）。
- 升级：若要把某 `type` 交给 OpenClaw agent，在 `dispatch` 里改为"转发给 agent 的桥"即可；
  建议**按 type 路由**（轻量/结构化的留在本机 LLM，需要 skill/记忆/工具的才转 agent），避免把简单调用也拖进重链路。
- 密钥：`ZHIPU_API_KEY` 只放本机 `.env`（`serve.js` 启动时读入 `process.env`）。

## 约定
- **只读/幂等**：网关只产出文本/结构，**不写库、不下单、不改文件**（写操作由调用方按各自流程处理）。
- **合规**：生成内容沿用各自 `type` 的规则（如文生图提示词必须禁文字/logo/品牌/实物）。
- **费用**：每次调用计费，页面按钮应防抖（禁用 + "…中"态）。
