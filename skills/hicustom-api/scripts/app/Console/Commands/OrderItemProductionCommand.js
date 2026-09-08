'use strict';
/**
 * OrderItemProductionCommand — order:item-production
 * POST /api/v1/common/order_item_production_info 已发货订单项的 生产项/单件码。
 * 用法: order:item-production --out-item-ids "id1,id2"
 */
class OrderItemProductionCommand {
  constructor(app) { this.app = app; this.signature = 'order:item-production'; this.description = '商户订单项生产信息(单件码)'; this.usage = '--out-item-ids "id1,id2"'; }
  async handle(opts) {
    const order = this.app.make('order');
    console.log('========== order:item-production ==========');
    if (!opts.outItemIds) { console.log('需要 --out-item-ids "id1,id2"。'); return; }
    const ids = String(opts.outItemIds).split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const r = await order.itemProductionInfo(ids);
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const list = Array.isArray(r.data) ? r.data : [];
      console.log('返回 ' + list.length + ' 条生产信息：');
      for (const it of list) {
        console.log('\n订单项 ' + it.out_item_id + ' (' + (it.out_order_id || '') + ')');
        console.log('  产品: ' + it.product_name + ' | code ' + it.product_code + ' | x' + it.qty + ' ' + (it.color || '') + '/' + (it.size || '') + ' | sku ' + (it.sku || ''));
        for (const p of (it.production_items || [])) {
          console.log('  生产项 ' + p.production_item_code + ' 单件码: ' + (p.single_codes || []).join(', '));
        }
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { OrderItemProductionCommand };
