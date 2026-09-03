'use strict';
// @ts-nocheck
/**
 * client.js — SP-API 客户端适配器（桥接层）。
 * 将「按 operationId 调用」封装为稳定接口：解析规范 -> withRetry -> 底层 callSPAPI。
 * 底层复用 spapi-dev-assistant 的 sp-api-client.js（LWA + SigV4），不重复造轮子。
 */
const fs = require('fs');
const path = require('path');
const spec = require('./spec');
const { withRetry, tagError } = require('./retry');
const { NotFoundError } = require('./errors');

const SIBLING_CLIENT = path.join(__dirname, '..', '..', '..', 'spapi-dev-assistant', 'scripts', 'sp-api-client.js');
const SIBLING_SPEC = path.join(__dirname, '..', '..', '..', 'spapi-dev-assistant', 'scripts', 'spapi-spec.js');

let clientMod = null;
function getClient() {
  if (clientMod) return clientMod;
  if (!fs.existsSync(SIBLING_CLIENT)) throw new Error('未找到 spapi-dev-assistant/sp-api-client.js。请挂载底层 skill。');
  clientMod = require(SIBLING_CLIENT);
  return clientMod;
}

// 按 opId 调用：解析规范 -> 用底层签名调用 -> 限流重试
// opts: { query, body, pathParams }  pathParams 会替换进路径（如 orderId）
async function callOp(opId, { query = {}, body = null, pathParams = {} } = {}) {
  const resolved = spec.resolveOp(opId);
  if (!resolved) throw new NotFoundError(opId);
  let finalPath = resolved.path;
  for (const [k, v] of Object.entries(pathParams)) {
    finalPath = finalPath.replace(new RegExp('\\{' + k + '\\}', 'g'), encodeURIComponent(v));
  }
  const client = getClient();
  const result = await withRetry(async () => {
    try {
      return await client.callSPAPI({ method: resolved.method, path: finalPath, query, body });
    } catch (e) {
      const status = e && e.status;
      if (status) throw tagError(e, status, e.headers);
      throw e;
    }
  });
  return { resolved, path: finalPath, ...result };
}

// 便捷：直接读底层 CLI 输出（用于 env-check / 同步辅助）
function runClientCli(args) {
  try {
    const { execFileSync } = require('child_process');
    return execFileSync(process.execPath, [SIBLING_CLIENT, ...args], { encoding: 'utf8' });
  } catch (e) { return ''; }
}

// 便捷：跑 spapi-spec.js（本地规范查询，不产生 HTTP 调用）
function runSpecCli(args) {
  try {
    const { execFileSync } = require('child_process');
    return execFileSync(process.execPath, [SIBLING_SPEC, ...args], { encoding: 'utf8' });
  } catch (e) { return ''; }
}

module.exports = { callOp, getClient, runClientCli, runSpecCli, SIBLING_CLIENT, SIBLING_SPEC };
