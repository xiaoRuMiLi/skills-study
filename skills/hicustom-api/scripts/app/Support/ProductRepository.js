'use strict';
/**
 * ProductRepository — CSV "类数据库" 仓储（Laravel 风格 Repository）。
 * 数据源：config.databasePath（默认 database/products.csv）。
 * 采用**一行一个规格（变种）**的归一化存储，让 尺寸/包装/重量/各档售价 各自成列。
 * 提供：list/get/update/remove（按商品 id 操作）+ upsertProduct（整商品写入，替换该商品全部规格行）+ products()（按商品分组）。
 */
const fs = require('fs');
const path = require('path');
const csv = require('../../tools/csv');

// 主 CSV 列（一行 = 一个规格）。扩展新功能 = 加列 + 改这里。
const SCHEMA = [
  'id', 'spu_code', 'cn_name', 'en_name', 'factory', 'material', 'min_price',
  'color_id', 'color_name', 'size_id', 'size_name', 'size_W_cm', 'size_H_cm',
  'variant_id', 'variant_code',
  'package_L_cm', 'package_W_cm', 'package_H_cm', 'volume_cm3', 'weight_g',
  'shipping_US', 'shipping_UK', 'shipping_CA', 'shipping_DE', 'shipping_MX', 'shipping_FR', 'shipping_ES', 'shipping_IT',
  'retail_price', 'gold_price', 'platinum_price', 'diamond_price', 'black_diamond_price', 'star_diamond_price',
  'qty_from', 'qty_to',
  'design_face_w', 'design_face_h', 'gallery_codes', 'composite_product_code', 'effect_image_count',
  'status', 'notes', 'created_at', 'updated_at', 'detail_json',
];

