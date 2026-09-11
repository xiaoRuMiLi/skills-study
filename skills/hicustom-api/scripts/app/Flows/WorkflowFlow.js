'use strict';
/**
 * WorkflowFlow — 「跑 Workflow」编排（命令与网页共用，flows.md 落地）。
 * 5 步：抓空白产品详情 → 处理图(fit 印刷区) → 上传图库 → design:composite 合成 → 下效果图+缓存+入库。
 * 用法：
 *   const res = await new WorkflowFlow(app).run({ productId, images, fit, dryRun, onStep, log });
 *   onStep(name, status) 报进度；log(line) 记日志。
 */
const fs = require('fs');
const path = require('path');
const { parseProduct, defaultFace } = require('../Support/ProductProfile');
const { writeCsv } = require('../Support/CsvReport');
const { render } = require('../Support/ListingRenderer');
const { render: renderAdmin } = require('../Support/AdminRenderer');
const image = require('../../tools/image');

const STEPS = ['抓产品详情', '处理图片', '上传图库', '合成定制产品', '缓存/入库'];

function sanitizeDirName(s) {
  return String(s == null ? '默认' : s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').trim() || '默认';
}
function parseImageSpecs(str) {
  if (!str) return [];
  return str.split(',').map((t) => {
    t = t.trim();
    let src = t, viewStr = '';
    const m = t.match(/^(.*?)(?::(\d+|all|\*))$/i);
    if (m) { src = m[1].trim(); viewStr = m[2]; }
    let views = [];
    if (!viewStr) views = ['all'];
    else viewStr.split(/[,; ]+/).forEach((v) => { if (['all', '*'].includes(v)) views.push('all'); else views.push(Number(v)); });
    return { src, views };
  });
}
function faceByView(profile, view) {
  const faces = profile.designFaces || [];
  if (!faces.length) return { id: view, name: '面' + view, width: 1000, height: 1000 };
  return faces.find((f) => f.id === view) || { id: view, name: '面' + view, width: (faces[0] && faces[0].width) || 1000, height: (faces[0] && faces[0].height) || 1000 };
}
function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }

/** 输入可以是物理路径、相对路径或 URL（/edited/…、/input/…、/patterns/…、/<id>/…）→ 解析成物理文件路径 */
function resolveInput(src, config) {
  const s = String(src || '');
  try { if (s && fs.existsSync(s) && fs.statSync(s).isFile()) return s; } catch (e) { /* ignore */ }
  let rel = s.replace(/^\/+/, '').split('?')[0];
  try { rel = decodeURIComponent(rel); } catch (e) { /* 用原样 */ }
  const SKILL = path.join(__dirname, '..', '..', '..');
  for (const b of [SKILL, config.outputDir, config.inputDir, config.editedDir]) {
    if (!b) continue;
    const f = path.join(b, rel);
    try { if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; } catch (e) { /* ignore */ }
  }
  return s;
}

class WorkflowFlow {
  constructor(app) { this.app = app; }

