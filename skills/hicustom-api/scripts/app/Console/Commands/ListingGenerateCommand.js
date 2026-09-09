'use strict';
const fs = require('fs');
/**
 * ListingGenerateCommand — listing:generate（总编排，一条龙）。
 * ① 抓空白产品详情（product:detail）→ 产品画像
 * ② 处理客户图 → 符合印刷区尺寸（sharp，在 scripts/tools/）
 * ③ （非 dry-run）上传图库 gallery:upload
 * ④ （非 dry-run）自动合成 design:composite
 * ⑤ 缓存 product.json + CSV 报告 + 本地 HTML（可扩展模板）
 *
 * 用法：
 *   node scripts/hi.js listing:generate --product-id 11243 --images "img1.jpg:1,img2.jpg:2" [--fit cover] [--dry-run] [--external-id X] [--customer-id Y]
 *   单图默认应用到所有可设计面：--images "img1.jpg"
 *   不同面不同图：--images "img1.jpg:1,img2.jpg:2"
 */
const path = require('path');
const { parseProduct, defaultFace } = require('../../Support/ProductProfile');
const { writeCsv } = require('../../Support/CsvReport');
const { render } = require('../../Support/ListingRenderer');
const { render: renderAdmin } = require('../../Support/AdminRenderer');
const image = require('../../../tools/image');

