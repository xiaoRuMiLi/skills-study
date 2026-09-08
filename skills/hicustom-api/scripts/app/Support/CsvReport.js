'use strict';
/**
 * CsvReport.js — 生成产品信息 CSV（零依赖，Excel 可直接打开）。
 * 列定义见 references/csv-schema.md。
 */
const fs = require('fs');
const path = require('path');

const HEADERS = [
  'product_id', 'spu_code', 'cn_name', 'en_name', 'alias', 'factory', 'technology', 'material',
  'min_price', 'default_color', 'default_size',
  'design_face_w', 'design_face_h', 'design_face_count',
  'variants_count', 'colors', 'sizes',
  'package_L_cm', 'package_W_cm', 'package_H_cm', 'volume_cm3', 'weight_g',
  'gallery_codes', 'composite_product_code', 'effect_image_count', 'effect_image_urls',
  'detail_img_count', 'release_time', 'generated_at',
  'specs_json', 'detail_json',
];

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsvLine(row) { return row.map(csvEscape).join(','); }

function buildRow(profile, customization = {}, meta = {}) {
  const idn = profile.identity || {}, at = profile.attributes || {}, pr = profile.pricing || {};
  const faces = profile.designFaces || [], variants = profile.variants || [];
  const v0 = variants[0] || {};
  const galleryCodes = Object.values(customization.galleryCodes || {}).join('|');
  const effectUrls = (customization.effectImages || []).join('|');
  return [
    idn.id, idn.spuCode, idn.cnName, idn.enName, idn.alias, idn.factory, at.technology, at.materialCn,
    pr.minPrice, pr.defaultColorName, pr.defaultSizeName,
    (faces[0] && faces[0].width), (faces[0] && faces[0].height), faces.length,
    variants.length, (profile.colors || []).map((c) => c.cnName).join('/'), (profile.sizes || []).map((s) => s.name).join('/'),
    v0.length, v0.width, v0.height, v0.volume, v0.weight,
    galleryCodes, customization.compositeProductCode || '', customization.effectImageCount || 0, effectUrls,
    (profile.images ? profile.images.detailImg.length : 0), idn.releaseTime, meta.generatedAt || meta.parsedAt || '',
    JSON.stringify(profile.specs || []),  // 每个规格的详细属性（包装/重量/各档售价）
    JSON.stringify({ profile, customization }),  // 渲染详情页所需的完整数据（唯一数据源）
  ];
}

// 生成 CSV 文件并返回路径
function writeCsv(file, profile, customization = {}, meta = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [HEADERS.join(','), toCsvLine(buildRow(profile, customization, meta))];
  fs.writeFileSync(file, '\uFEFF' + lines.join('\r\n'), 'utf8'); // 带 BOM，Excel 中文不乱码
  return file;
}

module.exports = { writeCsv, HEADERS, buildRow };
