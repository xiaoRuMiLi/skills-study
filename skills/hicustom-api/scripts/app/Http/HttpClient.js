'use strict';
/**
 * HttpClient.js — 统一 HTTP 客户端。
 * - 拼接 baseUrl + path
 * - 自动注入 access_token（全局请求参数：GET/query，POST form 用字段）
 * - 支持 query / form(multipart) / urlencoded / json
 * - 返回归一化 { status, ok, code, msg, errMsg, data, raw }
 *   errMsg = 结合全局错误码目录翻译的中文报错；token/refresh 用 auth=false。
 */
const { describe } = require('../Support/ErrorCatalog');

class HttpClient {
  constructor(config, tokenManager) {
    this.config = config;
    this.tokens = tokenManager;
  }
  /** 是否为"token 无效/过期"类错误（用于自动重取并重试） */
  static isAuthError(res) {
    if (!res) return false;
    if (res.code === 2000) return true;                         // 不合理的 access_token
    if (res.code === 2106) return true;                         // access_token 已过期
    if (res.code === 2107 || res.code === 2108) return true;    // token 相关（保守并上）
    if (res.raw && res.raw.status === -10001) return true;      // 账号自动登出
    if (res.code !== 200 && /access_token|refresh_token|token\s*(无效|过期|不合理)|未授权|请登录/i.test(String(res.msg || ''))) return true;
    return false;
  }

  async call(method, path, opts = {}) {
    const auth = (opts.auth !== false);
    let res = await this._once(method, path, opts, false);
    if (auth && this.tokens && this.tokens.invalidate && HttpClient.isAuthError(res)) {
      this.tokens.invalidate();                                 // 作废缓存
      res = await this._once(method, path, opts, true);         // 强制重取 token 后重试一次
    }
    return res;
  }

  async _once(method, path, { auth = true, query = {}, form = null, json = null, urlencoded = null, headers = {} } = {}, force) {
    const url = new URL(this.config.baseUrl + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null || v === '') continue;
      url.searchParams.set(k, (typeof v === 'object') ? (Array.isArray(v) ? v.join(',') : JSON.stringify(v)) : String(v));
    }

    const h = { ...headers };
    let body;
    if (form) {
      // form 可为已构建的 FormData（保留文件名）或普通对象
      let fd = form instanceof FormData ? form : new FormData();
      if (!(form instanceof FormData)) {
        for (const [k, v] of Object.entries(form)) if (v != null && v !== '') fd.append(k, v);
      }
      if (auth) fd.append('access_token', await this.tokens.accessToken(force));
      body = fd;
    } else if (json) {
      h['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
      if (auth) url.searchParams.set('access_token', await this.tokens.accessToken(force));
    } else if (urlencoded) {
      h['Content-Type'] = 'application/x-www-form-urlencoded';
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(urlencoded)) if (v != null && v !== '') usp.append(k, (typeof v === 'object') ? JSON.stringify(v) : String(v));
      if (auth) usp.append('access_token', await this.tokens.accessToken(force));
      body = usp;
    } else {
      if (auth) url.searchParams.set('access_token', await this.tokens.accessToken(force));
    }

    const resp = await fetch(url, { method, headers: h, body });
    const text = await resp.text();
    let parsed; try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
    const bodyObj = (parsed && typeof parsed === 'object') ? parsed : {};
    const errMsg = (bodyObj.code != null && bodyObj.code !== 200) ? describe(bodyObj.code, bodyObj.msg) : undefined;
    return {
      status: resp.status,
      ok: resp.ok,
      code: bodyObj.code,
      msg: bodyObj.msg,
      errMsg,
      data: bodyObj.data,
      raw: parsed,
    };
  }
  get(path, opts) { return this.call('GET', path, opts); }
  post(path, opts) { return this.call('POST', path, opts); }
  patch(path, opts) { return this.call('PATCH', path, opts); }
  put(path, opts) { return this.call('PUT', path, opts); }
  delete(path, opts) { return this.call('DELETE', path, opts); }
}

module.exports = { HttpClient };