function sanitizeDirName(s) {
  return String(s == null ? '默认' : s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').trim() || '默认';
}

function parseImageSpecs(str) {
  if (!str) return [];
  return str.split(',').map((t) => {
    t = t.trim();
    let src = t, viewStr = '';
    // 仅当结尾是 :数字 或 :all/:* 时才视为 view 分隔（避免误伤 URL / 盘符）
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

class ListingGenerateCommand {
  constructor(app) { this.app = app; this.signature = 'listing:generate'; this.description = '抓详情→处理图→上传→合成→缓存CSV+HTML(总编排)'; this.usage = '--product-id <id> --images "img1:view,img2:view" [--fit][--dry-run][--external-id][--customer-id]'; }
  async handle(opts) {
    const app = this.app;
    const product = app.make('product');
    const gallery = app.make('gallery');
    const design = app.make('design');
    const config = app.make('config');

    const productId = opts.productId;
    if (!productId) { console.log('需要 --product-id <空白产品id>。'); return; }
    const dry = !!opts.dryRun;

    console.log('========== listing:generate ==========');
    console.log('产品 ' + productId + (dry ? '  [DRY-RUN，不写入图库/不合成]' : ''));

    // ① 抓空白产品详情
    let r;
    try { r = await product.detail(productId); } catch (e) { console.log('❌ 抓详情失败: ' + e.message); process.exitCode = 1; return; }
    if (r.status >= 400 || r.code !== 200) { console.log('❌ 详情接口失败: HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
    const profile = parseProduct(r.data);
    const faces = profile.designFaces;

    // ② 处理客户图
    const outDir = path.join(config.outputDir, String(productId));
    const imgDir = path.join(outDir, 'images');
    const specs = parseImageSpecs(opts.images);
    const fit = opts.fit || 'cover';
    const processed = []; // {src, views, file, width, height}
    const ext = opts.externalId || String(Date.now());
    const extCust = opts.externalCustomerId || '';

    for (const spec of specs) {
      let targetFace;
      if (spec.views.includes('all')) targetFace = defaultFace(profile);
      else targetFace = faceByView(profile, spec.views.find((v) => v !== 'all') || 1);
      // 若映射多个不同尺寸面，取最大
      for (const v of spec.views) { if (v !== 'all') { const f = faceByView(profile, v); if (f.width * f.height > targetFace.width * targetFace.height) targetFace = f; } }
      const width = targetFace.width, height = targetFace.height;
      try {
        const buf = await image.fitImage({ input: spec.src, targetW: width, targetH: height, fit });
        const file = path.join(imgDir, 'design-' + (spec.views.includes('all') ? 'all' : spec.views.join('-')) + '.jpg');
        image.save(buf, file);
        processed.push({ src: spec.src, views: spec.views, file, width, height });
        console.log('  ✅ 处理图片 → ' + path.basename(file) + ' (' + width + 'x' + height + ', ' + fit + ')');
      } catch (e) { console.log('  ❌ 处理图片失败 ' + spec.src + ': ' + e.message); }
    }
    if (!processed.length) console.log('  ⚠️ 无图片可处理（仅抓取+报表）。');

    // ②.5 归档图案原稿 → output/<id>/原稿/（规范：加文字前原稿必存；加文字后另存 _加文字）
    try {
      const { archiveOriginal } = require('../../Support/OriginalArchive');
      const srcSet = [...new Set(specs.map((s) => s.src).filter((s) => s && fs.existsSync(s)))];
      if (srcSet.length) {
        const arch = archiveOriginal({ productId, outputDir: config.outputDir, items: srcSet.map((s) => ({ src: s })) });
        console.log('  🗂️ 图案原稿已归档: ' + arch.dir + (arch.files.length ? ' (' + arch.files.join(', ') + ')' : ''));
      }
    } catch (e) { console.log('  ⚠️ 原稿归档异常: ' + e.message); }

    const customization = { galleryCodes: {}, compositeProductCode: '', effectImages: [], effectImageCount: 0, dry };

    // ③ 上传图库（非 dry-run）
    if (!dry) {
      for (const p of processed) {
        try {
          const up = await gallery.upload({ image: p.file, cn_name: 'listing-' + productId, en_name: 'listing-' + productId, external_id: ext });
          if (up.status >= 400 || up.code !== 200) { console.log('  ❌ 上传图库失败 ' + p.file + ': ' + (up.msg || '')); continue; }
          const code = up.data && up.data.code;
          console.log('  ✅ 上传图库 → ' + code);
          for (const v of p.views) customization.galleryCodes[v === 'all' ? 'all' : v] = code;
        } catch (e) { console.log('  ❌ 上传图库异常 ' + p.file + ': ' + e.message); }
      }
    } else {
      console.log('  [dry-run] 跳过上传图库。');
    }

    // ④ 自动合成（非 dry-run）
    if (!dry && Object.keys(customization.galleryCodes).length) {
      const cfgs = [];
      const seen = new Set();
      for (const [v, code] of Object.entries(customization.galleryCodes)) {
        const viewId = v === 'all' ? 1 : Number(v);
        if (seen.has(viewId)) continue; seen.add(viewId);
        const f = faceByView(profile, viewId);
        cfgs.push({ view_id: viewId, gallery_code: code, width: f.width, height: f.height, top_x: 0, top_y: 0 });
      }
      // 若标了 all，补全其余可设计面
      if (customization.galleryCodes.all) {
        const firstCode = customization.galleryCodes.all;
        for (const face of faces) {
          if (!seen.has(face.id)) { seen.add(face.id); cfgs.push({ view_id: face.id, gallery_code: firstCode, width: face.width, height: face.height, top_x: 0, top_y: 0 }); }
        }
      }
      console.log('  合成 cfgs: ' + JSON.stringify(cfgs));
      try {
        const cr = await design.composite({ productTypeId: productId, defaultColorId: opts.defaultColorId, defaultViewId: opts.defaultViewId, externalId: ext, externalCustomerId: extCust, cfgs });
        if (cr.status >= 400 || cr.code !== 200) { console.log('❌ 合成失败: HTTP ' + cr.status + ' msg=' + (cr.msg || '')); }
        else {
          const d = cr.data || {};
          customization.compositeProductCode = d.code;
          // 按规格(颜色/形状)分组
          customization.effectGroups = (d.colors || []).map((c) => ({ name: c.cn_name || '默认', images: (c.renderings || []).map((rr) => rr.big_img || rr.small_img).filter(Boolean) }));
          customization.effectImages = [].concat(...customization.effectGroups.map((g) => g.images));
          customization.effectImageCount = customization.effectImages.length;
          customization.mainImage = customization.effectImages[0] || '';
          customization.otherImages = customization.effectImages.slice(1);
          console.log('✅ 合成成功 定制产品: ' + d.code + ' | 规格数 ' + customization.effectGroups.length + ' | 效果图 ' + customization.effectImageCount + ' 张');
        }
      } catch (e) { console.log('❌ 合成异常: ' + e.message); }
    } else if (dry) {
      console.log('  [dry-run] 跳过自动合成。');
    }

    // 下载合成效果图到本地（按规格分组到子文件夹，方便"打开文件夹"查看）
    if (customization.effectImages && customization.effectImages.length) {
      customization.effectImageLocal = [];
      customization.effectImageLocalGroups = [];
      const groups = customization.effectGroups && customization.effectGroups.length ? customization.effectGroups : [{ name: '默认', images: customization.effectImages }];
      for (const g of groups) {
        const folder = sanitizeDirName(g.name);
        const gdir = path.join(imgDir, folder);
        fs.mkdirSync(gdir, { recursive: true });
        const gfiles = [];
        customization.mainImageIndex = 0; // 第1张(正面)=主图；其余为 other
        for (let i = 0; i < (g.images || []).length; i++) {
          try {
            const r = await fetch(g.images[i]);
            const buf = Buffer.from(await r.arrayBuffer());
            const fname = i === 0 ? 'main-1.jpg' : 'other-' + (i + 1) + '.jpg';
            const f = path.join(gdir, fname);
            fs.writeFileSync(f, buf);
            const rel = './images/' + folder + '/' + fname;
            gfiles.push(rel); customization.effectImageLocal.push(rel);
          } catch (e) { console.log('  📥 下载失败 ' + g.name + ' ' + (i + 1) + ': ' + e.message); }
        }
        customization.effectImageLocalGroups.push({ name: g.name, dir: './images/' + folder, files: gfiles });
        console.log('  📥 ' + g.name + ': ' + gfiles.length + ' 张 → images\\' + folder);
      }
    }

    // ⑤ 缓存 + CSV + HTML
    const jsonFile = path.join(outDir, 'product.json');
    fsMkdirAndFile(jsonFile, JSON.stringify({ raw: r.data, profile, customization }, null, 2));
    const csvFile = writeCsv(path.join(outDir, 'product.csv'), profile, customization, { generatedAt: new Date().toLocaleString() });

    // 两个入口链接（商户后台编辑空白商品 / 我的定制商品列表）
    const me = config.merchant || {};
    const links = [];
    if (me.productEdit) links.push({ label: '✏️ 编辑当前空白商品', url: String(me.productEdit).replace('{id}', productId), kind: 'product' });
    if (me.customerProductList) links.push({ label: '📦 我的定制商品列表', url: me.customerProductList, kind: 'list' });

    const htmlFile = render({ profile, customization, options: { title: profile.identity.cnName + ' — 产品信息', sections: undefined, links, dir: String(productId) }, htmlDir: outDir });
    // ⑥ 登记到 CSV 类数据库 + 刷新管理后台
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
    const nSpec = repo.upsertProduct(String(productId), shared, profile.specs, JSON.stringify({ profile, customization }));
    const adminFile = renderAdmin({ records: repo.products(), merchant: config.merchant, htmlDir: config.outputDir, htmlFile: 'manage.html' });

    console.log('\n✅ 已缓存到: ' + outDir);
    console.log('  product.json / product.csv');
    console.log('  ' + (nSpec ? '✅ 已登记到 CSV 数据库（' + nSpec + ' 个规格行）' : '✅ 已登记到 CSV 数据库') + ' id=' + productId);
    console.log('  📊 管理后台: ' + adminFile + (dry ? '（dry-run 状态=draft）' : ''));
    console.log('  （列表: /manage.html；详情模板: /product.html?id=' + productId + '）');
  }
}
function fsMkdirAndFile(file, content) { const fs = require('fs'); const path = require('path'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); }
module.exports = { ListingGenerateCommand };
