'use strict';
// @ts-nocheck
/**
 * restock — 补货建议（业务层，纯 SP-API 聚合）。
 *   库存(getInventorySummaries) + 日均销量(velocity) -> 每个 SKU 的补货量与健康评分。
 * 日销 velocity 来源（--velocity-source）：
 *   manual (默认) : --velocity <每日件数> 或 --velocity-json "SKU:N,..."
 *   orders        : 自动从 getOrders -> getOrderItems 聚合近 N 天单位数（限 --max-orders 控量）
 */
module.exports = function createRestockModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr, num } = format;
  const SUM_OP = 'getInventorySummaries';
  const ORDERS_OP = 'getOrders';
  const ITEMS_OP = 'getOrderItems';

  function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }

  // 从订单聚合每日单位数（SKU -> 单位/天）；限 maxOrders 控量，页间 sleep 限流
  async function velocityFromOrders({ mp, days, sandbox, maxOrders }) {
    const q = sandbox ? { MarketplaceIds: 'ATVPDKIKX0DER', CreatedAfter: 'TEST_CASE_200' }
                      : { MarketplaceIds: mp, CreatedAfter: daysAgo(days), MaxResultsPerPage: '100' };
    const r = await callOp(ORDERS_OP, { query: q });
    const orders = ctx.unwrap(r.data).Orders || [];
    const units = {};
    const limit = Math.min(maxOrders || 20, orders.length);
    for (let i = 0; i < limit; i++) {
      const od = orders[i];
      const itr = await callOp(ITEMS_OP, { pathParams: { orderId: od.AmazonOrderId || od.amazonOrderId } });
      const items = ctx.unwrap(itr.data).OrderItems || [];
      for (const it of items) {
        const sku = it.SellerSKU || it.sku || 'N/A';
        units[sku] = (units[sku] || 0) + num(it.QuantityOrdered != null ? it.QuantityOrdered : it.quantity);
      }
      await new Promise((res) => setTimeout(res, 300));   // 页间限流
    }
    const vel = {};
    for (const [sku, u] of Object.entries(units)) vel[sku] = u / days;
    if (limit < orders.length) console.log('(订单超过 ' + limit + '，已截断按前 ' + limit + ' 单估算)');
    return { vel, ordersProcessed: Math.min(limit, orders.length) };
  }

  async function suggest(opts) {
    hr('补货建议');
    const sandbox = env.isSandbox();
    const mp = opts.marketplace || env.marketplace();
    if (!mp) { console.log('需要 --marketplace <X>。'); return; }
    const targetDays = num(opts.targetDays) || 30;
    const safetyDays = num(opts.safetyDays) || 14;
    const redundantDays = num(opts.redundantDays) || 90;
    const filterSku = opts.sku;
    const src = opts.velocitySource || 'manual';
    const days = num(opts.days) || targetDays;

    let vel = {}, uniform = 0, autoNote = '';
    if (src === 'orders') {
      const auto = await velocityFromOrders({ mp, days, sandbox, maxOrders: num(opts.maxOrders) || 20 });
      vel = auto.vel; autoNote = '自动(orders, 近' + days + '天, 处理' + auto.ordersProcessed + '单)';
    } else {
      if (opts.velocityJson) { for (const pair of opts.velocityJson.split(',')) { const [sku, v] = pair.split(':'); if (sku && v) vel[sku.trim()] = num(v); } }
      uniform = num(opts.velocity);
      autoNote = '手动';
    }

    const r = await callOp(SUM_OP, { query: { granularityType: 'Marketplace', granularityId: mp, marketplaceIds: mp, details: 'true' } });
    const items = ctx.unwrap(r.data).inventorySummaries || [];
    console.log('市场: ' + mp + ' | SKU 数: ' + items.length + ' | 目标备货 ' + targetDays + '天 / 安全线 ' + safetyDays + '天 | 日销来源: ' + autoNote + '\n');

    let shown = 0;
    for (const it of items) {
      const sku = it.sellerSku || it.sku || 'N/A';
      if (filterSku && sku !== filterSku) continue;
      const sellable = num(it.inventoryDetails && it.inventoryDetails.sellableQuantity != null ? it.inventoryDetails.sellableQuantity : it.availableQuantity);
      const inbound = num(it.inventoryDetails && it.inventoryDetails.inboundWorkingQuantity);
      const daily = (vel[sku] || 0) || uniform;
      const coverDays = daily > 0 ? sellable / daily : Infinity;
      let status, icon;
      if (sellable <= 0) { status = '断货'; icon = '🔴'; }
      else if (daily > 0 && coverDays < safetyDays) { status = '偏低'; icon = '🟠'; }
      else if (daily > 0 && coverDays > redundantDays) { status = '冗余'; icon = '⚪'; }
      else { status = '健康'; icon = '🟢'; }
      const needed = daily > 0 ? Math.max(0, Math.ceil(targetDays * daily - sellable - inbound)) : null;
      shown++;
      console.log('  ' + icon + ' ' + sku.padEnd(18) + ' 可售' + sellable + '/在途' + inbound + ' | ' + (daily > 0 ? daily + ' 件/天' : '(无日销)') + ' | 可撑' + (isFinite(coverDays) ? Math.round(coverDays) + '天' : 'N/A') + ' | ' + status + ' | ' + (needed != null ? '建议补 ' + needed + ' 件' : '—'));
    }
    if (!shown) console.log('(无 SKU 数据。动态沙盒先 `inventory seed`；日销 source=orders 需订单数据)');
    console.log('\n(日销来源: manual(--velocity/-json) 或 orders(--velocity-source orders)；阈值为运营经验默认值，可覆盖)');
  }

  return {
    name: 'restock',
    title: '补货',
    describe: '补货建议：库存+日销(手输或自动) -> 补货量与健康评分',
    commands: {
      suggest: { usage: '--marketplace X [--velocity N|--velocity-json "SKU:N"] [--velocity-source orders] [--days N] [--target-days N] [--safety-days N] [--sku X]', run: suggest },
    },
  };
};
