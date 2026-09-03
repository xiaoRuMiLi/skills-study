'use strict';
// @ts-nocheck
/**
 * sales — 销售表现（Sales API，同步）。
 *   overview : 近 N 天订单/单位/销售额（getOrderMetrics，可按天拆分）
 */
module.exports = function createSalesModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr, num, money } = format;
  const OP = 'getOrderMetrics';

  function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function intervalFor(days) {
    const end = new Date();
    const start = new Date(Date.now() - days * 864e5);
    return iso(start) + '--' + iso(end);
  }

  async function overview(opts) {
    hr('销售表现 (getOrderMetrics)');
    const mp = opts.marketplace || env.marketplace();
    if (!mp) { console.log('需要 --marketplace <X>。'); return; }
    const days = num(opts.days) || 7;
    const granularity = opts.granularity || 'Day';    // Day / Total
    const query = { marketplaceIds: mp, interval: intervalFor(days), granularity, buyerType: 'All' };
    if (opts.sku) query.sku = opts.sku;               // 按 SKU 过滤（单个）
    if (opts.asin) query.asin = opts.asin;            // 按 ASIN 过滤（单个）
    const scope = opts.sku ? ('SKU=' + opts.sku) : (opts.asin ? ('ASIN=' + opts.asin) : '全部商品');

    const r = await callOp(OP, { query });
    // 生产：payload 即 OrderMetricsList（== 数组）；兼容对象结构
    const payload = ctx.unwrap(r.data);
    const list = Array.isArray(payload) ? payload : (payload.OrderMetricsInterval || []);
    console.log('市场: ' + mp + ' | 近 ' + days + ' 天 (' + granularity + (scope !== '全部商品' ? ' | ' + scope : '') + ')\n');
    if (r.status >= 400) { console.log('(HTTP ' + r.status + ') ' + JSON.stringify(r.data).slice(0, 300)); return; }
    if (!list.length) { console.log('(无数据)'); return; }
    let totOrders = 0, totUnits = 0, totSales = 0, totCur = 'USD';
    for (const m of list) {
      totOrders += num(m.orderCount);
      totUnits += num(m.unitCount);
      const amt = num(m.totalSales && (m.totalSales.Amount != null ? m.totalSales.Amount : m.totalSales.amount));
      const cur = m.totalSales && (m.totalSales.CurrencyCode || m.totalSales.currencyCode);
      if (cur) totCur = cur;
      totSales += amt;
      console.log('  ' + String(m.interval).padEnd(26) + ' 订单 ' + num(m.orderCount) + ' | 单位 ' + num(m.unitCount) + ' | 销售额 ' + money(amt, cur));
    }
    const avgPrice = totUnits ? totSales / totUnits : 0;
    console.log('\n───────── 合计 ─────────');
    console.log('  订单 ' + totOrders + ' | 单位 ' + totUnits + ' | 销售额 ' + money(totSales, totCur) + ' | 件均 ' + money(avgPrice, totCur));
  }

  return {
    name: 'sales',
    title: '销售',
    describe: '销售表现：近 N 天订单/单位/销售额',
    commands: {
      overview: { usage: '[--days N] [--granularity Day|Total] [--marketplace X] [--sku X|--asin A]', run: overview },
    },
  };
};
