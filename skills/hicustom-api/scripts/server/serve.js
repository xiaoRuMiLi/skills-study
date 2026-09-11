'use strict';
/**
 * serve.js — 本地静态服务器（托管该技能的 output/ 目录）。
 * 用途：让 listing:generate 生成的 index.html / images / csv 可通过 http 链接访问。
 * 附加端点：
 *   /open?path=<相对路径>   在资源管理器中打开对应文件夹（方便查看本地产物）
 * 运行：node scripts/server/serve.js   （默认 8098）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { readFilledTable } = require('../app/Support/ListingTable');
// 加载 skill 根目录 .env（ZHIPU_API_KEY 等），供翻译/预览用（serve 不 bootstrap，需手动加载）
(function loadDotEnv() {
  const envFile = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();
const ROOT = path.join(__dirname, '..', '..', 'output');
// 可复用页面目录（与数据 output/ 分离）；.html 优先从这里取
const PAGES = process.env.HICUSTOM_PAGES_DIR || path.join(__dirname, '..', 'app', 'pages');
// skill 根目录（图案库 patterns/、输入图 input/ 的物理根）
const SKILL_ROOT = path.join(__dirname, '..', '..');
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

// 解析请求 → 物理文件：页面(.html/目录/根) 先查 PAGES 再回退 ROOT；其余（数据）只走 ROOT
function resolveFile(p) {
  const norm = path.normalize(p || '');
  const isRoot = (p === '/' || p === '');
  const isDir = /\/$/.test(p || '');
  const wantsPage = isRoot || isDir || /\.(html|js|css)$/i.test(p || '');
  const roots = wantsPage ? [PAGES, ROOT] : [ROOT];
  for (const base of roots) {
    let f = isRoot ? path.join(base, 'index.html') : path.join(base, norm);
    try {
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    } catch (e) { /* ignore */ }
  }
  return null;
}

// 缩略图缓存目录（放 output/ 下，已被 .gitignore 忽略）+ URL→物理文件
const THUMB_DIR = path.join(ROOT, '.thumbs');
try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch (e) { /* ignore */ }
function resolveAssetUrl(u) {
  const s = decodeURIComponent(String(u || '')).replace(/^\/+/, '').split('?')[0];
  if (!s) return null;
  for (const b of [SKILL_ROOT, ROOT, PAGES]) {
    const f = path.join(b, s);
    try { if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; } catch (e) { /* ignore */ }
  }
  return null;
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b || '')); });

