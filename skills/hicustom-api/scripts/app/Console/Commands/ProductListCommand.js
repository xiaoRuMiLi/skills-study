'use strict';
/**
 * ProductListCommand — product:list
 * GET /api/v1/product-types 空白产品列表（分页）。
 * 用法: product:list [--page 1] [--page-size 20] [--cid 分类id] [--lowest-cids 1]
 */
class ProductListCommand {
  constructor(app) { this.app = app; this.signature = 'product:list'; this.description = '空白产品列表(分页)'; this.usage = '[--page 1] [--page-size 20] [--cid X] [--lowest-cids 1]'; }
  async handle(opts) {
    const product = this.app.make('product');
    console.log('========== product:list ==========');
    try {
      const r = await product.list({ page: opts.page, pageSize: opts.pageSize, cid: opts.cid, lowestCids: opts.lowestCids });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      const list = d.data || [];
      console.log('第 ' + d.current_page + '/' + d.last_page + ' 页 | 共 ' + d.total + ' 条 | 本页 ' + list.length + ' 条\n');
      for (const it of list) {
        console.log('  [' + it.id + '] ' + (it.cn_name || '') + '  /  ' + (it.en_name || '') + '  分类:' + (it.categories || []).map((c) => c.id).join(','));
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { ProductListCommand };
