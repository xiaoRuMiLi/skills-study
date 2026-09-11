'use strict';
/**
 * MerchantHttp —— 商家后台（www.hicustom.com）专用 HTTP 包装。
 *
 * ⚠️ 商家后台**不是官方开放平台**：我们只是借用浏览器会话 cookie 调用官方未提供的少数接口
 *    （运费试算 / 图库收藏导出 / 删除图库）。为了"体面且不惹眼"，统一加三道保护：
 *      ① 串行   —— 同一时刻只发一个请求（绝不并发轰炸）
 *      ② 节流   —— 两次请求之间最小间隔（默认 1500ms，env HICUSTOM_MERCHANT_MIN_INTERVAL_MS 可调）
 *      ③ 退避   —— 网络错误 / 429 / 5xx 时指数退避重试（默认最多 2 次）
 *    并把每次调用写进日志：<stateDir>/_merchant-calls.jsonl（便于事后核对"我们到底调了什么"）
 *
 * 用法：const mhttp = require('../Support/MerchantHttp').getMerchantHttp(config);
 *       const res = await mhttp.request('POST', url, { headers, body });
 */
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const instances = new Map();

class MerchantHttp {
  constructor(config) {
    this.config = config;
    this.minIntervalMs = Number(process.env.HICUSTOM_MERCHANT_MIN_INTERVAL_MS || 1500);
    this.maxRetries = Number(process.env.HICUSTOM_MERCHANT_RETRIES || 2);
    this.logFile = path.join(path.dirname(config.tokenCachePath), '_merchant-calls.jsonl');
    this._chain = Promise.resolve();
    this._last = 0;
    this._count = 0;
  }

  _redact(url) {
    try {
      const u = new URL(url);
      return (u.pathname + (u.search ? u.search.slice(0, 80) : '')).slice(0, 140);
    } catch (e) { return String(url).slice(0, 140); }
  }

  _log(rec) {
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, JSON.stringify(rec) + '\n', 'utf8');
      this._count++;
      if (this._count % 50 === 0) this._trim();
    } catch (e) { /* 日志失败不影响主流程 */ }
  }

  /** 日志保留最近 500 行，避免无限增长 */
  _trim() {
    try {
      const lines = fs.readFileSync(this.logFile, 'utf8').trim().split('\n');
      if (lines.length > 500) fs.writeFileSync(this.logFile, lines.slice(-500).join('\n') + '\n', 'utf8');
    } catch (e) { /* ignore */ }
  }

  /** 统一的商家后台请求入口（串行 + 节流 + 退避） */
  async request(method, url, opts = {}) {
    const run = async () => {
      let lastErr = null;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const wait = Math.max(0, this.minIntervalMs - (Date.now() - this._last));
        if (wait) await sleep(wait);
        this._last = Date.now();
        const t0 = Date.now();
        try {
          const res = await fetch(url, { method, headers: opts.headers, body: opts.body, redirect: opts.redirect });
          this._log({ ts: new Date().toISOString(), method, path: this._redact(url), status: res.status, ms: Date.now() - t0, attempt });
          if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
            lastErr = new Error('HTTP ' + res.status);
            await sleep(600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250));
            continue;
          }
          return res;
        } catch (e) {
          lastErr = e;
          this._log({ ts: new Date().toISOString(), method, path: this._redact(url), error: e.message, ms: Date.now() - t0, attempt });
          if (attempt < this.maxRetries) { await sleep(600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250)); continue; }
          throw e;
        }
      }
      throw lastErr || new Error('request failed');
    };
    const p = this._chain.then(run, run);       // 串行：排到队列尾
    this._chain = p.then(() => {}, () => {});   // 队列不因单个失败而中断
    return p;
  }

  get(url, opts) { return this.request('GET', url, opts); }
  post(url, opts) { return this.request('POST', url, opts); }

  /** 最近 N 条调用记录（供排查） */
  recent(n = 20) {
    try {
      const lines = fs.readFileSync(this.logFile, 'utf8').trim().split('\n');
      return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    } catch (e) { return []; }
  }
}

function getMerchantHttp(config) {
  const key = path.dirname(config.tokenCachePath);
  if (!instances.has(key)) instances.set(key, new MerchantHttp(config));
  return instances.get(key);
}

module.exports = { MerchantHttp, getMerchantHttp };
