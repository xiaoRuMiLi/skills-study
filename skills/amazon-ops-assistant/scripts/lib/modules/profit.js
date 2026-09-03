'use strict';
// @ts-nocheck
/**
 * profit — 利润测算：取财务流水，聚合商品级净利（营收-佣金-FBA费-退款）。
 */
module.exports = function createProfitModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr, num } = format;
  const OP = 'listFinancialEvents';

  function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }

  async function estimate(opts) {
    hr('利润测算');
    const days = Number(opts.days) || 7;
    const sandbox = env.isSandbox();
    const range = daysAgo(days);

    const r = await callOp(OP, { query: { PostedAfter: range } });
    console.log('财务流水接口: ' + r.resolved.method + ' ' + r.path + '   HTTP ' + r.status);
    const events = ctx.unwrap(r.data).FinancialEvents || {};
    const lists = events.ShipmentEventList || [];

    let revenue = 0, costs = 0, refunds = 0, shipCount = lists.length, refundCount = 0;
    const sumItem = (it) => {
      revenue += num(it.ItemPrice && it.ItemPrice.Amount);
      for (const f of (it.ItemFees || [])) costs += num(f.Amount);
    };
    for (const ev of lists) {
      for (const it of (ev.ShipmentItemList || [])) sumItem(it);
      for (const f of (ev.ShipmentFeeList || [])) costs += num(f.Amount);
    }
    for (const ev of (events.RefundEventList || [])) {
      refundCount++;
      for (const it of (ev.ShipmentItemAdjustmentList || [])) {
        refunds += num(it.ItemPrice && it.ItemPrice.Amount);
        for (const f of (it.ItemFeeAdjustments || [])) costs += num(f.Amount);
      }
    }
    const profit = revenue - costs - refunds;
    console.log('财务事件: 发货 ' + shipCount + ' 条 | 退款 ' + refundCount + ' 条');
    console.log('营业收入: $' + revenue.toFixed(2));
    console.log('费用合计: $' + costs.toFixed(2));
    console.log('退款合计: $' + refunds.toFixed(2));
    console.log('──────────────');
    console.log('净利估算: $' + profit.toFixed(2) + '   (毛利率: ' + (revenue ? (profit / revenue * 100).toFixed(1) : 0) + '%)');
    console.log('\n注：财务事件可能延迟 48h；字段名以规范 definition 为准；此为商品级(不含广告费)粗略净利。');
    if (sandbox) console.log('(沙盒 Finances 无测试用例，可能返回空/400；生产环境才有真实财务流水)');
  }

  return {
    name: 'profit',
    title: '利润',
    describe: '利润测算（净利/毛利率）',
    commands: {
      estimate: { usage: '[--days N]', run: estimate },
      run: { usage: '[--days N]', run: estimate }, // 别名
    },
  };
};
