'use strict';
/**
 * ProductCategoriesCommand — product:categories
 * GET /api/v1/product-type-categories 空白产品分类（树状；响应里子分类键为 subCg）。
 */
class ProductCategoriesCommand {
  constructor(app) { this.app = app; this.signature = 'product:categories'; this.description = '空白产品分类(树状)'; this.usage = ''; }
  async handle() {
    const product = this.app.make('product');
    console.log('========== product:categories ==========');
    try {
      const r = await product.categories();
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const list = Array.isArray(r.data) ? r.data : [];
      const walk = (items, depth) => {
        for (const it of items || []) {
          console.log('  '.repeat(depth) + '- [' + it.id + '] ' + it.name + (it.count != null ? ' (' + it.count + ')' : ''));
          const sub = it.subCg || it.sub_cg;
          if (sub && sub.length) walk(sub, depth + 1);
        }
      };
      walk(list, 0);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { ProductCategoriesCommand };
