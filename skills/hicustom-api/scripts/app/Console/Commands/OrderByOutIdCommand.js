'use strict';
/**
 * OrderByOutIdCommand — order:by-out-id
 * GET /api/v1/out-order-id/{out_order_id} 商户订单号查订单详情（可多单，data 为数组）。
 * 用法: order:by-out-id --out-order-id 114-1000000-1000000 [--store-id X]
 */
class OrderByOutIdCommand {
  constructor(app) { this.app = app; this.signature = 'order:by-out-id'; this.description = '按商户订单号查订单详情'; this.usage = '--out-order-id <商户单号> [--store-id X]'; }
  async handle(opts) {
    const order = this.app.make('order');
    console.log('========== order:by-out-id ==========');
    if (!opts.outOrderId) { console.log('需要 --out-order-id <商户单号>。'); return; }
    try {
      const r = await order.detailByOutOrderId(opts.outOrderId, { storeId: opts.storeId, queryWeightVolume: opts.queryWeightVolume });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const list = Array.isArray(r.data) ? r.data : [];
      console.log('商户单号 ' + opts.outOrderId + ' 匹配 ' + list.length + ' 单：\n');
      for (const d of list) {
        console.log('订单: ' + d.order_id + ' | 店铺 ' + d.store_id + ' | 状态 ' + d.status + '(' + order.statusLabel(d.status) + ') | ￥' + d.grand_total + ' | ' + d.created);
        if (d.error_msg) console.log('  ⚠️ ' + d.error_msg);
        for (const it of (d.item || [])) console.log('  - ' + (it.product_name || '') + ' x' + it.qty + ' | code ' + (it.product_code || '') + ' | sku ' + (it.sku || '') + ' | ￥' + (it.total || it.price));
        const li = d.logistic_info || {};
        console.log('  物流: ' + (li.logistics_company_name || '-') + ' | 跟踪号 ' + (li.shipping_track_number || '-') + (li.shipping_time ? ' | ' + li.shipping_time : ''));
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { OrderByOutIdCommand };
