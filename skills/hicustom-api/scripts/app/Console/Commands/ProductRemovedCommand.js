'use strict';
/**
 * ProductRemovedCommand — product:removed
 * GET /api/v1/product-type-remove/list 近一个月下架的空白产品 id 列表。
 */
class ProductRemovedCommand {
  constructor(app) { this.app = app; this.signature = 'product:removed'; this.description = '近一个月下架的空白产品id列表'; this.usage = ''; }
  async handle() {
    const product = this.app.make('product');
    console.log('========== product:removed ==========');
    try {
      const r = await product.removed();
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const list = Array.isArray(r.data) ? r.data : [];
      console.log('近一个月下架空白产品 ' + list.length + ' 个：');
      console.log('  ' + list.join(', '));
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { ProductRemovedCommand };
