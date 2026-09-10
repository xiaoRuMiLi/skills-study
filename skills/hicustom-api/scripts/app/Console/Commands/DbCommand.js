'use strict';
/**
 * DbCommand — db:* 管理 CSV"类数据库"（一行一规格）。
 * 用法：
 *   node scripts/hi.js db list
 *   node scripts/hi.js db get <id>
 *   node scripts/hi.js db update <id> --status synced --notes "..."
 *   node scripts/hi.js db delete <id>
 *   node scripts/hi.js db admin
 */
const { SCHEMA } = require('../../Support/ProductRepository');
const { render: renderAdmin } = require('../../Support/AdminRenderer');

// 共享字段（商品级）：camel 选项键 → 主 CSV 列
const SHARED_MAP = {
  id: 'id', spuCode: 'spu_code', cnName: 'cn_name', enName: 'en_name', factory: 'factory',
  material: 'material', minPrice: 'min_price', designFaceW: 'design_face_w', designFaceH: 'design_face_h',
  galleryCodes: 'gallery_codes', compositeProductCode: 'composite_product_code', effectImageCount: 'effect_image_count',
  status: 'status', notes: 'notes',
};

class DbCommand {
  constructor(app) { this.app = app; this.signature = 'db'; this.description = 'CSV类数据库增删改查 (list/get/update/delete/admin)'; this.usage = 'list | get <id> | update <id> ... | delete <id> | admin'; }
  async handle(opts, rest) {
    const repo = this.app.make('productRepo');
    const action = (rest && rest[0]) || (opts._ && opts._[0]) || 'list';
    const a2 = (rest && rest[1]) || (opts._ && opts._[1]);

    if (action === 'list' || action === 'all') {
      const products = repo.products();
      if (!products.length) { console.log('数据库为空。用 listing:generate 添加。'); return; }
      console.log('CSV数据库共 ' + products.length + ' 个商品（' + repo.all().length + ' 条规格行）：\n');
      for (const p of products) {
        console.log('  [' + p.id + '] ' + (p.name || '') + ' | SPU ' + (p.spu || '') + ' | ¥' + (p.minPrice || '') + ' | 规格 ' + p.specs.length + ' | 状态 ' + (p.status || '') + (p.compositeCode ? ' | 合成 ' + p.compositeCode : ''));
      }
      return;
    }

    if (action === 'get') {
      if (!a2) { console.log('用法: db get <id>'); return; }
      const rows = repo.rows(a2);
      if (!rows.length) { console.log('未找到 id=' + a2); return; }
      console.log('[' + a2 + '] ' + (rows[0].cn_name || '') + ' · 共 ' + rows.length + ' 个规格：');
      rows.forEach((r, i) => {
        console.log('  规格' + (i + 1) + ': ' + (r.color_name || '') + ' · ' + (r.size_name || '') + ' | 尺寸 ' + (r.size_W_cm || '') + 'x' + (r.size_H_cm || '') + 'cm | 包装 ' + (r.package_L_cm || '') + 'x' + (r.package_W_cm || '') + 'x' + (r.package_H_cm || '') + ' | 重 ' + (r.weight_g || '') + 'g | 零售¥' + (r.retail_price || ''));
      });
      return;
    }

    if (action === 'update' || action === 'modify') {
      if (!a2) { console.log('用法: db update <id> --status synced --notes "..."'); return; }
      const patch = {};
      for (const [ck, col] of Object.entries(SHARED_MAP)) if (opts[ck] != null && opts[ck] !== '') patch[col] = opts[ck];
      const ok = repo.update(a2, patch);
      console.log(ok ? '✅ 已更新 ' + a2 + '（共享字段）' : '未找到 id=' + a2);
      return;
    }

    if (action === 'delete' || action === 'remove' || action === 'del') {
      if (!a2) { console.log('用法: db delete <id>'); return; }
      const n = repo.remove(a2);
      console.log('✅ 已删除 ' + a2 + (n ? '（' + n + ' 条规格行）' : '（未找到）'));
      return;
    }

    if (action === 'admin' || action === 'dashboard') {
      const config = this.app.make('config');
      const products = repo.products();
      const file = renderAdmin({ records: products, merchant: config.merchant, htmlDir: config.pagesDir, htmlFile: 'manage.html', title: '产品管理后台' });
      console.log('✅ 管理后台: ' + file + ' | 访问 /manage.html 共 ' + products.length + ' 个商品');
      console.log('  📄 商品详情统一用 /product.html?id=<id> 模板（pages/product.html）');
      return;
    }

    console.log('未知子命令: ' + action + '。可用: list/get/update/delete/admin');
  }
}
module.exports = { DbCommand };
