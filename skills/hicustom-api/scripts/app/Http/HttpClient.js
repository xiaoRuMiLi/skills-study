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
  async call(method, path, { auth = true, query = {}, form = null, json = null, urlencoded = null, headers = {} } = {}) {
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
      if (auth) fd.append('access_token', await this.tokens.accessToken());
      body = fd;
    } else if (json) {
      h['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
      if (auth) url.searchParams.set('access_token', await this.tokens.accessToken());
    } else if (urlencoded) {
      h['Content-Type'] = 'application/x-www-form-urlencoded';
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(urlencoded)) if (v != null && v !== '') usp.append(k, (typeof v === 'object') ? JSON.stringify(v) : String(v));
      if (auth) usp.append('access_token', await this.tokens.accessToken());
      body = usp;
    } else {
      if (auth) url.searchParams.set('access_token', await this.tokens.accessToken());
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
