#!/usr/bin/env node
/**
 * spapi-workflow.js — Persistent driver for the official Amazon SP-API *workflow* MCP.
 *
 * The workflow server (`sp-api-workflow-mcp-server`) is a stateful ASL state-machine
 * engine. Workflows, executions, and pending callbacks live in the server process, so a
 * single LONG-LIVED server session must be kept alive across build -> execute -> tail ->
 * callback. This script is that persistent driver (validated against the real tool schemas).
 *
 * Run as a daemon (background, pty) and send line-delimited JSON commands on stdin:
 *
 *   node scripts/spapi-workflow.js --daemon
 *
 * Command (one per line):  { "id": <n>, "tool": "<workflow-tool>", "args": { ... } }
 * Response (one per line):  { "id": <n>, "status": "ok"|"err", "result": ... | "error": ... }
 *
 * Convenience build (many states in one command):
 *   { "id": 3, "build": {
 *       "name": "demo", "start": "GetOrder",
 *       "states": [
 *         { "name": "GetOrder", "type": "task", "method": "GET",
 *           "path": "/orders/v0/orders/{orderId}", "path_params": { "orderId": "$.orderId" } },
 *         { "name": "Ask", "type": "input", "input_type": "Confirm",
 *           "title": "确认发货？", "default_value": "yes" }
 *       ],
 *       "transitions": [ { "from": "GetOrder", "to": "Ask" } ] } }
 *
 * Credentials (only needed for live Task calls) come from env / .env.
 */
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

function resolveBase() {
  const candidates = [
    process.env.SPAPI_MCP_PATH,
    'D:/node/node_cache/node_modules/@amazon-sp-api-release/sp-api-dev-mcp',
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@amazon-sp-api-release', 'sp-api-dev-mcp'),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0] || '';
}
const BASE = resolveBase();
const ENTRY = path.join(BASE, 'dist', 'index.js');
const SERVER = 'sp-api-workflow-mcp-server';

const STATE_TOOL = {
  task: 'add_task_state', fetch: 'add_fetch_state', choice: 'add_choice_state',
  succeed: 'add_succeed_state', fail: 'add_fail_state', wait: 'add_wait_state',
  pass: 'add_pass_state', input: 'add_input_state',
};

function startServer(env) {
  const p = spawn('node', [ENTRY, SERVER], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  p.stderr.on('data', (d) => process.stderr.write(d));
  return p;
}
function mcpClient(proc) {
  const rl = readline.createInterface({ input: proc.stdout });
  let nextId = 0; const pending = new Map();
  rl.on('line', (line) => {
    let m; try { m = JSON.parse(line); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { const x = pending.get(m.id); pending.delete(m.id); m.error ? x.reject(new Error(JSON.stringify(m.error))) : x.resolve(m.result); }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n'); });
  return { rpc };
}

function parseJson(text) {
  const t = (text || '').trim();
  try { if (t[0] === '{' || t[0] === '[') return JSON.parse(t); } catch (e) { }
  return text;
}
const textOf = (res) => {
  const s = (res.content || []).map((x) => (x.text != null ? x.text : JSON.stringify(x))).join('\n');
  return parseJson(s);
};

async function build(c, def) {
  const create = await c.rpc('tools/call', { name: 'create_workflow', arguments: { name: def.name || 'flow' } });
  const created = textOf(create);
  const workflow_id = (typeof created === 'object' && created.workflow_id) || String(created).match(/[\w-]{6,}/)?.[0];
  if (!workflow_id) throw new Error('create_workflow returned no id: ' + JSON.stringify(created));

  for (const st of (def.states || [])) {
    const tool = STATE_TOOL[st.type]; if (!tool) throw new Error('unknown state type ' + st.type);
    const args = { workflow_id, state_name: st.name };
    if (st.type === 'task') { args.method = st.method; args.path = st.path; if (st.path_params) args.path_params = st.path_params; if (st.query_params) args.query_params = st.query_params; if (st.body) args.body = st.body; }
    if (st.type === 'input') { args.input_type = st.input_type || 'Confirm'; args.title = st.title || st.question || 'Input'; args.result_path = st.result_path || '$.input'; if (st.default_value != null) args.default_value = st.default_value; if (st.description) args.description = st.description; }
    if (st.type === 'wait') { args.seconds = st.seconds; }
    if (st.type === 'pass') { args.result_path = st.result_path; }
    await c.rpc('tools/call', { name: tool, arguments: args });
  }
  for (const tr of (def.transitions || [])) await c.rpc('tools/call', { name: 'connect_states', arguments: { workflow_id, from_state: tr.from, to_state: tr.to } });
  if (def.start) await c.rpc('tools/call', { name: 'set_start_state', arguments: { workflow_id, state_name: def.start } });
  const val = await c.rpc('tools/call', { name: 'validate_workflow', arguments: { workflow_id } });
  return { workflow_id, validate: textOf(val) };
}

async function main() {
  const cliArg = process.argv[2];
  const env = { ...process.env };
  const envFile = path.join(process.cwd(), '.env');
  if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

  const proc = startServer(env);
  const c = mcpClient(proc);
  await c.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'spapi-workflow-driver', version: '1.0' } });
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

  if (cliArg === '--daemon') {
    console.error('[driver] workflow MCP up; send JSON commands on stdin. Ctrl-C to exit.');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', async (line) => {
      if (!line.trim()) return;
      let cmd; try { cmd = JSON.parse(line); } catch (e) { process.stdout.write(JSON.stringify({ id: null, status: 'err', error: 'bad JSON: ' + e.message }) + '\n'); return; }
      try {
        let result;
        if (cmd.build) result = await build(c, cmd.build);
        else if (cmd.tool) result = await c.rpc('tools/call', { name: cmd.tool, arguments: cmd.args || {} });
        else throw new Error('need "tool" or "build"');
        process.stdout.write(JSON.stringify({ id: cmd.id, status: 'ok', result: textOf(result) }) + '\n');
      } catch (e) { process.stdout.write(JSON.stringify({ id: cmd.id, status: 'err', error: e.message }) + '\n'); }
    });
  } else {
    process.exit(0);
  }
}
main().catch((e) => { console.error('fatal: ' + e.message); process.exit(1); });
