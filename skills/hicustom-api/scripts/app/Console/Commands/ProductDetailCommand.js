'use strict';
/**
 * ProductDetailCommand — product:detail
 * GET /api/v1/product-type/{id} 空白产品详情（颜色/尺码/印刷区/价格/批发价/变体）。
 * 用法: product:detail --id 11222
 */
class ProductDetailCommand {
  constructor(app) { this.app = app; this.signature = 'product:detail'; this.description = '空白产品详情'; this.usage = '--id <空白产品id>'; }
  async handle(opts) {
    const product = this.app.make('product');
    console.log('========== product:detail ==========');
    if (!opts.id) { console.log('需要 --id <空白产品id>。'); return; }
    try {
      const r = await product.detail(opts.id);
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      console.log('id: ' + d.id + ' | SPU: ' + d.spu_code + ' | 工厂: ' + d.factory_name);
      console.log('中文名: ' + d.cn_name + ' | 英文名: ' + d.en_name + ' | 别名: ' + d.alias_name);
      console.log('颜色: ' + (d.colors || []).map((c) => (c.cn_name || c.name)).join(', '));
      console.log('尺码: ' + (d.sizes || []).map((s) => s.name).join(', '));
      console.log('印刷区: ' + (d.print_areas || []).map((p) => p.name + ' ' + p.width + 'x' + p.height).join(' | '));
      const price = d.prices || {};
      console.log('最低价(1件): ¥' + price.price + ' | 默认 ' + (price.default_color_name || '') + '/' + (price.default_size_name || ''));
      const wp = (price.wholesale_price || [])[0];
      if (wp) {
        const retail = wp.retail_price || {}; const gold = wp.gold || {}; const black = wp.black_diamond || {}; const star = wp.star_diamond || {};
        console.log('批发: 零售 ¥' + (retail.price || '') + ' | 黄金 ¥' + (gold.price || '') + ' | 黑钻 ¥' + (black.price || '') + ' | 星钻 ¥' + (star.price || '') + (retail.qty_from ? ' (' + retail.qty_from + '~' + retail.qty_to + '件)' : ''));
      }
      console.log('变体数: ' + ((d.stock_info || []).length) + ' | 印刷技术: ' + d.product_technology);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { ProductDetailCommand };
