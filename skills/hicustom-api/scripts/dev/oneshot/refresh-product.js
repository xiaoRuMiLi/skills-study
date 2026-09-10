'use strict';
/**
 * refresh-product.js — 补全某个商品的详细数据（含 specs）并同步 CSV + 统一后台。
 * 用法：node scripts/tools/refresh-product.js <商品id> [dry]
 * 不重新合成；读取已存在 product.json 的 customization，重抓空白产品详情（含 specs），
 * 写回 product.json + 更新 products.csv 行 + 重建 manage.html。
 */
const fs = require('fs');
const path = require('path');
const HOST = 'C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api';
const { bootstrap } = require(path.join(HOST, 'scripts/core/bootstrap'));
const { parseProduct, defaultFace } = require(path.join(HOST, 'scripts/app/Support/ProductProfile'));
const { render: renderAdmin } = require(path.join(HOST, 'scripts/app/Support/AdminRenderer'));

const id = process.argv[2] || '11243';
const outDir = path.join(HOST, 'output', id);
const pjPath = path.join(outDir, 'product.json');

(async () => {
  const { app } = bootstrap();
  const product = app.make('product');
  const repo = app.make('productRepo');
  const config = app.make('config');

  // 保留已有 customization
  let customization = {};
  if (fs.existsSync(pjPath)) { try { customization = JSON.parse(fs.readFileSync(pjPath, 'utf8')).customization || {}; } catch (e) {} }
  customization.dir = id;

  const r = await product.detail(id);
  if (r.status >= 400 || r.code !== 200) { console.log('产品详情失败:', r.status, r.msg); process.exit(1); }
  const profile = parseProduct(r.data);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(pjPath, JSON.stringify({ raw: r.data, profile, customization }, null, 2), 'utf8');
  console.log('✅ product.json 已更新（含 specs ' + (profile.specs || []).length + ' 个规格）');

  // 更新 CSV 行
  const shared = {
    spu_code: profile.identity.spuCode, cn_name: profile.identity.cnName, en_name: profile.identity.enName,
    factory: profile.identity.factory, material: profile.attributes.materialCn, min_price: profile.pricing.minPrice,
    design_face_w: defaultFace(profile).width, design_face_h: defaultFace(profile).height,
    gallery_codes: Object.values(customization.galleryCodes || {}).join('|'),
    composite_product_code: customization.compositeProductCode || '', effect_image_count: customization.effectImageCount || 0,
    status: customization.compositeProductCode ? 'synced' : 'draft', notes: '',
  };
  const nSpec = repo.upsertProduct(id, shared, profile.specs, JSON.stringify({ profile, customization }));
  console.log('  ✅ 已写入 CSV（' + nSpec + ' 个规格行）');

  const adminFile = renderAdmin({ records: repo.products(), merchant: config.merchant, htmlDir: config.pagesDir, htmlFile: 'manage.html' });
  console.log('📊 统一管理后台: ' + adminFile + ' | 访问 /manage.html');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
