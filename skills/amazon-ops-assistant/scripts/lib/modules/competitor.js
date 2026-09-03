'use strict';
// @ts-nocheck
/**
 * competitor — 竞品监控（business 层）。
 *   watch : 对一组 ASIN 调 getCompetitivePricing，解析 Buy Box 价/竞品价区间，
 *           若提供 --my-price 则对比并给出定价建议。
 * 数据：payload.Price[] 每条含 CompetitivePrices[]（CompetitivePriceId=1 为 New Buy Box）。
 */
module.exports = function createCompetitorModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr, num, money } = format;
  const OP = 'getCompetitivePricing';

  async function watch(opts) {
    hr('竞品监控 (getCompetitivePricing)');
    const mp = opts.marketplace || env.marketplace();
    const asins = (opts.asins || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!mp || !asins.length) { console.log('需要 --marketplace X --asins "A,B,C"。'); return; }
    const myPrice = opts.myPrice ? num(opts.myPrice) : null;

    const query = { MarketplaceId: mp, ItemType: 'Asin', Asins: asins.slice(0, 20).join(',') };
    const r = await callOp(OP, { query });
    const rows = ctx.unwrap(r.data).Price || [];

    for (const item of rows) {
      const asin = item.ASIN || item.asin || 'N/A';
      const comps = item.CompetitivePrices || [];
      let buyBox = null, min = Infinity, max = -Infinity, sellerCount = 0;
      for (const c of comps) {
        const amt = num(c.Price && c.Price.Amount);
        const cur = (c.Price && c.Price.CurrencyCode) || 'USD';
        if (amt > 0) {
          if (Array.isArray(c.Condition)) c.Condition = c.Condition[0];
          if (!min || amt < min) min = amt;
          if (amt > max) max = amt;
          sellerCount++;
          if (String(c.CompetitivePriceId) === '1') buyBox = { amt, cur };   // New Buy Box
        }
      }
      if (!comps.length) { console.log('  ' + asin + '  (无竞品报价)'); continue; }
      const boxStr = buyBox ? money(buyBox.amt, buyBox.cur) : 'N/A';
      const rangeStr = (isFinite(min) || isFinite(max)) ? ('$' + (isFinite(min) ? min.toFixed(2) : '?') + ' ~ ' + money(isFinite(max) ? max : 0)) : 'N/A';
      let verdict = '';
      if (myPrice != null && buyBox) {
        const diff = ((myPrice - buyBox.amt) / buyBox.amt * 100);
        verdict = diff <= 0 ? (' | 你价比 Buy Box 低 ' + Math.abs(diff).toFixed(1) + '%（' + (diff < -10 ? '可能偏低价' : '') + '）')
                            : (' | 你价比 Buy Box 高 ' + diff.toFixed(1) + '%（' + (diff > 15 ? '可能偏高，关注转化' : '') + '）');
      }
      console.log('  ' + asin.padEnd(14) + ' BuyBox ' + boxStr + ' | 竞品区间 ' + rangeStr + ' | 卖家数 ' + sellerCount + verdict);
    }
    if (!rows.length) console.log('(无竞品价返回。沙盒 pricing 无成功用例，生产才有数据)');
    if (myPrice != null) console.log('\n(对比基准: 你价 ' + money(myPrice) + ')');
  }

  return {
    name: 'competitor',
    title: '竞品',
    describe: '竞品监控：Buy Box 价/竞品区间/定价对比',
    commands: {
      watch: { usage: '--marketplace X --asins "A,B,C" [--my-price N]', run: watch },
    },
  };
};