  async run(params = {}) {
    const { productId, images, fit, dryRun, defaultColorId, defaultViewId, externalId, externalCustomerId, allColors } = params;
    const app = this.app;
    const product = app.make('product');
    const gallery = app.make('gallery');
    const design = app.make('design');
    const config = app.make('config');
    const onStep = typeof params.onStep === 'function' ? params.onStep : () => {};
    const log = typeof params.log === 'function' ? params.log : () => {};
    const dry = !!dryRun;
    const fitMode = fit || 'cover';

    if (!productId) throw new Error('缺少 productId');

    // ① 抓空白产品详情
    onStep('抓产品详情', 'running');
    const r = await product.detail(productId);
    if (!r || r.status >= 400 || r.code !== 200) throw new Error('详情接口失败: HTTP ' + (r && r.status) + ' ' + (r && r.msg || ''));
    const profile = parseProduct(r.data);
    const faces = profile.designFaces;
    log('产品 ' + productId + ' ' + (profile.identity.cnName || '') + (dry ? '  [DRY-RUN]' : ''));
    onStep('抓产品详情', 'done');

    // ② 处理客户图 → 印刷区尺寸
    onStep('处理图片', 'running');
    const outDir = path.join(config.outputDir, String(productId));
    const imgDir = path.join(outDir, 'images');
    const specs = parseImageSpecs(images);
    const processed = [];
    const ext = externalId || String(Date.now());
    const extCust = externalCustomerId || '';
    for (const spec of specs) {
      const srcFile = resolveInput(spec.src, config);
      let targetFace;
      if (spec.views.includes('all')) targetFace = defaultFace(profile);
      else targetFace = faceByView(profile, spec.views.find((v) => v !== 'all') || 1);
      for (const v of spec.views) { if (v !== 'all') { const f = faceByView(profile, v); if (f.width * f.height > targetFace.width * targetFace.height) targetFace = f; } }
      const width = targetFace.width, height = targetFace.height;
      try {
        const buf = await image.fitImage({ input: srcFile, targetW: width, targetH: height, fit: fitMode });
        const file = path.join(imgDir, 'design-' + (spec.views.includes('all') ? 'all' : spec.views.join('-')) + '.jpg');
        image.save(buf, file);
        processed.push({ src: srcFile, views: spec.views, file, width, height });
        log('✅ 处理图片 → ' + path.basename(file) + ' (' + width + 'x' + height + ', ' + fitMode + ')');
      } catch (e) { log('❌ 处理图片失败 ' + spec.src + ': ' + e.message); }
    }
    if (!processed.length) log('⚠️ 无图片可处理（仅抓取+报表）。');
    // 归档原稿
    try {
      const { archiveOriginal } = require('../Support/OriginalArchive');
      const srcSet = [...new Set(specs.map((s) => resolveInput(s.src, config)).filter((s) => s && fs.existsSync(s)))];
      if (srcSet.length) { const arch = archiveOriginal({ productId, outputDir: config.outputDir, items: srcSet.map((s) => ({ src: s })) }); log('🗂️ 图案原稿已归档: ' + arch.dir + (arch.files.length ? ' (' + arch.files.join(', ') + ')' : '')); }
    } catch (e) { log('⚠️ 原稿归档异常: ' + e.message); }
    onStep('处理图片', 'done');

    const customization = { galleryCodes: {}, compositeProductCode: '', effectImages: [], effectImageCount: 0, dry };

    // ③ 上传图库
    onStep('上传图库', 'running');
    if (!dry) {
      for (const p of processed) {
        try {
          const up = await gallery.upload({ image: p.file, cn_name: 'listing-' + productId, en_name: 'listing-' + productId, external_id: ext });
          if (up.status >= 400 || up.code !== 200) { log('❌ 上传图库失败 ' + p.file + ': ' + (up.msg || '')); continue; }
          const code = up.data && up.data.code;
          log('✅ 上传图库 → ' + code);
          for (const v of p.views) customization.galleryCodes[v === 'all' ? 'all' : v] = code;
        } catch (e) { log('❌ 上传图库异常 ' + p.file + ': ' + e.message); }
      }
    } else { log('[dry-run] 跳过上传图库。'); }
    onStep('上传图库', 'done');

    // ④ 自动合成
    onStep('合成定制产品', 'running');
    if (!dry && Object.keys(customization.galleryCodes).length) {
      const cfgs = []; const seen = new Set();
      for (const [v, code] of Object.entries(customization.galleryCodes)) {
        const viewId = v === 'all' ? 1 : Number(v);
        if (seen.has(viewId)) continue; seen.add(viewId);
        const f = faceByView(profile, viewId);
        cfgs.push({ view_id: viewId, gallery_code: code, width: f.width, height: f.height, top_x: 0, top_y: 0 });
      }
      if (customization.galleryCodes.all) {
        const firstCode = customization.galleryCodes.all;
        for (const face of faces) { if (!seen.has(face.id)) { seen.add(face.id); cfgs.push({ view_id: face.id, gallery_code: firstCode, width: face.width, height: face.height, top_x: 0, top_y: 0 }); } }
      }
      log('合成 cfgs: ' + JSON.stringify(cfgs));
      try {
        const cr = await design.composite({ productTypeId: productId, defaultColorId, defaultViewId, externalId: ext, externalCustomerId: extCust, cfgs });
        if (cr.status >= 400 || cr.code !== 200) { log('❌ 合成失败: HTTP ' + cr.status + ' ' + (cr.msg || '')); }
        else {
          const d = cr.data || {};
          customization.compositeProductCode = d.code;
          const allGroups = (d.colors || []).map((c) => ({ name: c.cn_name || '默认', images: (c.renderings || []).map((rr) => rr.big_img || rr.small_img).filter(Boolean) }));
          // 默认只取「主色」(colors[0])；效果图**只记 URL、不下载本地**（亚马逊上架用指纹 CDN URL 即可）
          const groups = allColors ? allGroups : allGroups.slice(0, 1);
          customization.colorsTotal = allGroups.length;
          customization.effectGroups = groups;
          customization.effectImages = [].concat(...groups.map((g) => g.images));
          customization.effectImageCount = customization.effectImages.length;
          customization.mainImage = customization.effectImages[0] || '';
          customization.otherImages = customization.effectImages.slice(1);
          log('✅ 合成成功 定制产品: ' + d.code + ' | 颜色 ' + allGroups.length + (allColors ? '（全部）' : '（只取主色）') + ' | 效果图 URL ' + customization.effectImageCount + ' 个（不下载本地）');
        }
      } catch (e) { log('❌ 合成异常: ' + e.message); }
    } else if (dry) {
      const plan = processed.map((p) => (p.views.includes('all') ? '全部面' : '面' + p.views.join(',')) + ' ← ' + path.basename(p.file));
      log('[dry-run] 跳过自动合成。投放计划: ' + (plan.join('  |  ') || '（无图）'));
    }
    onStep('合成定制产品', 'done');

    // 效果图**只记 URL、不下载本地**（亚马逊上架用指纹 CDN URL 即可；下载 100+ 张会压上游/占盘）
    if (customization.effectImages && customization.effectImages.length) {
      log('🔗 效果图 URL 已记录 ' + customization.effectImages.length + ' 个（主图取第 1 个）');
    }

    // ⑤ 缓存 + CSV + HTML
    onStep('缓存/入库', 'running');
    const jsonFile = path.join(outDir, 'product.json');
    writeJson(jsonFile, { raw: r.data, profile, customization });
    const csvFile = writeCsv(path.join(outDir, 'product.csv'), profile, customization, { generatedAt: new Date().toLocaleString() });

    const me = config.merchant || {};
    const links = [];
    if (me.productEdit) links.push({ label: '✏️ 编辑当前空白商品', url: String(me.productEdit).replace('{id}', productId), kind: 'product' });
    if (me.customerProductList) links.push({ label: '📦 我的定制商品列表', url: me.customerProductList, kind: 'list' });
    const htmlFile = render({ profile, customization, options: { title: profile.identity.cnName + ' — 产品信息', sections: undefined, links, dir: String(productId) }, htmlDir: path.join(config.pagesDir, String(productId)) });

    // ⑥ 登记 CSV 数据库 + 刷新后台
    const repo = app.make('productRepo');
    const shared = {
      spu_code: profile.identity.spuCode, cn_name: profile.identity.cnName, en_name: profile.identity.enName,
      factory: profile.identity.factory, material: profile.attributes.materialCn, min_price: profile.pricing.minPrice,
      design_face_w: defaultFace(profile).width, design_face_h: defaultFace(profile).height,
      gallery_codes: Object.values(customization.galleryCodes || {}).join('|'),
      composite_product_code: customization.compositeProductCode || '', effect_image_count: customization.effectImageCount || 0,
      is_custom: '1', main_image: customization.mainImage || '', other_images: (customization.otherImages || []).join('|'),
      status: dry ? 'draft' : 'synced', notes: dry ? 'DRY-RUN' : '',
    };
    const specRows = repo.upsertProduct(String(productId), shared, profile.specs, JSON.stringify({ profile, customization }));
    const adminFile = renderAdmin({ records: repo.products(), merchant: config.merchant, htmlDir: config.pagesDir, htmlFile: 'manage.html' });
    log('✅ 已缓存到 ' + outDir);
    log('📊 管理后台已刷新' + (dry ? '（dry-run 状态=draft）' : ''));
    onStep('缓存/入库', 'done');

    return {
      productId, dryRun: dry,
      cnName: profile.identity.cnName || '',
      compositeProductCode: customization.compositeProductCode || '',
      effectImageCount: customization.effectImageCount || 0,
      galleryCodes: Object.values(customization.galleryCodes || {}).filter(Boolean),
      specRows: specRows || 0,
      productUrl: '/product.html?id=' + productId,
      adminUrl: '/manage.html',
    };
  }
}

module.exports = { WorkflowFlow, STEPS };
