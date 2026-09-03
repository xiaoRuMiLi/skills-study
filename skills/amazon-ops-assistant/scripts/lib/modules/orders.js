'use strict';
// @ts-nocheck
/**
 * orders — 订单看板 / 明细。
 */
const fs = require('fs');
const path = require('path');

module.exports = function createOrdersModule(ctx) {
  const { callOp, spec, env, format, parse } = ctx;
  const { hr, money } = format;
  const OP = 'getOrders';

  // 静态沙盒用例：getOrders 只有精确传这些参数才返回 mock 数据（多一个参数都不匹配）
  const SANDBOX_CASE = { MarketplaceIds: 'ATVPDKIKX0DER', CreatedAfter: 'TEST_CASE_200' };

  function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }

  async function dashboard(opts) {
    hr('订单看板');
    const sandbox = env.isSandbox();
    const mp = opts.marketplace || env.marketplace();

    let query, displayMarket, label, note = '';
    if (sandbox) {
      query = { ...SANDBOX_CASE };
      displayMarket = 'ATVPDKIKX0DER (沙盒 mock)';
      label = 'TEST_CASE_200';
      note = '\n(静态沙盒返回预置 mock 数据，非真实店铺；生产环境才返回真实订单)';
    } else {
      if (!mp) { console.log('缺少 marketplaceId：用 --marketplace 传，或在 .env 设 SP_API_MARKETPLACE_IDS。'); return; }
      const days = Number(opts.days) || 7;
      query = { MarketplaceIds: mp, CreatedAfter: daysAgo(days), MaxResultsPerPage: '100' };
      displayMarket = mp;
      label = (Number(opts.days) || 7) + ' 天';
    }

    const r = await callOp(OP, { query });
    const payload = ctx.unwrap(r.data);
    const orders = payload.Orders || payload.orders || [];
    let total = 0, returns = 0;
    const byStatus = {};
    for (const od of orders) {
      total += format.num(od.OrderTotal && od.OrderTotal.Amount);
      const st = od.OrderStatus || od.orderStatus || 'N/A';
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (String(od.OrderStatus || '').toUpperCase() === 'CANCELED') returns++;
    }
    console.log('市场: ' + displayMarket + ' | ' + label + ' 订单数: ' + orders.length + ' | 订单总额: ' + money(total));
    console.log('状态分布: ' + JSON.stringify(byStatus));
    console.log('取消/退货(粗略): ' + returns);
    console.log('\nNextToken: ' + (payload.NextToken || '无') + '（有则需继续分页）');
    if (note) console.log(note);
  }

  async function single(opts) {
    hr('单个订单');
    const id = opts.orderId;
    if (!id) { console.log('用法: orders single --orderId <orderId>'); return; }
    const r = await callOp('getOrder', { pathParams: { orderId: id } });
    const payload = ctx.unwrap(r.data);
    console.log(JSON.stringify(payload, null, 2).slice(0, 3000));
  }

  async function items(opts) {
    hr('订单明细');
    const id = opts.orderId;
    if (!id) { console.log('用法: orders items --orderId <orderId>'); return; }
    const r = await callOp('getOrderItems', { pathParams: { orderId: id } });
    const payload = ctx.unwrap(r.data);
    const list = payload.OrderItems || [];
    console.log('订单 ' + id + ' 明细 ' + list.length + ' 条:');
    for (const it of list) {
      const t = it.ItemPrice && it.ItemPrice.Amount;
      console.log('  - ' + (it.SellerSKU || it.sku || 'N/A') + ' x' + it.QuantityOrdered + ' @ ' + money(t, it.ItemPrice && it.ItemPrice.CurrencyCode));
    }
  }

  // CSV 字段转义
  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  // 待发货订单 + 明细：getOrders(Unshipped) → 逐单 getOrderItems（SKU/数量/金额）
  async function toShip(opts) {
    hr('待发货订单 (Unshipped)');
    const sandbox = env.isSandbox();
    const mp = opts.marketplace || env.marketplace();
    if (!mp) { console.log('需要 --marketplace <X>。'); return; }
    const days = format.num(opts.days) || 7;
    const maxOrders = format.num(opts.maxOrders) || 10;
    const exportFile = opts.export;   // 如 --export shipping-orders.csv

    const q = sandbox ? { MarketplaceIds: 'ATVPDKIKX0DER', OrderStatuses: 'Unshipped', CreatedAfter: 'TEST_CASE_200' }
                      : { MarketplaceIds: mp, OrderStatuses: 'Unshipped', LastUpdatedAfter: daysAgo(days), MaxResultsPerPage: '100' };
    const r = await callOp('getOrders', { query: q });
    const orders = ctx.unwrap(r.data).Orders || [];
    const limit = Math.min(maxOrders, orders.length);
    console.log('待发货订单 ' + orders.length + ' 条（近 ' + (sandbox ? 'TEST_CASE' : days + ' 天') + '，前 ' + limit + ' 单明细）\n');

    const rows = [['OrderId', 'OrderDate', 'Status', 'SKU', 'Quantity', 'ASIN', 'Title', 'UnitPrice', 'Currency', 'OrderTotal', 'Currency2']];
    for (let i = 0; i < limit; i++) {
      const od = orders[i];
      const itr = await callOp('getOrderItems', { pathParams: { orderId: od.AmazonOrderId || od.amazonOrderId } });
      const items = ctx.unwrap(itr.data).OrderItems || [];
      const total = format.num(od.OrderTotal && od.OrderTotal.Amount);
      const totalCur = (od.OrderTotal && od.OrderTotal.CurrencyCode) || '';
      console.log('📦 订单 ' + (od.AmazonOrderId || '?') + '  [' + (od.OrderStatus || '?') + ']  ' + (od.PurchaseDate || '') + '  总额 ' + money(total));
      for (const it of items) {
        const cur = it.ItemPrice && it.ItemPrice.CurrencyCode;
        const price = format.num(it.ItemPrice && it.ItemPrice.Amount);
        console.log('     - SKU ' + String(it.SellerSKU || it.sku || '?').padEnd(20) + ' x' + (it.QuantityOrdered != null ? it.QuantityOrdered : it.quantity) + '  ' + (it.ASIN || '') + '  ' + money(price, cur) + '  ' + String(it.Title || '').slice(0, 42));
        rows.push([
          od.AmazonOrderId || '', od.PurchaseDate || '', od.OrderStatus || '',
          it.SellerSKU || it.sku || '', it.QuantityOrdered != null ? it.QuantityOrdered : (it.quantity || ''),
          it.ASIN || '', it.Title || '', price, cur || '', total, totalCur,
        ]);
      }
      if (i < limit - 1) await new Promise((res) => setTimeout(res, 350));   // 页间限流
    }

    if (exportFile) {
      const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
      fs.writeFileSync(exportFile, '\uFEFF' + csv, 'utf8');   // 加 BOM 便于 Excel 识别 UTF-8
      console.log('\n✅ 已导出 CSV: ' + path.resolve(exportFile) + ' (' + (rows.length - 1) + ' 行数据)');
    }
    console.log('\n(数量/金额/ASIN = 明细；发货地址/买家PII 需 RDT)');
    if (!orders.length) console.log('近 ' + days + ' 天无待发货订单。');
  }

  // 发货地址（受限：需 Restricted Data Token，基础客户端未内置 RDT 会失败，仅作提示）
  async function address(opts) {
    hr('订单发货地址 (getOrderAddress · 需 RDT)');
    const id = opts.orderId;
    if (!id) { console.log('需要 --orderId <id>。'); return; }
    try {
      const r = await callOp('getOrderAddress', { pathParams: { orderId: id } });
      const p = ctx.unwrap(r.data);
      const a = p.ShippingAddress || {};
      console.log('订单 ' + id + ' 地址: ' + (a.Name || '') + ' / ' + (a.AddressLine1 || '') + ' ' + (a.City || '') + ' ' + (a.PostalCode || '') + ' ' + (a.CountryCode || ''));
    } catch (e) {
      console.log('获取地址失败（很可能需 Restricted Data Token / 受限授权）：' + (e.message || e));
    }
  }

  // 标记发货 + 物流单号（confirmShipment，写操作）
  async function markShipped(opts) {
    hr('标记发货 (confirmShipment)');
    const sandbox = env.isSandbox();
    const orderId = opts.orderId || opts.id;
    const carrier = opts.carrier;        // carrierCode，如 UPS / DHL / Royal Mail；其他要 --carrier-name
    const tracking = opts.tracking || opts.trackingNumber;
    const mp = opts.marketplace || env.marketplace();
    if (!orderId || !carrier || !tracking || !mp) { console.log('用法: orders mark-shipped --orderId <id> --carrier <code> --tracking <单号> [--items "orderItemId:qty,..."] [--carrier-name N] [--ship-date ISO] [--dry-run] [--yes]'); return; }
    const shipDate = opts.shipDate || new Date().toISOString();
    const packageRef = opts.packageRef || ('PKG-' + orderId);

    // orderItems：优先 --items，否则自动 getOrderItems 取 orderItemId+数量
    let orderItems = [];
    if (opts.items) {
      orderItems = opts.items.split(',').map((p) => { const [id, qty] = p.trim().split(':'); return { orderItemId: id, quantity: Number(qty) }; }).filter((x) => x.orderItemId);
    } else {
      const itr = await callOp('getOrderItems', { pathParams: { orderId } });
      const list = ctx.unwrap(itr.data).OrderItems || [];
      orderItems = list.map((it) => ({ orderItemId: it.OrderItemId, quantity: it.QuantityOrdered != null ? it.QuantityOrdered : it.quantity }));
      console.log('自动取订单项 ' + orderItems.length + ' 条。');
    }

    const packageDetail = { packageReferenceId: packageRef, carrierCode: carrier, trackingNumber: tracking, shipDate, orderItems };
    if (opts.carrierName) packageDetail.carrierName = opts.carrierName;
    if (opts.shippingMethod) packageDetail.shippingMethod = opts.shippingMethod;
    const body = { marketplaceId: mp, packageDetail };

    console.log('订单 ' + orderId + ' | 承运商 ' + carrier + ' | 单号 ' + tracking + ' | 发货时间 ' + shipDate);
    if (opts.dryRun) { console.log('\n[DRY-RUN] 预览请求体（未提交）：\n' + JSON.stringify(body, null, 2)); return; }
    if (opts.yes !== true && opts.yes !== 'true') { console.log('\n写操作，加 --yes 确认后执行。或用 --dry-run 预览。'); return; }
    const r = await callOp('confirmShipment', { pathParams: { orderId }, body });
    console.log('\nHTTP ' + r.status + ' -> ' + (r.status < 300 ? '✅ 已标记发货' : '失败'));
    if (r.status >= 400) console.log(JSON.stringify(r.data, null, 2).slice(0, 1500));
    if (sandbox) console.log('(静态沙盒可能不返回真实发货结果，建议生产实测)');
  }

  return {
    name: 'orders',
    title: '订单',
    describe: '订单看板与明细',
    commands: {
      dashboard: { usage: '[--days N] [--marketplace X]', run: dashboard },
      'to-ship': { usage: '[--days N] [--marketplace X] [--max-orders N] [--export ship.csv]', run: toShip },
      single: { usage: '--orderId <id>', run: single },
      items: { usage: '--orderId <id>', run: items },
      address: { usage: '--orderId <id>', run: address },
      'mark-shipped': { usage: '--orderId <id> --carrier <code> --tracking <单号> [--items "id:qty"] [--carrier-name N] [--dry-run] [--yes]', run: markShipped },
    },
  };
};
