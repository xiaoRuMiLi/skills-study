'use strict';
// @ts-nocheck
/**
 * inventory — 库存健康：getInventorySummaries 汇总 + 评分；seed 用 createInventoryItem 播种（动态沙盒）。
 */
module.exports = function createInventoryModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr, num } = format;
  const SUM_OP = 'getInventorySummaries';
  const SEED_OP = 'createInventoryItem';

  async function summary(opts) {
    hr('库存健康');
    const sandbox = env.isSandbox();
    const mp = opts.marketplace || env.marketplace();
    if (!mp) { console.log('缺少 marketplaceId：用 --marketplace 传，或在 .env 设 SP_API_MARKETPLACE_IDS。'); return; }

    const query = { granularityType: 'Marketplace', granularityId: mp, marketplaceIds: mp, details: 'true' };
    const r = await callOp(SUM_OP, { query });
    const items = ctx.unwrap(r.data).inventorySummaries || [];
    let ok = 0, low = 0, out = 0, totalQty = 0;
    for (const it of items) {
      totalQty += num(it.totalQuantity != null ? it.totalQuantity : it.availableQuantity);
      const sellable = num(it.inventoryDetails && it.inventoryDetails.sellableQuantity != null ? it.inventoryDetails.sellableQuantity : it.availableQuantity);
      if (sellable <= 0) out++;
      else if (sellable < (num(opts.bufferDays) || 15) * 0.5) low++;
      else ok++;
    }
    console.log('市场: ' + mp + ' | SKU 数: ' + items.length + ' | 总库存量: ' + totalQty);
    console.log('健康: ' + ok + ' | 偏低: ' + low + ' | 断货: ' + out);
    console.log('\n(评分阈值在 references/business-logic.md，为运营经验默认值，可覆盖)');
    if (sandbox) console.log('(动态沙盒：先 `inventory seed --sku X --marketplace Y` 播种才有数据)');
  }

  async function seed(opts) {
    hr('沙盒播种库存 (createInventoryItem)');
    const sku = opts.sku, mp = opts.marketplace || env.marketplace(), name = opts.name || ('SKU ' + (sku || ''));
    if (!sku || !mp) { console.log('用法: inventory seed --sku <sellerSku> --marketplace <mp> [--name X]'); return; }
    const body = { sellerSku: sku, marketplaceId: mp, productName: name };
    const r = await callOp(SEED_OP, { body });
    console.log('HTTP ' + r.status + ' -> 已播种 ' + sku + ' (marketplace ' + mp + ')。可用 `inventory summary` 查询。');
  }

  return {
    name: 'inventory',
    title: '库存',
    describe: '库存健康汇总与播种',
    commands: {
      summary: { usage: '--marketplace X', run: summary },
      seed: { usage: '--sku X --marketplace Y [--name N]', run: seed },
    },
  };
};