class ProductRepository {
  constructor(config) { this.file = config.databasePath; }
  _ensure() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); }
  _read() {
    if (!fs.existsSync(this.file)) return [];
    const rows = csv.parse(fs.readFileSync(this.file, 'utf8'));
    return csv.toObjects(rows);
  }
  _write(rows) {
    this._ensure();
    const clean = rows.map((r) => { const o = {}; for (const k of SCHEMA) o[k] = r[k] != null ? r[k] : ''; return o; });
    fs.writeFileSync(this.file, '\uFEFF' + csv.serialize(csv.fromObjects(clean, SCHEMA)), 'utf8');
  }
  all() { return this._read(); }
  rows(id) { return this._read().filter((r) => String(r.id) === String(id)); }
  find(id) { return this.rows(id)[0] || null; }

  // 整商品写入：删除该商品所有规格行，再按 specs[] 写入（每个规格一行）
  upsertProduct(id, shared, specs, detailJson) {
    let rows = this._read().filter((r) => String(r.id) !== String(id));
    const now = new Date().toLocaleString();
    const base = Object.assign({ id, status: 'draft', created_at: now, updated_at: now, detail_json: detailJson || '' }, shared || {});
    const list = specs && specs.length ? specs : [{}];
    for (const s of list) {
      const pk = s.package || {};
      const pr = s.prices || {};
      rows.push(Object.assign({}, base, {
        color_id: s.colorId != null ? s.colorId : '', color_name: s.colorName || '',
        size_id: s.sizeId != null ? s.sizeId : '', size_name: s.sizeName || '',
        size_W_cm: s.dims && s.dims.width != null ? s.dims.width : '',
        size_H_cm: s.dims && s.dims.height != null ? s.dims.height : '',
        variant_id: s.variantId != null ? s.variantId : '', variant_code: s.code || '',
        package_L_cm: pk.L != null ? pk.L : '', package_W_cm: pk.W != null ? pk.W : '', package_H_cm: pk.H != null ? pk.H : '',
        volume_cm3: pk.volume != null ? pk.volume : '', weight_g: s.weight != null ? s.weight : '',
        retail_price: pr.retail ? pr.retail.price : '', gold_price: pr.gold ? pr.gold.price : '',
        platinum_price: pr.platinum ? pr.platinum.price : '', diamond_price: pr.diamond ? pr.diamond.price : '',
        black_diamond_price: pr.blackDiamond ? pr.blackDiamond.price : '', star_diamond_price: pr.starDiamond ? pr.starDiamond.price : '',
        qty_from: (pr.retail && pr.retail.qty_from) || '', qty_to: (pr.retail && pr.retail.qty_to) || '',
      }));
    }
    this._write(rows);
    return list.length;
  }

  remove(id) {
    const rows = this._read();
    const next = rows.filter((r) => String(r.id) !== String(id));
    this._write(next);
    return rows.length - next.length;
  }
  // 更新该商品全部规格行的共享字段（status/notes/图库码/合成码/效果图数等）
  update(id, patch) {
    const rows = this._read();
    const shared = SCHEMA.filter((k) => k !== 'id' && k !== 'color_id' && k !== 'color_name' && k !== 'size_id' && k !== 'size_name'
      && k !== 'variant_id' && k !== 'variant_code' && k !== 'package_L_cm' && k !== 'package_W_cm' && k !== 'package_H_cm'
      && k !== 'volume_cm3' && k !== 'weight_g' && k !== 'retail_price' && k !== 'gold_price' && k !== 'platinum_price'
      && k !== 'diamond_price' && k !== 'black_diamond_price' && k !== 'star_diamond_price' && k !== 'qty_from' && k !== 'qty_to');
    let changed = false;
    for (const r of rows) if (String(r.id) === String(id)) { for (const k of shared) if (patch[k] != null) r[k] = patch[k]; r.updated_at = new Date().toLocaleString(); changed = true; }
    if (changed) this._write(rows);
    return changed;
  }

  // 按商品分组 → [{ 商品摘要 + specs[] }]，供列表/详情/API 使用
  products() {
    const groups = {};
    for (const r of this._read()) {
      const key = String(r.id);
      if (!groups[key]) {
        groups[key] = {
          id: r.id, spu: r.spu_code, name: r.cn_name, enName: r.en_name, factory: r.factory, material: r.material,
          minPrice: r.min_price, galleryCodes: r.gallery_codes || '', compositeCode: r.composite_product_code || '',
          effectCount: r.effect_image_count || 0, status: r.status || 'draft',
          designFaces: { w: r.design_face_w, h: r.design_face_h },
          detail: (() => { try { return r.detail_json ? JSON.parse(r.detail_json) : null; } catch (e) { return null; } })(),
          specs: [],
        };
      }
      groups[key].specs.push({
        colorId: r.color_id, colorName: r.color_name, sizeId: r.size_id, sizeName: r.size_name,
        dims: { width: r.size_W_cm !== '' ? r.size_W_cm : null, height: r.size_H_cm !== '' ? r.size_H_cm : null },
        variantId: r.variant_id, code: r.variant_code,
        package: { L: r.package_L_cm, W: r.package_W_cm, H: r.package_H_cm, volume: r.volume_cm3 }, weight: r.weight_g,
        prices: {
          retail: r.retail_price !== '' ? { price: r.retail_price, qty_from: r.qty_from, qty_to: r.qty_to } : null,
          gold: r.gold_price !== '' ? { price: r.gold_price } : null,
          platinum: r.platinum_price !== '' ? { price: r.platinum_price } : null,
          diamond: r.diamond_price !== '' ? { price: r.diamond_price } : null,
          blackDiamond: r.black_diamond_price !== '' ? { price: r.black_diamond_price } : null,
          starDiamond: r.star_diamond_price !== '' ? { price: r.star_diamond_price } : null,
        },
        shipping: {
          US: r.shipping_US !== '' ? Number(r.shipping_US) : null,
          UK: r.shipping_UK !== '' ? Number(r.shipping_UK) : null,
          CA: r.shipping_CA !== '' ? Number(r.shipping_CA) : null,
          DE: r.shipping_DE !== '' ? Number(r.shipping_DE) : null,
          MX: r.shipping_MX !== '' ? Number(r.shipping_MX) : null,
          FR: r.shipping_FR !== '' ? Number(r.shipping_FR) : null,
          ES: r.shipping_ES !== '' ? Number(r.shipping_ES) : null,
          IT: r.shipping_IT !== '' ? Number(r.shipping_IT) : null,
        },
      });
    }
    return Object.values(groups);
  }
}

module.exports = { ProductRepository, SCHEMA };
