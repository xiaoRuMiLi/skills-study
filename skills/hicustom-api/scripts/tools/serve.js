'use strict';
/**
 * serve.js — 本地静态服务器（托管该技能的 output/ 目录）。
 * 用途：让 listing:generate 生成的 index.html / images / csv 可通过 http 链接访问。
 * 附加端点：
 *   /open?path=<相对路径>   在资源管理器中打开对应文件夹（方便查看本地产物）
 * 运行：node scripts/tools/serve.js   （默认 8098）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ROOT = path.join(__dirname, '..', '..', 'output');
const PORT = Number(process.env.HICUSTOM_SERVE_PORT || 8098);
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
fs.mkdirSync(ROOT, { recursive: true });

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(u.pathname);
  const q = u.searchParams;

  // JSON API：返回 products.csv 全部商品（按商品归并成 products[]，含 specs + detail），供前端渲染
  if (p === '/api/products.json') {
    const { ProductRepository } = require('../app/Support/ProductRepository');
    const { loadConfig } = require('../core/Config');
    const repo = new ProductRepository(loadConfig());
    const products = repo.products().map((g) => {
      const profile = (g.detail && g.detail.profile) || {};
      return {
        id: g.id, spu: g.spu, name: g.name, enName: g.enName, minPrice: g.minPrice,
        galleryCodes: g.galleryCodes, compositeCode: g.compositeCode, effectCount: g.effectCount,
        status: g.status, material: g.material, variantsCount: (profile.variants && profile.variants.length) || 0,
        designFaces: profile.designFaces || [], colors: (profile.colors || []).map((c) => c.cnName).join('/'),
        sizes: (profile.sizes || []).map((s) => s.name).join('/'), specs: g.specs, detail: g.detail,
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, products }));
    return;
  }

  // 打开文件夹
  if (p === '/open') {
    const rel = q.get('path') || '';
    const abs = path.join(ROOT, path.normalize(rel));
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) exec('explorer "' + abs + '"');
      else exec('explorer /select,"' + abs + '"');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: abs }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, err: e.message })); }
    return;
  }

  let file = path.join(ROOT, path.normalize(p));
  if (p === '/' || p === '') file = path.join(ROOT, 'index.html');
  // 目录请求自动落到 index.html
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) {}
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('✅ listing 输出服务器: http://127.0.0.1:' + PORT + '/<productId>/ | /open 可打开文件夹'));
