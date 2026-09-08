'use strict';
/**
 * OrderDetailCommand — order:detail
 * GET /api/v1/order/{order_id} 订单详情（含物流/地址/变体）。
 * 用法: order:detail --order-id O96485573922030312117
 * 物流单号在 data.logistic_info.shipping_track_number（回填亚马逊发货用）。
 */
class OrderDetailCommand {
  constructor(app) { this.app = app; this.signature = 'order:detail'; this.description = '订单详情(含物流/地址)'; this.usage = '--order-id <平台订单号>'; }
  async handle(opts) {
    const order = this.app.make('order');
    console.log('========== order:detail ==========');
    if (!opts.orderId) { console.log('需要 --order-id <平台订单号>。'); return; }
    try {
      const r = await order.detail(opts.orderId, { queryWeightVolume: opts.queryWeightVolume });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      console.log('订单号: ' + d.order_id + (d.out_order_id ? ' | 商户: ' + d.out_order_id : ''));
      console.log('状态: ' + d.status + ' (' + order.statusLabel(d.status) + ') | 总金额: ' + d.grand_total + ' | 件数: ' + d.total_qty_ordered);
      if (d.error_msg) console.log('⚠️ ' + d.error_msg);
      const items = d.item || [];
      console.log('\n商品 ' + items.length + ' 项：');
      for (const it of items) console.log('  - ' + (it.product_name || '') + ' x' + it.qty + ' | 定制code ' + (it.product_code || '') + ' | sku ' + (it.sku || '') + ' | ￥' + it.total);
      const li = d.logistic_info || {};
      if (li.shipping_track_number || li.logistics_company_name) {
        console.log('\n物流: ' + (li.logistics_company_name || '') + ' | 跟踪号 ' + (li.shipping_track_number || '') + ' | ' + (li.shipping_time || ''));
      } else {
        console.log('\n物流: (暂无物流信息，订单未发货)');
      }
      const a = d.address || {};
      if (a.country) console.log('地址: ' + (a.country || '') + ' ' + (a.region || '') + ' ' + (a.city || '') + ' ' + (a.street || '') + ' ' + (a.postcode || '') + ' | ' + (a.firstname || ''));
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { OrderDetailCommand };