// 业务容器（懒加载）：供 /api/* 调服务（product / zhipu / shipping / …）
let _APP = null;
function getApp() { if (!_APP) _APP = require('../core/bootstrap').bootstrap().app; return _APP; }

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

  // 指纹「空白商品」列表（最新在前，倒序翻页；每页 size 条，默认 60，上限 100）
  // 上游按 id 升序（旧→新）且无倒序参数，故这里从"最新"往前的窗口换算成上游升序区间，拉 1~2 页后反转。
  if (p === '/api/blank-products') {
    (async () => {
      try {
        const page = Math.max(1, Number(q.get('page') || 1));
        const size = Math.min(100, Math.max(1, Number(q.get('size') || 60)));
        const product = getApp().make('product');
        const first = await product.list({ page: 1, pageSize: size });
        if (first.status >= 400 || first.code !== 200) return json(res, 502, { ok: false, err: '上游失败 HTTP ' + first.status + ' ' + (first.msg || '') });
        const fd = first.data || {};
        const total = Number(fd.total || 0);
        const per = Number(fd.per_page || size);
        const lastPage = Math.max(1, Math.ceil(total / per));
        let items = [];
        // 最新在前：第 page 页 = 升序区间 [total-(page-1)*per-per, total-(page-1)*per-1]
        let endIdx = total - (page - 1) * per - 1;
        let startIdx = endIdx - per + 1;
        if (endIdx >= 0 && total > 0) {
          startIdx = Math.max(0, startIdx); endIdx = Math.min(total - 1, endIdx);
          const pStart = Math.floor(startIdx / per) + 1;
          const pEnd = Math.floor(endIdx / per) + 1;
          let all = [];
          for (let pg = pStart; pg <= pEnd; pg++) {
            const r = (pg === 1) ? first : await product.list({ page: pg, pageSize: size });
            if (r.status >= 400 || r.code !== 200) continue;
            all = all.concat((r.data && r.data.data) || []);
          }
          const baseIdx = (pStart - 1) * per;
          items = all.slice(startIdx - baseIdx, endIdx - baseIdx + 1).map((it) => ({
            id: it.id, cnName: it.cn_name || '', enName: it.en_name || '',
            categories: (it.categories || []).map((c) => c.id),
          })).sort((a, b) => Number(b.id) - Number(a.id));
        }
        // 标注「已设计」：products.csv 里 is_custom=1 或 composite_product_code 非空
        try {
          const { ProductRepository } = require('../app/Support/ProductRepository');
          const repo = new ProductRepository(getApp().make('config'));
          const dm = {};
          for (const r of repo.all()) {
            const isD = String(r.is_custom) === '1' || (r.composite_product_code && String(r.composite_product_code).trim() !== '');
            if (isD && dm[String(r.id)] == null) dm[String(r.id)] = { status: r.status || 'draft', compositeCode: r.composite_product_code || '' };
          }
          items = items.map((it) => dm[String(it.id)]
            ? Object.assign({}, it, { designed: true, status: dm[String(it.id)].status, compositeCode: dm[String(it.id)].compositeCode })
            : Object.assign({}, it, { designed: false }));
        } catch (e) { /* 标注失败不影响列表 */ }
        return json(res, 200, { ok: true, page, lastPage, total, size, items });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 单个空白商品详情（含主图渲染）：GET /api/blank-product?id=<id>
  if (p === '/api/blank-product') {
    (async () => {
      try {
        const id = q.get('id'); if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
        const product = getApp().make('product');
        const r = await product.detail(id);
        if (r.status >= 400 || r.code !== 200) return json(res, 502, { ok: false, err: '上游失败 HTTP ' + r.status + ' ' + (r.msg || '') });
        const d = r.data || {};
        const rinfo = (d.renderings_info && d.renderings_info[0] && (d.renderings_info[0].renderings || [])) || [];
        const pd = d.product_description || {};
        return json(res, 200, {
          ok: true,
          product: {
            id: d.id, cnName: d.cn_name || '', enName: d.en_name || '',
            colors: (d.colors || []).map((c) => c.cn_name || c.name),
            sizes: (d.sizes || []).map((s) => s.name),
            printAreas: pd.print_areas || [],
            image: rinfo[0] || d.image || '',
            style: pd.design_style || {}, material: pd.product_material || {},
          },
        });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // Listing 列表（读 database/listing.csv）：GET /api/listing/list
  if (p === '/api/listing/list') {
    try {
      const { ListingRepository } = require('../app/Support/ListingRepository');
      const { loadConfig } = require('../core/Config');
      const items = new ListingRepository(loadConfig()).all();
      return json(res, 200, { ok: true, items });
    } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
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
        try { const { render: renderAdmin } = require('../app/Support/AdminRenderer'); renderAdmin({ records: repo.products(), merchant: config.merchant, htmlDir: PAGES, htmlFile: 'manage.html' }); } catch (e) {}
        return json(res, 200, { ok: true, commit: true, productId: id, cookieRetried, variants: Object.keys(data.perVariant).length, perCountry: data.profileShipping });
      }
      if (!PENDING.get(String(id))) PENDING.set(String(id), data);
      return json(res, 200, { ok: true, commit: false, productId: id, cookieRetried, variants: Object.keys(data.perVariant).length, perCountry: data.profileShipping, perVariant: data.perVariant });
    })();
    return;
  }

  // 上架预览数据：GET /api/listing.json?id=X → 回填后的亚马逊原始模板 listing_filled.xlsm（上传文件）为唯一数据源
  if (p === '/api/listing.json') {
    const id = q.get('id');
    if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
    const dir = path.join(ROOT, String(id));
    let record = null;
    try { record = JSON.parse(fs.readFileSync(path.join(dir, 'listing', 'record.json'), 'utf8')); } catch (e) {}
    // 数据源 = 「回填后的亚马逊原始模板」listing_filled.xlsx（亚马逊只认 xlsx 工作簿，不认 xlsm）。source 标注实际读取文件，便于核对。
    let sheet = null, source = '', filled = [];
    try { const t = readFilledTable(path.join(dir, 'listing', 'listing_filled.xlsx')); if (t.filled.length) { sheet = t.row; filled = t.filled; source = 'listing_filled.xlsx（上传文件）'; } } catch (e) {}
    if (!sheet) { try { const t2 = readFilledTable(path.join(dir, 'listing', 'listing_filled.xlsm')); if (t2.filled.length) { sheet = t2.row; filled = t2.filled; source = 'listing_filled.xlsm（旧，请重跑）'; } } catch (e) {} }
    if (!sheet) { try { sheet = JSON.parse(fs.readFileSync(path.join(dir, 'listing', 'listing_upload.json'), 'utf8')); source = 'listing_upload.json（旧，请重跑）'; } catch (e) {} }
    const localImgs = [];
    const base = path.join(dir, 'images');
    const walk = (d) => { let items = []; try { items = fs.readdirSync(d); } catch (e) { return; } for (const it of items) { const f = path.join(d, it); let st; try { st = fs.statSync(f); } catch (e) { continue; } if (st.isDirectory()) walk(f); else if (/\.(jpe?g|png|webp)$/i.test(it)) localImgs.push('/' + String(id) + '/images/' + path.relative(base, f).replace(/\\/g, '/')); } };
    walk(base);
    const rank = (u) => (/main-amazon\.jpg$/.test(u) ? 0 : /main-1\.jpg$/.test(u) ? 1 : /other-\d+\.jpg$/.test(u) ? 2 : /design-/i.test(u) ? 4 : 3);
    localImgs.sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b));
    // 上架表格里的图片 URL（渲染唯一数据源）；有 sheet 就以 sheet 为准，绝不回退本地空白图
    let imgs = [];
    let main = '';
    if (sheet) {
      main = sheet['Main Image URL'] || '';
      imgs = [main].concat([1, 2, 3, 4, 5, 6, 7, 8].map((i) => sheet['Other Image URL ' + i] || '')).filter(Boolean);
    } else if (record) {
      main = record.main_image_url || '';
      imgs = [main].concat(record.other_image_urls || []).filter(Boolean);
    }
    return json(res, 200, { ok: true, id, sheet, source, filled, record, images: imgs, main, localImages: localImgs });
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
        const { ZhipuClient } = require('../app/Services/ZhipuClient');
        const cfgPath = path.join(__dirname, '..', '..', 'config', 'hicustom.json');
        const cfg = fs.existsSync(cfgPath) ? require(cfgPath) : {};
        const zc = new ZhipuClient({ zhipu: cfg.zhipu || {}, zhipuApiKey: process.env.ZHIPU_API_KEY || '' });
        const record = JSON.parse(fs.readFileSync(recFile, 'utf8'));
        const translation = await translateRecord(record, zc);
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

  // 缩略图：GET /api/thumb?src=<url>&w=160  → 生成并缓存小图（sharp），网格只加载小图
  if (p === '/api/thumb') {
    (async () => {
      try {
        const src = q.get('src'); const w = Math.max(32, Math.min(640, Number(q.get('w')) || 160));
        if (!src) return json(res, 400, { ok: false, err: '缺少 src' });
        const fp = resolveAssetUrl(src);
        if (!fp) return json(res, 404, { ok: false, err: '源图不存在: ' + src });
        const crypto = require('crypto');
        let mt = 0; try { mt = fs.statSync(fp).mtimeMs; } catch (e) { /* ignore */ }
        const h = crypto.createHash('md5').update(fp + '|' + w + '|' + mt).digest('hex');
        const out = path.join(THUMB_DIR, h + '.jpg');
        if (!fs.existsSync(out)) {
          const sharp = require('../tools/node_modules/sharp');
          await sharp(fp, { limitInputPixels: false }).resize(w, w, { fit: 'inside' }).jpeg({ quality: 78 }).toFile(out);
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
        fs.createReadStream(out).pipe(res);
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 图案图源候选：GET /api/patterns?page=&size=  → { items:[{name,url,thumb}], page, size, total, pages }
  // 服务端分页（默认 48/页）+ 每项带缩略图（网格只加载小图，点选后才用原图）
  if (p === '/api/patterns') {
    try {
      const page = Math.max(1, Number(q.get('page')) || 1);
      const size = Math.max(1, Math.min(200, Number(q.get('size')) || 48));
      const all = [];
      const addDir = (dir, namePrefix, urlPrefix) => {
        try {
          for (const f of fs.readdirSync(dir)) {
            if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
            let mt = 0; try { mt = fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { /* ignore */ }
            const url = urlPrefix + encodeURIComponent(f);
            all.push({ name: namePrefix + f, url: url, thumb: '/api/thumb?src=' + encodeURIComponent(url) + '&w=160', _mt: mt });
          }
        } catch (e) { /* skip */ }
      };
      addDir(path.join(SKILL_ROOT, 'patterns'), '', '/patterns/');
      try {
        for (const sub of fs.readdirSync(path.join(SKILL_ROOT, 'input'))) {
          const d = path.join(SKILL_ROOT, 'input', sub);
          if (fs.statSync(d).isDirectory()) addDir(d, sub + '/', '/input/' + encodeURIComponent(sub) + '/');
        }
      } catch (e) { /* no input */ }
      all.sort((a, b) => b._mt - a._mt);                     // 新图在前
      const total = all.length, pages = Math.max(1, Math.ceil(total / size));
      const pg = Math.min(page, pages), start = (pg - 1) * size;
      const items = all.slice(start, start + size).map((x) => ({ name: x.name, url: x.url, thumb: x.thumb }));
      return json(res, 200, { ok: true, items: items, page: pg, size: size, total: total, pages: pages });
    } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
  }

  // AI 图案提示词（由商品信息合成，供页面预填/可改）：GET /api/pattern/prompt?id=<id>
  if (p === '/api/pattern/prompt') {
    (async () => {
      try {
        const id = q.get('id'); if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
        const product = getApp().make('product');
        const r = await product.detail(id);
        if (r.status >= 400 || r.code !== 200) return json(res, 502, { ok: false, err: '上游失败 HTTP ' + r.status });
        const { ZhipuService } = require('../app/Services/ZhipuService');
        const d = r.data || {}; const pd = d.product_description || {};
        const f = (pd.print_areas && pd.print_areas[0]) || { width: 1024, height: 1024 };
        return json(res, 200, { ok: true, cnName: d.cn_name || '', prompt: ZhipuService.buildImagePrompt(d), size: ZhipuService.pickSize(f.width, f.height), printAreas: pd.print_areas || [] });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // AI 生成图案（异步）：POST /api/pattern/generate { productId, prompt? } → { jobId }
  if (p === '/api/pattern/generate' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      const id = body.productId; if (!id) return json(res, 400, { ok: false, err: '缺少 productId' });
      const { JobStore } = require('../app/Support/JobStore');
      const js = new JobStore(require('../core/Config').loadConfig());
      const jobId = 'pat_' + id + '_' + Date.now();
      js.create(jobId, 'pattern', { productId: id, prompt: body.prompt || '' });
      js.update(jobId, { status: 'running' });
      const app = getApp();
      (async () => {
        try {
          js.log(jobId, '开始生成图案…');
          const pat = app.make('pattern');
          const out = await pat.generate({ productId: id, prompt: body.prompt, log: (l) => js.log(jobId, l) });
          const url = '/input/' + encodeURIComponent(id) + '/' + encodeURIComponent(path.basename(out.file));
          js.update(jobId, { status: 'done', result: { file: out.file, url, prompt: out.prompt, size: out.size } });
          js.log(jobId, '完成 → ' + path.basename(out.file));
        } catch (e) { js.update(jobId, { status: 'error', result: { err: e.message } }); js.log(jobId, '出错: ' + e.message); }
      })();
      return json(res, 200, { ok: true, jobId });
    })();
    return;
  }

  // 统一「AI 协作」网关：POST /api/ai/run { type, payload } → { ok, type, result }
  //   页面任何需要「动脑」的地方（改提示词/出方案/问答…）都走这里；
  //   今天网关用本机 LLM（glm-4），将来可把某些 type 转给 OpenClaw agent，接口不变。
  if (p === '/api/ai/run' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      const type = body.type; if (!type) return json(res, 400, { ok: false, err: '缺少 type' });
      try {
        const assist = getApp().make('aiAssist');
        const result = await assist.dispatch(type, body.payload || {});
        return json(res, 200, { ok: true, type, result });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 叠字工作台：默认配置（供页面预填）GET /api/stamp/config
  if (p === '/api/stamp/config') {
    try { return json(res, 200, { ok: true, config: getApp().make('stampStudio').getConfig() }); }
    catch (e) { return json(res, 500, { ok: false, err: e.message }); }
  }

  // 排版样稿列表：GET /api/stamp/samples → { samples:[名(去扩展名)] }
  if (p === '/api/stamp/samples') {
    try {
      const { listSamples } = require('../app/Support/TypeSetting');
      const files = listSamples(getApp().make('config').typeSettingDir);
      return json(res, 200, { ok: true, samples: files.map((f) => f.replace(/\.[^.]+$/, '')) });
    } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
  }

  // 叠字渲染（本地，零 API）：POST /api/stamp { id, src, lines, block, background, name?, save? }
  if (p === '/api/stamp' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      try {
        const out = await getApp().make('stampStudio').render(body || {});
        return json(res, 200, { ok: true, url: out.url, saved: out.saved, meta: out.meta });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 自动配色（本地）：POST /api/stamp/colors { src, n }
  if (p === '/api/stamp/colors' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      try {
        const out = await getApp().make('stampStudio').colors(body || {});
        return json(res, 200, { ok: true, colors: out.colors });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 成品列表（edited/<id>/）：GET /api/edited/list?id=<id>
  if (p === '/api/edited/list') {
    try {
      const id = String(q.get('id') || '');
      const dir = path.join(SKILL_ROOT, 'edited', id);
      let items = [];
      if (id && fs.existsSync(dir)) {
        items = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => {
          const full = path.join(dir, f);
          let mtime = 0; try { mtime = fs.statSync(full).mtimeMs; } catch (e) {}
          return { name: f, url: '/edited/' + encodeURIComponent(id) + '/' + encodeURIComponent(f), mtime };
        }).sort((a, b) => b.mtime - a.mtime);
      }
      return json(res, 200, { ok: true, items });
    } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
  }

  // 跑流程（入队，异步）：POST /api/flow/run { flow, params } → { jobId }
  if (p === '/api/flow/run' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      try {
        const jobId = getApp().make('flowRunner').enqueue(body.flow || 'workflow', body.params || {});
        return json(res, 200, { ok: true, jobId });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 任务列表：GET /api/flow/list[?flow=workflow] → { jobs:[...] }
  if (p === '/api/flow/list') {
    try {
      const flow = q.get('flow') || '';
      let jobs = getApp().make('flowRunner').list();
      if (flow) jobs = jobs.filter((j) => j.flow === flow);
      return json(res, 200, { ok: true, jobs });
    } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
  }

  // 取消排队任务：POST /api/flow/cancel { id }
  if (p === '/api/flow/cancel' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      try { const r = getApp().make('flowRunner').cancel(body.id); return json(res, r.ok ? 200 : 400, Object.assign({ ok: r.ok }, r)); }
      catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 清理已完成/失败任务：POST /api/flow/clear { flow?, statuses? }
  if (p === '/api/flow/clear' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      try { return json(res, 200, getApp().make('flowRunner').clear(body || {})); }
      catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 图案适配到目标尺寸：POST /api/image/fit { productId, src, targetW, targetH, fit }
  if (p === '/api/image/fit' && req.method === 'POST') {
    (async () => {
      let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return json(res, 400, { ok: false, err: 'body 解析失败' }); }
      try {
        const { productId, src, targetW, targetH, fit } = body;
        const tw = Math.max(1, Math.round(Number(targetW) || 0)), th = Math.max(1, Math.round(Number(targetH) || 0));
        if (!tw || !th) return json(res, 400, { ok: false, err: '缺少 targetW/targetH' });
        const image = require('../tools/image');
        const config = getApp().make('config');
        // 解析源图（URL 或路径；URL 可能含中文 → 需 decodeURIComponent）
        let inFile = String(src || '').split('?')[0];
        if (!(inFile && fs.existsSync(inFile))) {
          let rel = String(src || '').replace(/^\/+/, '').split('?')[0];
          try { rel = decodeURIComponent(rel); } catch (e) { /* 用原样 */ }
          for (const b of [SKILL_ROOT, config.outputDir, config.inputDir, config.editedDir]) {
            const f = path.join(b, rel); if (fs.existsSync(f)) { inFile = f; break; }
          }
        }
        if (!inFile || !fs.existsSync(inFile)) return json(res, 400, { ok: false, err: '找不到源图: ' + src });
        const buf = await image.fitImage({ input: inFile, targetW: tw, targetH: th, fit: (fit === 'contain' ? 'contain' : 'cover') });
        const dir = path.join(config.inputDir, String(productId || 'misc'));
        fs.mkdirSync(dir, { recursive: true });
        const base = path.basename(inFile, path.extname(inFile)).replace(/[\\/:*?"<>|]+/g, '_');
        const outFile = path.join(dir, base + '_fitspec.jpg');
        image.save(buf, outFile);
        const meta = await image.dims(outFile);
        return json(res, 200, { ok: true, url: '/input/' + encodeURIComponent(String(productId || 'misc')) + '/' + encodeURIComponent(path.basename(outFile)), w: meta.width, h: meta.height, file: outFile });
      } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
    })();
    return;
  }

  // 异步任务状态：GET /api/flow/status?id=<jobId>
  if (p === '/api/flow/status') {
    try {
      const id = q.get('id'); if (!id) return json(res, 400, { ok: false, err: '缺少 id' });
      const { JobStore } = require('../app/Support/JobStore');
      const job = new JobStore(require('../core/Config').loadConfig()).get(id);
      if (!job) return json(res, 404, { ok: false, err: 'job 不存在' });
      return json(res, 200, { ok: true, job });
    } catch (e) { return json(res, 500, { ok: false, err: e.message }); }
  }

  // 素材直通：/patterns/*、/input/*、/edited/*（skill 根下的图源/产物）
  const mm = p.match(/^\/(patterns|input|edited)\/(.+)$/);
  if (mm) {
    const baseDir = path.join(SKILL_ROOT, mm[1]);
    const fp = path.join(baseDir, decodeURIComponent(mm[2]));
    if (!fp.startsWith(baseDir) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
    return;
  }

  // 页面(.html)优先从 PAGES 取，未命中回退 output/；其余（api/images/json/csv）一律走 output/
  const file = resolveFile(p);
  if (!file) { res.writeHead(404); res.end('not found: ' + p); return; }
  if (!file.startsWith(ROOT) && !file.startsWith(PAGES)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // 静态 HTML/JSON/CSV 禁止缓存，避免数据更新后页面不刷新
    if (ext === '.html' || ext === '.json' || ext === '.csv') headers['Cache-Control'] = 'no-store';
    let out = buf;
    if (ext === '.html') {
      // 自动注入通用顶部导航（页面自带 header 时 _nav.js 会自动跳过）
      let html = buf.toString('utf8');
      if (!/\/_nav\.js/.test(html)) {
        html = html.includes('</body>') ? html.replace('</body>', '<script src="/_nav.js"></script></body>') : (html + '<script src="/_nav.js"></script>');
      }
      out = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, headers);
    res.end(out);
  });
}).listen(PORT, '127.0.0.1', () => console.log('✅ listing 输出服务器: http://127.0.0.1:' + PORT + '/<productId>/ | /open 可打开文件夹'));
