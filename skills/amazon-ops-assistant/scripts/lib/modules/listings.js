'use strict';
// @ts-nocheck
/**
 * listings — 改价 / 上架（Listings Items API v2021-08-01，官方）。
 *   putListingsItem  : 全量创建/更新 listings（上架，含属性与价格）
 *   patchListingsItem: JSON-Patch 部分更新（适合纯改价；只支持顶层属性）
 *   deleteListingsItem: 删除
 * 注意：写操作为敏感操作，建议配合人工确认；价格属性路径因产品类型而异，务必以官方文档核对。
 */
module.exports = function createListingsModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr } = format;
  const PUT_OP = 'putListingsItem';
  const PATCH_OP = 'patchListingsItem';
  const DEL_OP = 'deleteListingsItem';

  // 宽松 JSON 解析：兼容 PowerShell 剥引号后的 {a:b,c:d}
  function parseJson(s) {
    try { return JSON.parse(s); } catch (e) { /* fallthrough */ }
    const cleaned = s.replace(/([A-Za-z0-9_-]+)\s*:/g, '"$1":')
      .replace(/:\s*([A-Za-z0-9_.-]+)/g, ':"$1"');
    return JSON.parse(cleaned);
  }

  function requireCommon(opts) {
    const sellerId = opts.sellerId || env.sellerId();
    const sku = opts.sku;
    const mp = opts.marketplace || env.marketplace();
    if (!sellerId || !sku || !mp) {
      console.log('需要 --sellerId <id> --sku <sku> --marketplace <X>；也可在 .env 设 SP_API_SELLER_ID / SP_API_MARKETPLACE_IDS 自动取。');
      return null;
    }
    return { sellerId, sku, mp };
  }

  async function put(opts) {
    hr('上架/全量更新 (putListingsItem)');
    const common = requireCommon(opts);
    if (!common) return;
    const productType = opts.productType;
    const attributesJson = opts.attributes;                 // --attributes '{"title":"..."}'
    if (!productType || !attributesJson) { console.log('需要 --productType <类型> --attributes <json>。--requirements 可选(LISTING/LISTING_PRODUCT_ONLY/LISTING_OFFER_ONLY)。'); return; }
    let attributes; try { attributes = parseJson(attributesJson); } catch (e) { console.log('--attributes 不是合法 JSON。'); return; }
    const body = { productType, attributes };
    if (opts.requirements) body.requirements = opts.requirements;
    const r = await callOp(PUT_OP, { pathParams: { sellerId: common.sellerId, sku: common.sku }, query: { marketplaceIds: common.mp }, body });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '成功' : '失败'));
    if (r.status < 300) console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 1500));
  }

  async function patch(opts) {
    hr('部分更新 (patchListingsItem)');
    const common = requireCommon(opts);
    if (!common) return;
    const productType = opts.productType;
    const path = opts.path;                                 // JSON Pointer，如 /attributes/offer/price
    const valueJson = opts.value;                           // JSON 值（数组）
    if (!productType || !path || !valueJson) { console.log('需要 --productType <类型> --path <pointer> --value "<json>"。'); return; }
    let value; try { value = parseJson(valueJson); } catch (e) { console.log('--value 不是合法 JSON。'); return; }
    const body = { productType, patches: [{ op: opts.op || 'replace', path, value }] };
    const r = await callOp(PATCH_OP, { pathParams: { sellerId: common.sellerId, sku: common.sku }, query: { marketplaceIds: common.mp }, body });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '成功' : '失败'));
    if (r.status < 300) console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 1500));
  }

  // 便捷改价：构造 list_price 的 JSON-Patch（含税市场需 value_with_tax）
  async function price(opts) {
    hr('改价 (patchListingsItem · list_price)');
    const common = requireCommon(opts);
    if (!common) return;
    const amount = opts.amount;
    const currency = opts.currency || 'GBP';
    const vwt = opts.valueWithTax || amount;   // 含税价，UK 默认=含税显示；可 --value-with-tax 区分
    if (!amount) { console.log('需要 --amount <价格> [--currency GBP] [--value-with-tax N]。'); return; }
    const attrPath = opts.path || '/attributes/list_price';   // BLANKET 用 list_price；其他产品类型可能不同
    const value = [{ value: String(amount), value_with_tax: String(vwt), currency, marketplace_id: common.mp }];
    const body = { productType: opts.productType || 'PRODUCT', patches: [{ op: 'replace', path: attrPath, value }] };
    console.log('⚠️ 价格路径默认 ' + attrPath + '；BLANKET 已确认；其他产品类型请在 Product Type 定义核对（常含 value_with_tax）。');
    console.log('目标: SKU ' + common.sku + ' | 改价 ' + amount + ' ' + currency + ' (含税 ' + vwt + ') | 路径 ' + attrPath + ' | productType ' + (opts.productType || 'PRODUCT'));
    if (opts.dryRun) { console.log('\n[DRY-RUN] 预览请求体（未提交）：\n' + JSON.stringify(body, null, 2)); return; }
    if (opts.yes !== true && opts.yes !== 'true') { console.log('\n确认执行? 加 --yes 执行，或 --dry-run 预览。'); return; }
    const r = await callOp(PATCH_OP, { pathParams: { sellerId: common.sellerId, sku: common.sku }, query: { marketplaceIds: common.mp }, body });
    console.log('HTTP ' + r.status + ' | status ' + (ctx.unwrap(r.data).status || r.status) + (r.status < 300 ? '' : ' 失败'));
    if (r.status < 300) console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 1200));
    else console.log(JSON.stringify(r.data, null, 2).slice(0, 1200));
  }

  async function remove(opts) {
    hr('删除上架 (deleteListingsItem)');
    const common = requireCommon(opts);
    if (!common) return;
    const r = await callOp(DEL_OP, { pathParams: { sellerId: common.sellerId, sku: common.sku }, query: { marketplaceIds: common.mp } });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '已删除' : '失败'));
  }

  async function getItem(opts) {
    hr('查上架 (getListingsItem)');
    const common = requireCommon(opts);
    if (!common) return;
    const r = await callOp('getListingsItem', { pathParams: { sellerId: common.sellerId, sku: common.sku }, query: { marketplaceIds: common.mp, includedData: 'summaries,attributes,issues,offers' } });
    const p = ctx.unwrap(r.data);
    console.log('HTTP ' + r.status);
    const sum = (p.summaries || [])[0] || {};
    console.log('SKU ' + common.sku + ' | status ' + (sum.status || p.status || '?') + ' | productType ' + (sum.productType || '?') + ' | itemName ' + (sum.itemName || '?'));
    if (r.status >= 400) console.log('错误: ' + JSON.stringify(r.data).slice(0, 500));
  }

  return {
    name: 'listings',
    title: '上架/改价',
    describe: 'Listings：上架/全量更新、JSON-Patch 改价、删除',
    commands: {
      get: { usage: '--sku <sku> [--sellerId --marketplace]', run: getItem },
      put: { usage: '--sellerId --sku --marketplace --productType --attributes <json> [--requirements]', run: put },
      patch: { usage: '--sellerId --sku --marketplace --productType --path <pointer> --value <json>', run: patch },
      price: { usage: '--sellerId --sku --marketplace --amount N [--currency GBP] [--value-with-tax N] [--path] [--yes]', run: price },
      delete: { usage: '--sellerId --sku --marketplace', run: remove },
    },
  };
};
