'use strict';
// @ts-nocheck
/**
 * retry.js — 限流重试封装（SP-API 强制要求）。
 * 指数退避 + 随机抖动；429 尊重 Retry-After；异常携带 status/retryAfter。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.floor(ms * (0.5 + Math.random()));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function withRetry(fn, { retries = 4, baseMs = 1000, factor = 2 } = {}) {
  let attempt = 0;
  let last;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = e && e.status;
      const retryAfter = e && e.retryAfter;
      if (status === 429 && retryAfter) {
        await sleep(num(retryAfter) * 1000);      // 尊重 Retry-After
      } else if (attempt < retries) {
        await sleep(jitter(baseMs * Math.pow(factor, attempt)));
      } else {
        break;
      }
      attempt++;
    }
  }
  throw last;
}

// 把底层抛出的错误加上 status/retryAfter（供 withRetry 识别）
function tagError(err, status, headers) {
  const e = err instanceof Error ? err : new Error(String(err));
  e.status = status;
  if (headers && headers['retry-after']) e.retryAfter = headers['retry-after'];
  return e;
}

module.exports = { withRetry, tagError };
