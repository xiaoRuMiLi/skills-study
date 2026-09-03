'use strict';
// @ts-nocheck
/**
 * fulfillment — FBA 履约（Fulfillment Outbound API，官方；沙盒为 Dynamic）。
 *   preview: getFulfillmentPreview  预览可履约方案
 *   list   : listAllFulfillmentOrders 列全部履约订单
 *   get    : getFulfillmentOrder     查单个（sellerFulfillmentOrderId 路径）
 *   cancel : cancelFulfillmentOrder  取消履约
 *   create : createFulfillmentOrder  创建履约订单（写，需 --yes）
 * create/return body 遵循官方 CreateFulfillmentOrderRequest，用 --body-json 传入（不猜字段）。
 */
module.exports = function createFulfillmentModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr } = format;

  function mp(opts) { return opts.marketplace || env.marketplace(); }

  function parseBody(json) {
    if (!json) return null;
    try { return JSON.parse(json); } catch (e) { throw new Error('--body-json 不是合法 JSON'); }
  }

  async function preview(opts) {
    hr('履约预览 (getFulfillmentPreview)');
    const body = parseBody(opts.bodyJson);
    if (!body) { console.log('需要 --body-json \'{...官方 GetFulfillmentPreviewRequest...}\'。'); return; }
    const r = await callOp('getFulfillmentPreview', { body });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '成功' : '失败'));
    console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 2500));
  }

  async function list(opts) {
    hr('履约订单列表 (listAllFulfillmentOrders)');
    const r = await callOp('listAllFulfillmentOrders', { query: opts.queryStartDate ? { queryStartDate: opts.queryStartDate } : {} });
    const p = ctx.unwrap(r.data);
    const orders = p.fulfillmentOrders || [];
    console.log('履约订单 ' + orders.length + ' 条:');
    for (const o of orders) console.log('  - ' + o.sellerFulfillmentOrderId + '  [' + o.fulfillmentOrderStatus + ']');
    if (p.nextToken) console.log('\nnextToken: ' + p.nextToken + '（需继续分页）');
  }

  async function get(opts) {
    hr('查履约订单 (getFulfillmentOrder)');
    const id = opts.orderId || opts.id;
    if (!id) { console.log('需要 --orderId <sellerFulfillmentOrderId>。'); return; }
    const r = await callOp('getFulfillmentOrder', { pathParams: { sellerFulfillmentOrderId: id } });
    console.log('HTTP ' + r.status);
    console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 2500));
  }

  async function cancel(opts) {
    hr('取消履约 (cancelFulfillmentOrder)');
    const id = opts.orderId || opts.id;
    if (!id) { console.log('需要 --orderId <sellerFulfillmentOrderId>。'); return; }
    const r = await callOp('cancelFulfillmentOrder', { pathParams: { sellerFulfillmentOrderId: id } });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '已请求取消' : '失败'));
  }

  async function create(opts) {
    hr('创建履约订单 (createFulfillmentOrder)');
    const body = parseBody(opts.bodyJson);
    if (!body) { console.log('需要 --body-json \'{...官方 CreateFulfillmentOrderRequest...}\' 与 --yes。'); return; }
    if (opts.yes !== true && opts.yes !== 'true') { console.log('这是写操作，加 --yes 确认后执行。'); return; }
    const r = await callOp('createFulfillmentOrder', { body });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '已创建' : '失败'));
    if (r.status >= 400) console.log(JSON.stringify(r.data, null, 2).slice(0, 1500));
  }

  return {
    name: 'fulfillment',
    title: 'FBA履约',
    describe: 'FBA 履约：预览/列表/查询/创建/取消',
    commands: {
      preview: { usage: '--body-json <json>', run: preview },
      list: { usage: '[--queryStartDate <iso>]', run: list },
      get: { usage: '--orderId <sellerFulfillmentOrderId>', run: get },
      cancel: { usage: '--orderId <sellerFulfillmentOrderId>', run: cancel },
      create: { usage: '--body-json <CreateFulfillmentOrderRequest> --yes', run: create },
    },
  };
};
