'use strict';
/**
 * TradeListCommand — trade:list
 * GET /api/v1/common/trade_record 商户端交易记录（按时间范围，默认到账升序）。
 * 用法: trade:list --page 1 --page-size 20 [--type 1] [--payway 1] [--pay-status 9] [--order-num X] [--trade-no X] [--from "2022-01-01 00:00:00"] [--to "2022-01-31 23:59:59"] [--arrival-from ...] [--arrival-to ...] [--pay-currency 1]
 */
class TradeListCommand {
  constructor(app) { this.app = app; this.signature = 'trade:list'; this.description = '交易记录查询'; this.usage = '--page 1 --page-size 20 [--type N] [--payway N] [--pay-status N] [--order-num X] [--from ..] [--to ..]'; }
  async handle(opts) {
    const trade = this.app.make('trade');
    console.log('========== trade:list ==========');
    try {
      const r = await trade.records({
        page: opts.page, pageSize: opts.pageSize, type: opts.type, payway: opts.payway, payStatus: opts.payStatus,
        orderNum: opts.orderNum, tradeNo: opts.tradeNo, payCurrency: opts.payCurrency,
        createdFrom: opts.from, createdTo: opts.to, arrivalFrom: opts.arrivalFrom, arrivalTo: opts.arrivalTo,
        customerIds: opts.customerIds ? String(opts.customerIds).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      const list = d.list || [];
      console.log('第 ' + d.page + ' 页 | 共 ' + d.total + ' 条 | 本页 ' + list.length + ' 条\n');
      for (const it of list) {
        console.log('  [' + it.arrival_time + '] ' + (it.pay_title || '') + ' | 类型 ' + it.pay_type_name + ' | 方式 ' + it.payway_name + ' | ￥' + it.total_fee + ' | 状态 ' + it.pay_status_name + ' | 余额 ' + it.balance);
        if (it.order_from_id || it.sku || it.asin) console.log('      单号 ' + (it.order_from_id || '') + (it.sku ? ' sku ' + it.sku : '') + (it.asin ? ' asin ' + it.asin : '') + ' | 店 ' + (it.store_name || ''));
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { TradeListCommand };
