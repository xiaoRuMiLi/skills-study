'use strict';
/**
 * ListingSheet.js — 根据亚马逊模板动态导出「上架表格」的必要列 + 按 attribute 名填值。
 * 说明：不同类目/不同模板字段不同，固定列清单不可靠；本模块从模板 Data Definitions + Template 表
 *      动态拿到「列标签(label) + 底层attribute + 必填状态」，再按 attribute 名把 record 的值映射进去。
 * 规则：
 *   - KEEP 必填状态为 Required / Recommended 的列；
 *   - 追加「上架必需但模板标 Optional」的列（主图/附图/库存/价格/时效/condition 等）；
 *   - 值按 attribute 基名映射(见 attrValue)；无法映射的留下空 —— 空值随 listing_missing 暴露。
 */
function stripQual(arr) { return arr.replace(/\[[^\]]*\]/g, ''); }
function baseName(a) {
  if (!a) return '';
  const s = stripQual(a);
  const m = s.match(/^([a-zA-Z0-9_]+)/);
  return m ? m[1].toLowerCase() : '';
}
function occurIndex(a) {
  if (!a) return 1;
  const s = stripQual(a);
  const m = s.match(/#(\d+)\./);
  return m ? +m[1] : 1;
}

// 流程实际会填的 attribute 基名（决定保留哪些"上架必需"列；列名仍来自模板）
const FILLED_ATTRS = [
  'contribution_sku', 'product_type', 'record_action', 'parentage', 'parent',
  'item_name', 'brand', 'amzn1.volt.ca.product_id_type', 'amzn1.volt.ca.product_id_value',
  'model_number', 'model_name', 'manufacturer', 'product_description', 'bullet_point', 'generic_keyword',
  'material', 'fabric_type', 'number_of_items', 'item_package_quantity', 'number_of_pieces',
  'main_product_image_locator', 'other_product_image_locator', 'swatch_product_image_locator',
  'color', 'apparel_size', 'item_condition', 'theme', 'item_type_name', 'country_of_origin',
  'item_weight', 'standard_price', 'list_price', 'price', 'quantity', 'fulfillment_channel_code',
  'handling_time', 'unit_count', 'unit_count_type', 'special_size'
];
// 判定是否保留该列
function keepColumn(label, attr, required) {
  if (/required/i.test(required)) return true; // Required 必留
  const bn = baseName(attr);
  return FILLED_ATTRS.some((x) => bn === x || bn.includes(x));
}

// 按 attribute 基名映射 record 值 (targetMarket 用于多站点后缀过滤)
function attrValue(attr, record, targetMarket) {
  const bnRaw = baseName(attr);
  const bn = bnRaw.replace(/_\d+$/, ''); // 剥离 locator 尾部 _N（other_product_image_locator_1 → other_product_image_locator）以便精确匹配
  const idx = (() => { const mm = attr.match(/_(\d+)/); if (mm && /locator/i.test(bnRaw)) return +mm[1]; return occurIndex(attr); })();
  const r = record || {};
  const b = r.bullet_point || [];
  const o = r.other_image_urls || [];
  const pkg = r.package || {};
  switch (bn) {
    case 'contribution_sku': case 'sku': return r.sku || ('SKU-' + (r.id || '') + '-UK');
    case 'product_type': return r.product_type || '';
    case 'record_action': case 'listing_action': return '(Default) Create or Replace';
    case 'parent': case 'parentage': return 'Parent';
    case 'item_name': return r.item_name || '';
    case 'brand': return r.brand || '';
    case 'amzn1.volt.ca.product_id_type': return r.product_id_type || '';
    case 'amzn1.volt.ca.product_id_value': return r.product_id || '';
    case 'model_number': return r.model_number || '';
    case 'model_name': return r.model_name || '';
    case 'manufacturer': return r.brand || 'Generic';
    case 'product_description': return r.product_description || '';
    case 'bullet_point': return b[idx - 1] || '';
    case 'generic_keyword': return idx > 1 ? '' : (r.generic_keyword || '');
    case 'material': return idx > 1 ? '' : (r.material || '');
    case 'fabric_type': return r.fabric_type || 'Polyester';
    case 'number_of_items': return (r.number_of_items || '1');
    case 'item_package_quantity': return '1';
    case 'number_of_pieces': return (r.number_of_pieces || '1');
    case 'main_product_image_locator': return r.main_image_url || '';
    case 'other_product_image_locator': return o[idx - 1] || '';
    case 'swatch_product_image_locator': return r.swatch_image_url || '';
    case 'color': {
      if (/standardized_values/.test(attr)) return r.colour_map || (r.color ? String(r.color).split(',')[0].trim() : '');
      return r.color || '';
    }
    case 'apparel_size': {
      if (/#size_system/.test(attr)) return r.size_system || 'UK';
      if (/#size_class/.test(attr)) return r.size_class || 'Regular';
      if (/#size\./.test(attr) || /#size$/.test(attr)) return r.size || '';
      if (/#body_type/.test(attr)) return r.size_body_type || '';
      if (/#height_type/.test(attr)) return r.size_height_type || '';
      return '';
    }
    case 'item_condition': return r.item_condition || 'New';
    case 'theme': return r.theme || '';
    case 'item_type_name': return r.item_type_name || '';
    case 'country_of_origin': return r.country_of_origin || '';
    case 'unit_count': return r.unit_count || '';
    case 'unit_count_type': return r.unit_count_type || '';
    // 价格
    case 'standard_price': case 'list_price': case 'price': return r.price != null ? r.price : '';
    case 'your_price': return r.price != null ? r.price : '';
    // 库存/配送/时效
    case 'quantity': return r.quantity || '1';
    case 'fulfillment_channel_code': return r.fulfillment_channel || '';
    case 'handling_time': return r.handling_time || '';
    case 'item_weight': return (/#unit|\.unit|unit\b/i.test(attr)) ? 'GRAMS' : (pkg.weight != null ? pkg.weight : '');
    case 'item_weight_unit': return 'GRAMS';
    default: return '';
  }
}

// 返回 { labels:[{label, header, attr, required, col}], row:{ header: value }, columns:[labels+header] }
// 不列入上架表格的列（用户明确不需要的字段）
const EXCLUDE_COLS = new Set(['Product Id Type', 'Product Id', 'Product Id Type Value']);
function buildListingSheet(tpl, record, opts) {
  opts = opts || {};
  const targetMarket = opts.targetMarket || 'A1F83G8C2ARO7P';
  // 统计每个 label 在整表出现次数（区分重复列：Bullet Point/Other Image URL/Material 等）
  const freq = {};
  for (const c of (tpl.columns || [])) freq[c.label] = (freq[c.label] || 0) + 1;
  const seenAttr = new Set();
  const labelCount = {};
  const labels = [];
  const row = {};
  const columns = [];
  for (const c of (tpl.columns || [])) {
    if (EXCLUDE_COLS.has(c.label)) continue; // 用户不需要的字段
    if (c.attribute && /\[marketplace_id=/.test(c.attribute) && !c.attribute.includes(targetMarket)) continue; // 只保留目标站点列
    if (seenAttr.has(c.attribute)) continue; // 去掉完全相同的 attribute 重复
    seenAttr.add(c.attribute);
    const val = attrValue(c.attribute, record, targetMarket);
    const isRequired = /^required$/i.test((c.required || '').trim()); // 严格 Required；Conditionally required 不适用则留空
    // 仅保留：必填列（即使为空，暴露待补）+ 实际有值的列（"只保留上架所需"）
    if (!isRequired && (val === '' || val == null)) continue;
    labelCount[c.label] = (labelCount[c.label] || 0) + 1;
    const n = labelCount[c.label];
    const header = freq[c.label] > 1 ? (c.label + ' ' + n) : c.label;
    labels.push(c);
    columns.push(header);
    row[header] = val;
  }
  return { labels, row, columns, targetMarket };
}

// 找「设计后效果图」：优先 CDN(customization.effectImages)，否则回退本地合成效果图(output/<id>/images/)
// 绝不返回 products.csv 的空白商品图
const fs = require('fs');
const path = require('path');
function walkImg(current, rootDir, id) {
  const res = [];
  let items = []; try { items = fs.readdirSync(current); } catch (e) { return res; }
  for (const f of items) {
    const p = path.join(current, f); let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) res.push(...walkImg(p, rootDir, id));
    else if (/\.(jpe?g|png|webp)$/i.test(f)) res.push('/' + id + '/images/' + path.relative(rootDir, p).replace(/\\/g, '/'));
  }
  return res;
}
function findDesignedImages(outputDir, id) {
  let cdn = [];
  try { const pj = JSON.parse(fs.readFileSync(path.join(outputDir, String(id), 'product.json'), 'utf8')); cdn = ((pj.customization && pj.customization.effectImages) || []).filter(Boolean); } catch (e) {}
  if (cdn.length) return { main: cdn[0], others: cdn.slice(1, 8), source: 'cdn' };
  // 本地合成效果图（listing:generate 下载到 images/<group>/main-1.jpg + other-N.jpg）
  const imgDir = path.join(outputDir, String(id), 'images');
  let files = []; try { files = walkImg(imgDir, imgDir, String(id)); } catch (e) {}
  const num = (u) => { const m = u.match(/main-1?\.jpg$/i) ? 0 : u.match(/other-(\d+)\.jpg$/i) ? +RegExp.$1 : u.match(/effect-(\d+)\.jpg$/i) ? 100 + +RegExp.$1 : 999; return m; };
  files = files.filter((u) => !/main-amazon\.jpg$/i.test(u) && !/design-/i.test(u)).sort((a, b) => num(a) - num(b));
  if (files.length) return { main: files[0], others: files.slice(1, 8), source: 'local' };
  return { main: '', others: [], source: 'none' };
}
module.exports = { buildListingSheet, attrValue, baseName, occurIndex, findDesignedImages };
