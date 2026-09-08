'use strict';
/**
 * OrderCreateCommand — order:create
 * POST /api/v1/order 创建订单。
 * 用法: order:create --payload '<json>'  或  --payload-file <order.json>
 * payload 顶层字段按文档（http://xiaoyaoji.cn/project/1jPL8Hr5Xf7/1jUCjXS9TCC）：
 *   out_order_id/store_id/currency_code/address{...}/order_items[{product_code,stock_item_id,qty,...}]/remark/order_time...
 */
const fs = require('fs');

class OrderCreateCommand {
  constructor(app) { this.app = app; this.signature = 'order:create'; this.description = '创建订单'; this.usage = '--payload <json> | --payload-file <order.json>'; }
  async handle(opts) {
    const order = this.app.make('order');
    console.log('========== order:create ==========');
    let payload;
    try {
      if (opts.payloadFile) payload = JSON.parse(fs.readFileSync(opts.payloadFile, 'utf8'));
      else if (opts.payload) payload = JSON.parse(opts.payload);
      else { console.log('需要 --payload \'<json>\' 或 --payload-file <order.json>。'); return; }
    } catch (e) { console.log('❌ payload 解析失败: ' + e.message); return; }
    try {
      const r = await order.create(payload);
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '') + '\n' + JSON.stringify(r.raw).slice(0, 300)); return; }
      const d = r.data || {};
      console.log('✅ 订单已创建');
      console.log('  平台订单号: ' + d.order_id + (d.out_order_id ? ' | 商户单号: ' + d.out_order_id : ''));
      console.log('  状态: ' + d.status + ' (' + order.statusLabel(d.status) + ')');
      console.log('  总金额: ' + d.grand_total + ' (币种' + d.currency_code + ') | 件数: ' + d.total_qty_ordered);
      if (d.error_msg) console.log('  ⚠️ ' + d.error_msg);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { OrderCreateCommand };
