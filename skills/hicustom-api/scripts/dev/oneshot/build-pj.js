'use strict';
/**
 * build-pj.js — 为某商品生成/补全 output/<id>/product.json（供 regen-detail 使用）。
 * 用法：node scripts/tools/build-pj.js <商品id> [合成定制产品码]
 * 不写图库、不合成；只是抓空白产品详情 + 关联一个已存在的定制产品码。
 */
const fs = require('fs');
const path = require('path');
const HOST = 'C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api';
const { bootstrap } = require(path.join(HOST, 'scripts/core/bootstrap'));
const { parseProduct } = require(path.join(HOST, 'scripts/app/Support/ProductProfile'));

const id = process.argv[2] || '11991';
const code = process.argv[3] || '56R3S3XY';

(async () => {
  const { app } = bootstrap();
  const product = app.make('product');
  const r = await product.detail(id);
  if (r.status >= 400 || r.code !== 200) { console.log('产品详情失败:', r.status, r.msg); process.exit(1); }
  const profile = parseProduct(r.data);
  const customization = { compositeProductCode: code, effectGroups: [], effectImages: [], effectImageCount: 0, dir: id };
  const outDir = path.join(HOST, 'output', id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'product.json'), JSON.stringify({ raw: r.data, profile, customization }, null, 2), 'utf8');
  console.log('✅ 已生成 output\\' + id + '\\product.json，关联定制产品 ' + code);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
