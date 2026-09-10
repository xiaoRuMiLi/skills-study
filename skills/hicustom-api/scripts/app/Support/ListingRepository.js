'use strict';
/**
 * ListingRepository — 「上架(listing)」数据的 CSV 类数据库（Laravel 风格 Repository）。
 * 数据源：config.listingPath（默认 database/listing.csv）。**一行 = 一个商品的上架记录**。
 * 提供：all/find/upsert/remove。扩展列 = 改本 SCHEMA。
 */
const fs = require('fs');
const path = require('path');
const csv = require('../../tools/csv');

const SCHEMA = [
  'id',            // 商品 id
  'cn_name',       // 商品名
  'title',         // 上架标题
  'image',         // 主图（相对/绝对）
  'updated_at',    // 时间
  'status',        // 状态（draft/ready/synced…）
  'preview_url',   // 预览链接（/listing.html?id=…）
  'notes',         // 备注
];

class ListingRepository {
  constructor(config) { this.file = config.listingPath; }
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

  // 一行/商品：存在则合并更新，不存在则新增
  upsert(id, obj = {}) {
    const rows = this._read();
    const i = rows.findIndex((r) => String(r.id) === String(id));
    const now = new Date().toLocaleString();
    const merged = Object.assign({}, i >= 0 ? rows[i] : { id, status: 'draft', updated_at: now }, obj, { id, updated_at: obj.updated_at || now });
    if (i >= 0) rows[i] = merged; else rows.push(merged);
    this._write(rows);
    return merged;
  }
  remove(id) {
    const rows = this._read();
    const next = rows.filter((r) => String(r.id) !== String(id));
    this._write(next);
    return rows.length - next.length;
  }
}

module.exports = { ListingRepository, SCHEMA };
