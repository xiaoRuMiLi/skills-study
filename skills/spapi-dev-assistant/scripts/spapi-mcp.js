#!/usr/bin/env node
/**
 * spapi-mcp.js — Drive the official Amazon SP-API MCP server as a supplement.
 *
 * This is a minimal zero-dependency MCP stdio client. It launches the bundled
 * MCP server and calls one of its tools. Use it for the *developer* tools that
 * enrich/refresh knowledge (reference, explore_catalog, generate_code_sample,
 * migration_assistant). For the actual endpoint specs, prefer spapi-spec.js
 * (offline + authoritative). For real store operations, use sp-api-run.js.
 *
 * NOTE: On networks where the MCP's online doc-crawl is blocked, these tools may
 * return "fetch failed" or hang. This script degrades gracefully and tells you to
 * fall back to the local spec.
 *
 * Usage:
 *   node spapi-mcp.js <tool> [--arg key=value ...]
 *   node spapi-mcp.js sp_api_reference --arg query="list orders"
 *   node spapi-mcp.js sp_api_generate_code_sample --arg operation_id=getOrders --arg language=python
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const { resolveBase } = require('./_base');
const BASE = resolveBase();
const ENTRY = path.join(BASE, 'dist', 'index.js');
const SERVER_NAME_BY_ALIAS = {
  assistant: 'sp-api-dev-assistant-mcp-server',
  workflow: 'sp-api-workflow-mcp-server',
};
const DEFAULT_SERVER = 'sp-api-dev-assistant-mcp-server';

const argv = process.argv.slice(2);
const tool = argv[0];
if (!tool) { console.error('Usage: node spapi-mcp.js <tool> [--arg k=v ...]'); process.exit(1); }

// parse --arg key=value pairs, and an optional --server alias
let server = DEFAULT_SERVER;
const args = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--server') { server = SERVER_NAME_BY_ALIAS[argv[++i]] || DEFAULT_SERVER; continue; }
  if (a === '--arg') {
    const kv = argv[++i];
    const eq = kv.indexOf('=');
    if (eq !== -1) args[kv.slice(0, eq)] = kv.slice(eq + 1);
    continue;
  }
}

const env = { ...process.env,
  SP_API_CLIENT_ID: process.env.SP_API_CLIENT_ID || '',
  SP_API_CLIENT_SECRET: process.env.SP_API_CLIENT_SECRET || '',
  SP_API_REFRESH_TOKEN: process.env.SP_API_REFRESH_TOKEN || '',
};

const proc = spawn('node', [ENTRY, server], { env, stdio: ['pipe', 'pipe', 'pipe'] });
const rl = readline.createInterface({ input: proc.stdout });
let nextId = 0; const pending = new Map();
rl.on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch (e) { return; }
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  }
});
proc.stderr.on('data', (d) => process.stderr.write(d));

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n');
  });
}

async function main() {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'spapi-assistant', version: '1.0' } });
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  if (init.serverInfo) console.error('[mcp] server ' + init.serverInfo.name + ' v' + init.serverInfo.version);

  const res = await rpc('tools/call', { name: tool, arguments: args });
  const content = (res.content || []).map(c => c.text || JSON.stringify(c)).join('\n');
  if (res.isError || /failed|fetch failed|error|timeout/i.test(content)) {
    console.log(content);
    console.error('MCP tool "' + tool + '" errored (often a network/crawl block).');
    console.error('Fall back to the offline authoritative spec:  node spapi-spec.js "<your query>"');
    proc.kill(); process.exit(1);
  }
  console.log(content);
  proc.kill(); process.exit(0);
}

main().catch((e) => {
  const msg = e.message || String(e);
  console.error('MCP call to "' + tool + '" failed: ' + msg);
  console.error('This is usually a network/crawl block. Fall back to the offline authoritative spec:');
  console.error('  node spapi-spec.js "<your query>"   (see scripts/spapi-spec.js)');
  proc.kill(); process.exit(1);
});
setTimeout(() => { console.error('TIMEOUT after 45s (tool may be blocked on network). Falling back to local spec.'); proc.kill(); process.exit(1); }, 45000);
