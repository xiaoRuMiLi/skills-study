'use strict';
/**
 * DesignerCallback.js — 设计器 SDK 回调（供 HICUSTOM 调用我方服务器的两个接口）。
 * 1) GET /gallery/list      自定义图库（设计器取图源）→ 分页图片列表
 * 2) GET /gallery/original  原图地址（保存设计时 HICUSTOM 拉原图）→ 需校验 sign
 * 3) GET /files/<name>      本服务器直接提供图片文件（图源是 inputDir）
 * 纯函数/处理器，不含监听；server.js 用它 createServer。
 * sign 规则（文档 PHP 示例）：params 按值 asort 升序，数组展开 key[i]，http_build_query 后 hmacsha256(app_secret)。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

function __asortKeys(params) {
  // PHP asort：按值升序，数组 > 标量
  return Object.keys(params).sort((a, b) => {
    const av = params[a], bv = params[b], ai = Array.isArray(av), bi = Array.isArray(bv);
    if (ai && !bi) return 1;
    if (!ai && bi) return -1;
    if (ai && bi) return 0;
    return String(av) < String(bv) ? -1 : (String(av) > String(bv) ? 1 : 0);
  });
}
function __buildQuery(params, keys) {
  const parts = [];
  for (const k of keys) {
    const v = params[k];
    if (Array.isArray(v)) v.forEach((x, i) => parts.push(encodeURIComponent(k) + '%5B' + i + '%5D=' + encodeURIComponent(x)));
    else parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  }
  return parts.join('&');
}
function computeSign(params, secret) { return crypto.createHmac('sha256', secret).update(__buildQuery(params, __asortKeys(params))).digest('hex'); }

function createDesignerCallback(config) {
  const inputDir = path.resolve(config.inputDir);
  const base = config.callbackBaseUrl;   // 例如 http://127.0.0.1:8899

  function listImages() {
    if (!fs.existsSync(inputDir)) return [];
    return fs.readdirSync(inputDir).filter((f) => IMG_EXT.test(f)).sort()
      .map((f) => ({ file: f, code: f.replace(IMG_EXT, ''), name: f.replace(IMG_EXT, '') }));
  }
  function handleList(q) {
    const all = listImages();
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Math.max(1, Number(q.size) || 30));
    const total = all.length;
    const start = (page - 1) * size;
    const items = all.slice(start, start + size).map((it) => ({
      code: it.code, name: it.name, preview_img: base + '/files/' + it.file, design_img: base + '/files/' + it.file,
      size: { width: 300, height: 300 },
    }));
    return { statusCode: 200, body: { status: 200, code: 'success', msg: '成功', data: { current_page: page, per_page: size, total, data: items } } };
  }
  function handleOriginal(query, secret) {
    // 提取 ids（兼容 ids=A,B 或 ids[]=A）
    let ids = query.ids;
    if (Array.isArray(ids)) ids = ids.map(String);
    else if (typeof ids === 'string') ids = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (!Array.isArray(ids)) ids = [];
    const timestamp = String(query.timestamp || '');
    const providedSign = query.sign || '';
    const ok = providedSign && computeSign({ timestamp, ids }, secret) === providedSign;
    if (!ok) return { statusCode: 401, body: { status: 'fail', code: 401, msg: 'sign 校验失败', data: null } };
    const imgMap = {};
    for (const id of ids) {
      const f = listImages().find((it) => it.code === id);
      imgMap[id] = base + '/files/' + f.file;
    }
    return { statusCode: 200, body: { status: 'success', code: 200, msg: '请求成功', data: { img_map: imgMap } } };
  }
  function handleFile(name) {
    const safe = path.normalize(name).replace(/^([.][.][\\/])+/, '');
    const file = path.join(inputDir, safe);
    if (!file.startsWith(inputDir) || !fs.existsSync(file)) return null;
    const ext = path.extname(file).toLowerCase();
    return { file, mime: MIME[ext] || 'application/octet-stream' };
  }
  function handler(req, res) {
    const u = new URL(req.url, base);
    const p = u.pathname;
    if (p === '/gallery/list') { const r = handleList(Object.fromEntries(u.searchParams)); return send(res, r.statusCode, r.body); }
    if (p === '/gallery/original') { const r = handleOriginal(Object.fromEntries(u.searchParams), config.appSecret); return send(res, r.statusCode, r.body); }
    if (p.startsWith('/files/')) { const f = handleFile(p.slice(7)); if (f) { res.writeHead(200, { 'Content-Type': f.mime }); res.end(fs.readFileSync(f.file)); return; } return send(res, 404, { status: 'fail', code: 404, msg: '文件不存在' }); }
    return send(res, 404, { status: 'fail', code: 404, msg: 'not found' });
  }
  function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
  return { handler, computeSign, handleList, handleOriginal };
}

module.exports = { createDesignerCallback, computeSign };
