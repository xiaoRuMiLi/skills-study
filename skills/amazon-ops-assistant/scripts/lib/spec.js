'use strict';
// @ts-nocheck
/**
 * spec.js — 本地 Swagger 规范访问（权威，运行时可解析，不写死、不猜测）。
 * 数据源：api 官方 MCP 包 bundled-servers/models/。
 */
const fs = require('fs');
const path = require('path');

let cache = [];

function base() {
  // 复用 spapi-dev-assistant 的 _base.js（路径逻辑集中在那一处）
  const baseMod = path.join(__dirname, '..', '..', '..', 'spapi-dev-assistant', 'scripts', '_base.js');
  if (fs.existsSync(baseMod)) return require(baseMod).resolveBase();
  return '';
}

function modelsDir() {
  const b = base();
  return b ? path.join(b, 'bundled-servers', 'models') : '';
}

function getSpecs() {
  if (cache.length) return cache;
  const dir = modelsDir();
  if (!dir || !fs.existsSync(dir)) throw new Error('规范目录不存在: ' + dir + '。请安装/设置 SPAPI_MCP_PATH。');
  for (const api of fs.readdirSync(dir)) {
    const dd = path.join(dir, api);
    if (!fs.statSync(dd).isDirectory()) continue;
    for (const f of fs.readdirSync(dd)) {
      if (!f.endsWith('.json')) continue;
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(dd, f), 'utf8'));
        cache.push({ api, version: f.replace(/\.json$/, ''), spec });
      } catch (e) { /* skip unparseable */ }
    }
  }
  return cache;
}

// 按 operationId 解析端点（大小写不敏感），返回首个匹配
function resolveOp(opId) {
  const want = String(opId).toLowerCase();
  for (const entry of getSpecs()) {
    const spec = entry.spec;
    if (!spec.paths) continue;
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
        const op = ops[method];
        if (op && (op.operationId || '').toLowerCase() === want) {
          return { api: entry.api, version: entry.version, path: p, method: method.toUpperCase(), op };
        }
      }
    }
  }
  return null;
}

function listAllOps() {
  const seen = new Set();
  for (const entry of getSpecs()) {
    const spec = entry.spec;
    if (!spec.paths) continue;
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
        const op = ops[method];
        if (op && op.operationId) seen.add(op.operationId);
      }
    }
  }
  return [...seen].sort();
}

function specsMeta() {
  return { base: base(), count: getSpecs().length };
}

module.exports = { base, modelsDir, getSpecs, resolveOp, listAllOps, specsMeta };
