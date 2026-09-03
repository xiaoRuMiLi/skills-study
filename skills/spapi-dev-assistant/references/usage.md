# spapi-dev-assistant usage reference

This skill wraps the **official Amazon SP-API MCP** (`@amazon-sp-api-release/sp-api-dev-mcp`)
and gives the agent offline access to its bundled, authoritative spec data, plus optional
online refresh. Intent: build Amazon-rule-compliant code against the *real* endpoint
definitions, never against stale model memory.

## Bundled data (offline, authoritative)

The MCP package ships everything under its `bundled-servers/` dir:

| Path | What it is |
|------|-----------|
| `bundled-servers/models/<api>/<version>.json` | **Swagger 2.0 specs** for all 50 SP-APIs (`paths` + `definitions`). E.g. `orders-api-model/ordersV0.json`, `orders-api-model/orders_2026-01-01.json`. |
| `bundled-servers/sp-api-dev-assistant-data/data/prebuilt-index/index.json` | 35MB vector index of 3,755 doc passages (used by the MCP's `sp_api_reference` / `sp_api_explore_catalog`). |
| `bundled-servers/sp-api-dev-assistant-data/data/metadata.json` | **Freshness metadata** — `lastSuccessfulIndex`, `documentCount`, `crawlHistory`. |

Because the Swagger specs are local, you can answer "what's the right endpoint / params"
with **no network** and **no credentials** — exactly the base an ops assistant needs.

## Scripts

All scripts are in `scripts/` and are plain Node (run with `node`).

### `spapi-spec.js` — query offline spec (primary)
```bash
node scripts/spapi-spec.js "getOrders"             # find matching endpoints (path/method/params/responses)
node scripts/spapi-spec.js "orders" --schema GetOrdersResponse   # also print a definition
node scripts/spapi-spec.js --list                  # list all bundled APIs + versions
```
Returns method, path, operationId, parameters (name/in/required/description), and response
codes. Use this to verify an endpoint exists and its exact params before calling it.

### `spapi-freshness.js` — freshness check (the "did Amazon update?" guard)
```bash
node scripts/spapi-freshness.js                          # report lastSuccessfulIndex + age + verdict
node scripts/spapi-freshness.js --stale-days 14          # exit 1 if older than 14 days (for gating)
```
Reads `metadata.json`. If the bundle is older than the freshness window (default 30d) or the
specific endpoint's API version isn't present (newer API landed), pull a supplement before
generating code. This is how you avoid the "official docs updated but we didn't know" trap.

### `spapi-mcp.js` — optional online supplement (developer tools)
```bash
node scripts/spapi-mcp.js sp_api_reference --arg query="list orders"
node scripts/spapi-mcp.js sp_api_generate_code_sample --arg operation_id=getOrders --arg language=python
node scripts/spapi-mcp.js sp_api_migration_assistant --arg ...
```
Drives the live MCP stdio server. On networks where Amazon's doc-crawl is blocked (this machine
currently is) these tools may return `fetch failed` or hang. The script degrades gracefully and
points you back to `spapi-spec.js`. **Prefer `spapi-spec.js` for specs.** Use `spapi-mcp.js` only
to enrich (e.g. generate fresh code samples / migration guidance) when network allows.

### `sp-api-client.js` — authenticate + call SP-API (LWA + SigV4)
```bash
node scripts/sp-api-client.js get /orders/v0/orders --region fe --query "MarketplaceIds=XXX"
```
Reads creds from env or a local `.env` (never chat). Handles LWA refresh-token → access token,
AWS SigV4 signing (`service=execute-api`), regional endpoint. Use for real store operations.

**沙盒/生产适配**：`SP_API_SANDBOX` 决定 host——
- `true` → `sandbox.sellingpartnerapi-<region>.amazon.com`（沙盒测试）
- `false`/未设 → `sellingpartnerapi-<region>.amazon.com`（生产）
⚠️ 沙盒凭证需配 `SP_API_SANDBOX=true`，否则打生产会 403。`--env-check` 会显示环境+host+凭证 ✅/❌。


### `spapi-workflow.js` — multi-step workflow + approval (persistent daemon)
```bash
node scripts/spapi-workflow.js --daemon        # keep alive; send JSON commands on stdin
```
Persistent driver for the `sp-api-workflow-mcp-server` (ASL state-machine engine). Build a
workflow from states, connect them, set start, validate, execute, tail events, and handle
human-in-the-loop callbacks (`add_input_state` → `list_pending_callbacks` →
`submit_callback`). State must be checked: `create_workflow` returns JSON `workflow_id`;
state names use `state_name`; transitions use `from_state`/`to_state`; input states need
`input_type` + `title` + `result_path`. See SKILL.md "多步工作流" for command examples.

### `intents.md` — intent → endpoint map
Seller-intent glossary (查订单/算利润/改价/查库存/查报表 etc. → API family + opId). Use to
resolve ambiguous queries before choosing an endpoint.

## Recommended workflow
1. `spapi-freshness.js` — is the bundle fresh enough? If stale or the API version is missing, refresh.
2. `spapi-spec.js "<query>"` — get the authoritative endpoint, params, and response shapes.
3. Build/call the operation against those exact definitions (creds go in a local `.env`, not chat).
4. (Optional, network permitting) `spapi-mcp.js sp_api_*` for code samples / migration help.

## Package path
The scripts auto-resolve the package via `SPAPI_MCP_PATH` env, the default install path, or
`~/AppData/Roaming/npm/node_modules`. On this machine: `D:/node/node_cache/node_modules/@amazon-sp-api-release/sp-api-dev-mcp`.
