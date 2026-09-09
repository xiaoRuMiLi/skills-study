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

const CN = { US: 'US', UK: 'UK', CA: 'CA', DE: 'DE', MX: 'MX', FR: 'FR', ES: 'ES', IT: 'IT' };
const SHIP_COUNTRIES = [
  { c: 'US', pc: '10001' }, { c: 'UK', pc: 'SW1A1AA' }, { c: 'CA', pc: 'M5V 2T6' },
  { c: 'DE', pc: '10115' }, { c: 'FR', pc: '75001' }, { c: 'ES', pc: '28001' },
  { c: 'IT', pc: '00184' }, { c: 'MX', pc: '01000' },
];
const PENDING = new Map(); // id -> { perVariant, profileShipping }  预览缓存，避免预览+保存重复试算

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b || '')); });

// 单个商品：每规格 × 8 国 试算 → perVariant(CSV金额) + profileShipping(各国优选 rich，物流商偏好)
async function computeProductShipping(shipping, g, qty = 1) {
  const perVariant = {};
  const profileShipping = {};
  let rep = true;
  for (const spec of g.specs) {
    const L = Number(spec.package && spec.package.L), W = Number(spec.package && spec.package.W), H = Number(spec.package && spec.package.H);
    const wt = Number(spec.weight);
    if (!L || !W || !H || !wt) continue;
    const row = {};
    for (const cy of SHIP_COUNTRIES) {
      const rows = await shipping.quote({ country: cy.c, postcode: cy.pc, weight: wt, length: L, width: W, height: H, qty });
      const rec = shipping.selectChannel(rows, { country: cy.c });
      row[cy.c] = rec ? Math.round(rec.amount * 100) / 100 : null;
      if (rep) profileShipping[cy.c] = shipping.selectTopN(rows, { country: cy.c, n: 2, preferProviders: true });
    }
    rep = false;
    perVariant[String(spec.variantId)] = row;
  }
  return { perVariant, profileShipping };
}

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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, products }));
    return;
  }

  // 物流算价：POST /api/shipping/calc  body { id, commit }
  // commit=false → 预览（缓存到 PENDING，不写库）；commit=true → 写库(CSV + profile.shipping) + 刷新后台
  if (p === '/api/shipping/calc' && req.method === 'POST') {
    (async () => {
      let q;
      try { q = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      const id = q.id, commit = !!q.commit, qty = Number(q.qty || 1);
      if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
      const { ProductRepository } = require('../app/Support/ProductRepository');
      const { loadConfig } = require('../core/Config');
      const { ShippingService } = require('../app/Services/ShippingService');
      let config = loadConfig();
      let repo = new ProductRepository(config);
      let shipping = new ShippingService(config);
      const g = repo.products().find((x) => String(x.id) === String(id));
      if (!g) return json(res, 404, { ok: false, err: '未找到商品 ' + id });

      const COOKIE = new Set(['NO_COOKIE', 'COOKIE_EXPIRED']);
      const compute = () => computeProductShipping(shipping, g, qty);
      let data, cookieRetried = false;
      try {
        data = PENDING.get(String(id)) || await compute();
      } catch (e) {
        if (COOKIE.has(e.code)) {
          try {
            // cookie 失效 → 自动从登录浏览器刷新 .env 后重试一次
            const { refreshMerchantCookie } = require('../app/Support/MerchantCookie');
            await refreshMerchantCookie();
            delete process.env.HICUSTOM_MERCHANT_COOKIE; // 清掉缓存，强制 loadConfig 重读 .env 的新 cookie
            config = loadConfig(); repo = new ProductRepository(config); shipping = new ShippingService(config);
            cookieRetried = true;
            data = PENDING.get(String(id)) || await compute();
          } catch (e2) {
            return json(res, 500, { ok: false, err: '尝试自动刷新 cookie 仍失败：' + (e2.message || e.message), code: e.code || 'COOKIE_EXPIRED', cookieRetried: true });
          }
        } else { return json(res, 500, { ok: false, err: e.message, code: e.code || 'ERR' }); }
      }

      if (commit) {
        PENDING.delete(String(id));
        repo.setShipping(String(id), data.perVariant);
        repo.setDetailShipping(String(id), data.profileShipping);
        try { const { render: renderAdmin } = require('../app/Support/AdminRenderer'); renderAdmin({ records: repo.products(), merchant: config.merchant, htmlDir: config.outputDir, htmlFile: 'manage.html' }); } catch (e) {}
        return json(res, 200, { ok: true, commit: true, productId: id, cookieRetried, variants: Object.keys(data.perVariant).length, perCountry: data.profileShipping });
      }
      if (!PENDING.get(String(id))) PENDING.set(String(id), data);
      return json(res, 200, { ok: true, commit: false, productId: id, cookieRetried, variants: Object.keys(data.perVariant).length, perCountry: data.profileShipping, perVariant: data.perVariant });
    })();
    return;
  }

  // 上架预览数据：GET /api/listing.json?id=X → 该商品的 listing record + 本地 images 列表
  if (p === '/api/listing.json') {
    const id = q.get('id');
    if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
    const dir = path.join(ROOT, String(id));
    let record = null;
    try { record = JSON.parse(fs.readFileSync(path.join(dir, 'listing', 'record.json'), 'utf8')); } catch (e) {}
    const imgs = [];
    const base = path.join(dir, 'images');
    const walk = (d) => { let items = []; try { items = fs.readdirSync(d); } catch (e) { return; } for (const it of items) { const f = path.join(d, it); let st; try { st = fs.statSync(f); } catch (e) { continue; } if (st.isDirectory()) walk(f); else if (/\.(jpe?g|png|webp)$/i.test(it)) imgs.push('/' + String(id) + '/images/' + path.relative(base, f).replace(/\\/g, '/')); } };
    walk(base);
    // 无论有无 record，都返回本地图列表（product.html 用它）；record 可空
    const rank = (u) => (/main-amazon\.jpg$/.test(u) ? 0 : /main-1\.jpg$/.test(u) ? 1 : /other-\d+\.jpg$/.test(u) ? 2 : /design-/i.test(u) ? 4 : 3);
    imgs.sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b));
    const main = imgs.filter((u) => /main-amazon\.jpg$/.test(u))[0] || imgs.filter((u) => /main-1\.jpg$/.test(u))[0] || imgs[0] || '';
    return json(res, 200, { ok: true, id, record, images: imgs, main });
    return json(res, 200, { ok: true, id, record, images: imgs, main });
  }

  // 中文翻译（审阅用）：GET /api/listing/translate?id=X [&force=1] → 读/生成 translation.json
  if (p === '/api/listing/translate') {
    const id = q.get('id');
    if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
    const transFile = path.join(ROOT, String(id), 'listing', 'translation.json');
    if (!q.get('force') && fs.existsSync(transFile)) { try { return json(res, 200, { ok: true, id, translation: JSON.parse(fs.readFileSync(transFile, 'utf8')) }); } catch (e) {} }
    const recFile = path.join(ROOT, String(id), 'listing', 'record.json');
    if (!fs.existsSync(recFile)) return json(res, 404, { ok: false, err: '未找到 listing record' });
    (async () => {
      try {
        const { translateRecord } = require('../app/Services/ListingTranslation');
        const record = JSON.parse(fs.readFileSync(recFile, 'utf8'));
        const translation = await translateRecord(record);
        fs.mkdirSync(path.dirname(transFile), { recursive: true });
        fs.writeFileSync(transFile, JSON.stringify(translation, null, 2), 'utf8');
        return json(res, 200, { ok: true, id, translation, cached: false });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
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
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // 静态 HTML/JSON/CSV 禁止缓存，避免数据更新后页面不刷新
    if (ext === '.html' || ext === '.json' || ext === '.csv') headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(buf);
  });
}).listen(PORT, () => console.log('✅ listing 输出服务器: http://127.0.0.1:' + PORT + '/<productId>/ | /open 可打开文件夹'));
