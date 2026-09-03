'use strict';
// @ts-nocheck
/**
 * pricing — 定价助手：getPricing（自己报价）/ getCompetitivePricing（竞品价）。
 */
module.exports = function createPricingModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr, money, num } = format;

  function normPricePayload(payload) {
    const list = payload.Price || [];
    return list.map((p) => ({
      sku: p.SellerSKU || p.SKU || 'N/A',
      asin: p.ASIN || 'N/A',
      condition: p.Condition || 'N/A',
      price: num(p.Price && p.Price.Amount),
      currency: (p.Price && p.Price.CurrencyCode) || 'USD',
      method: p.IsBuyBoxWinner ? 'BuyBox(🎯)' : 'other',
    }));
  }

  async function price(opts) {
    hr('报价查询 (getPricing)');
    const mp = opts.marketplace || env.marketplace();
    if (!mp) { console.log('需要 --marketplace。'); return; }
    const itemType = opts.itemType || (opts.asin || opts.skus ? (opts.asin ? 'Asin' : 'Sku') : 'Sku');
    const query = { MarketplaceId: mp, ItemType: itemType };
    if (opts.asin) query.Asins = opts.asin;
    if (opts.skus) query.Skus = opts.skus;
    const r = await callOp('getPricing', { query });
    const rows = normPricePayload(ctx.unwrap(r.data));
    if (!rows.length) { console.log('无报价返回。'); return; }
    for (const row of rows) {
      console.log('  ' + (row.method).padEnd(10) + ' ' + row.sku.padEnd(16) + ' ' + row.asin.padEnd(12) + ' ' + money(row.price, row.currency));
    }
  }

  async function competitive(opts) {
    hr('竞品价 (getCompetitivePricing)');
    const mp = opts.marketplace || env.marketplace();
    if (!mp) { console.log('需要 --marketplace。'); return; }
    const itemType = opts.itemType || (opts.asin ? 'Asin' : 'Sku');
    const query = { MarketplaceId: mp, ItemType: itemType };
    if (opts.asin) query.Asins = opts.asin;
    if (opts.skus) query.Skus = opts.skus;
    const r = await callOp('getCompetitivePricing', { query });
    const payload = ctx.unwrap(r.data);
    const rows = (payload.Price || []).map((p) => ({
      asin: p.ASIN || 'N/A',
      condition: p.Condition || 'N/A',
      buyBox: num(p.Price && p.Price.Amount),
      currency: (p.Price && p.Price.CurrencyCode) || 'USD',
    }));
    for (const row of rows) {
      console.log('  ' + row.asin.padEnd(14) + ' ' + row.condition.padEnd(10) + ' buyBox ' + money(row.buyBox, row.currency));
    }
  }

  return {
    name: 'pricing',
    title: '定价',
    describe: '自己报价 / 竞品价',
    commands: {
      price: { usage: '--marketplace X [--asin A|--skus S]', run: price },
      competitive: { usage: '--marketplace X [--asin A|--skus S]', run: competitive },
    },
  };
};
