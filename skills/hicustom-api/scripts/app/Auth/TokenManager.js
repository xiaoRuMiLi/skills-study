'use strict';
/**
 * TokenManager.js — OAuth2 鉴权：获取/刷新 access_token + 本地缓存 + 过期判断。
 * 通过注入的 rawHttp 发起鉴权请求（auth=false，不需要 access_token 本身）。
 * 缓存写入 <tokenCachePath>；access_token 绝不明文出现在聊天/前端。
 */
const fs = require('fs');
const path = require('path');

class TokenManager {
  constructor(config, rawHttp) {
    this.config = config;
    this.http = rawHttp;            // 无鉴权的 HttpClient（auth=false）
    this.cache = this._readCache();
  }

  _readCache() {
    try {
      const p = this.config.tokenCachePath;
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { /* ignore */ }
    return {};
  }
  _writeCache() {
    try {
      const p = this.config.tokenCachePath;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (e) { /* ignore */ }
  }
  _fresh(tok) { return tok && tok.expires_at && Date.now() < tok.expires_at; }

  // 刷新 access_token（app_key + refresh_token）
  async refresh() {
    const refreshToken = this.config.refreshToken || this.cache.refresh_token;
    if (!refreshToken) throw new Error('缺少 refresh_token（.env 的 HICUSTOM_REFRESH_TOKEN 或 token 缓存）');
    const r = await this.http.get(this.config.endpoints.refreshToken, {
      auth: false,
      query: { app_key: this.config.appKey, refresh_token: refreshToken },
    });
    await this._absorb(r);
    return this.cache.access_token;
  }

  // 首次获取 access_token（app_key + app_secret）
  async fetch() {
    if (!this.config.appKey || !this.config.appSecret) throw new Error('缺少 HICUSTOM_APP_KEY / HICUSTOM_APP_SECRET');
    const r = await this.http.get(this.config.endpoints.token, {
      auth: false,
      query: { app_key: this.config.appKey, app_secret: this.config.appSecret },
    });
    await this._absorb(r);
    return this.cache.access_token;
  }

  // 统一的取 token：优先缓存有效 -> refresh -> fetch
  // force=true 时忽略缓存（用于"服务端提前作废 token"的兜底重试）
  async accessToken(force) {
    if (!force && this._fresh(this.cache)) return this.cache.access_token;
    try { return await this.refresh(); }
    catch (e) { return await this.fetch(); }
  }

  /** 作废当前缓存（服务端返回"不合理/失效 token"时调用，触发下次强制重取） */
  invalidate() {
    this.cache.access_token = null;
    this.cache.expires_at = 0;
    this._writeCache();
  }

  _absorb(r) {
    const d = r.data || {};
    if (!d.access_token) throw new Error('取 token 失败: ' + JSON.stringify(r.raw).slice(0, 200));
    this.cache.access_token = d.access_token;
    this.cache.expires_in = d.expires_in;
    this.cache.expires_at = Date.now() + (Number(d.expires_in) || 7200) * 1000;
    if (d.refresh_token) this.cache.refresh_token = d.refresh_token;
    this.cache.refresh_token_expires_in = d.refresh_token_expires_in;
    this._writeCache();
  }

  status() {
    const fresh = this._fresh(this.cache);
    return {
      hasAccess: !!this.cache.access_token,
      fresh,
      expiresIn: fresh ? Math.max(0, Math.round((this.cache.expires_at - Date.now()) / 1000)) : 0,
      hasRefresh: !!this.config.refreshToken || !!this.cache.refresh_token,
    };
  }
}

module.exports = { TokenManager };
