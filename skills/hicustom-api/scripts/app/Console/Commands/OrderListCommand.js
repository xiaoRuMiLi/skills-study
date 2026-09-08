'use strict';
/**
 * OrderListCommand — order:list
 * GET /api/v1/orders 近180天订单列表（可筛状态/时间）。
 * 用法: order:list [--page 1] [--page-size 20] [--status -1|-2|3|5|8|9|7] [--created-from "2022-01-01 00:00:00"] [--created-to ...]
 */
class OrderListCommand {
  constructor(app) { this.app = app; this.signature = 'order:list'; this.description = '订单列表(近180天)'; this.usage = '[--page 1] [--page-size 20] [--status -1|-2|3|5|8|9|7] [--created-from ...] [--created-to ...]'; }
  async handle(opts) {
    const order = this.app.make('order');
    console.log('========== order:list ==========');
    try {
      const r = await order.list({ page: opts.page, pageSize: opts.pageSize, status: opts.status, createdFrom: opts.createdFrom, createdTo: opts.createdTo });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      const list = d.data || [];
      console.log('第 ' + d.current_page + '/' + d.last_page + ' 页 | 共 ' + d.total + ' 单 | 本页 ' + list.length + ' 单\n');
      for (const it of list) {
        const items = it.item || [];
        console.log('  [' + it.order_id + '] ' + (it.out_order_id || '') + ' | ' + it.status + '(' + order.statusLabel(it.status) + ') | ￥' + it.grand_total + ' | ' + items.length + '项/' + it.total_qty_ordered + '件 | ' + (it.created || ''));
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { OrderListCommand };
