'use strict';
// 离线自测：mock 掉全局 fetch，验证 bootstrap->容器->鉴权->图库->命令 全链路。
const fs = require('fs');
const path = require('path');

// 1) 环境
process.env.HICUSTOM_APP_KEY = 'APPKEY_TEST';
process.env.HICUSTOM_APP_SECRET = 'APPSECRET_TEST';
process.env.HICUSTOM_REFRESH_TOKEN = 'REFRESH_TEST';
process.env.HICUSTOM_TOKEN_CACHE = path.join(__dirname, '..', '.hicustom', 'token.test.json');

// 2) mock fetch（按 pathname 精确分派）
const calls = [];
function mockJSON(obj) { return { ok: true, status: 200, text: async () => JSON.stringify(obj) }; }
globalThis.fetch = async (url, init = {}) => {
  const u = url.toString();
  const method = (init.method || 'GET').toUpperCase();
  const pathname = new URL(u).pathname;
  const q = new URL(u).searchParams;
  if (pathname === '/oauth/refresh-token') {
    return mockJSON({ status: 'success', code: 200, data: { access_token: 'AT_REFRESHED', expires_in: 7200, refresh_token: 'RT_NEW', refresh_token_expires_in: 172800 } });
  }
  if (pathname === '/oauth/token' || pathname === '/oauth/access-token') {
    return mockJSON({ status: 'success', code: 200, data: { access_token: 'AT_FIRST', expires_in: 7200, refresh_token: 'RT_FIRST', refresh_token_expires_in: 172800 } });
  }
  if (pathname === '/api/v1/gallery-categories') {
    calls.push({ type: 'categories', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: [ { id: 1, name: '精选好图' }, { id: 2, name: '人物', sub_cg: [{ id: 3, name: '明星' }] } ] });
  }
  if (pathname === '/api/v1/galleries') {
    calls.push({ type: 'list', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { data: [{ code: '4DZ6ZS', name: '壁纸', created: '2022-01-17 18:50:34', design_img: 'https://x/500.png' }], total: 1, per_page: 20, current_page: 1, last_page: 1 } });
  }
  if (pathname === '/api/v1/gallery' && method === 'POST') {
    const isFd = init.body && init.body.get;
    calls.push({ type: 'upload', token: isFd ? init.body.get('access_token') : null, hasImage: isFd ? !!init.body.get('image') : false });
    return mockJSON({ status: 'success', code: 200, msg: '操作成功', data: { code: 'P7Q2QY', cn_name: '徽章', created: '2022-01-17 19:41:13', preview_img: 'https://x/150.png', design_img: 'https://x/500.png', size: { width: 1920, height: 1536 } } });
  }
  if (pathname.startsWith('/api/v1/gallery/')) {
    const code = pathname.split('/').pop();
    if (method === 'PATCH') {
      const isUrl = init.body && init.body.get;
      calls.push({ type: 'edit', code, urlencoded: isUrl, hasToken: isUrl ? !!init.body.get('access_token') : false, cnName: isUrl ? init.body.get('cn_name') : null });
      return mockJSON({ status: 'success', code: 200, msg: '操作成功', data: { code, cn_name: '徽章', en_name: 'Badge', cn_tags: '徽章,复古', modified: '2022-01-17 19:00:00', type: 9 } });
    }
    calls.push({ type: 'detail', code });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { code, name: '壁纸', tags: '', created: '2022-01-17 18:50:34', design_img: 'https://x/500.png', preview_img: 'https://x/150.png', size: { width: 1920, height: 1536 }, type: 9, categorys: [{ id: 1 }] } });
  }
  if (pathname === '/api/v1/product-types') {
    calls.push({ type: 'productList', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { total: 753, per_page: 20, current_page: 1, last_page: 38, data: [{ id: 11783, cn_name: '三重开关面板', en_name: 'Triple switch siding', categories: [{ id: 26 }, { id: 42 }] }, { id: 11812, cn_name: '毛绒抱枕套（双面设计）', en_name: 'Throw Pillow Case', categories: [{ id: 26 }] }] } });
  }
  if (pathname === '/api/v1/product-type-categories') {
    calls.push({ type: 'productCats', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: [{ id: 1, name: '服装', subCg: [{ id: 2, name: '短袖T恤', subCg: [{ id: 3, name: '男装', count: 1 }], count: 2 }], count: 2 }] });
  }
  if (pathname.startsWith('/api/v1/product-type/')) {
    calls.push({ type: 'productDetail', id: decodeURIComponent(pathname.split('/').pop()) });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { id: 11222, spu_code: 'F6040', factory_name: '泽翠', cn_name: '苹果12钢化玻璃手机壳', en_name: 'iPhone12 glass case', colors: [{ id: 30, cn_name: '白色', en_name: 'White', tone1: '#FFFFFF' }], sizes: [{ id: 315, name: 'IP12-6.1' }, { id: 311, name: 'IP12mini-5.4' }], print_areas: [{ id: 1, name: 'A面', width: 638, height: 1229 }], product_technology: 'UV印花', prices: { price: '5.36', default_color_name: '白色', default_size_name: 'IP12mini-5.4', wholesale_price: [{ retail_price: { qty_from: 1, qty_to: 4, price: '6.31' }, gold: { price: '5.36' }, black_diamond: { price: '4.43' }, star_diamond: { price: '4.32' } }] }, stock_info: [{ id: 8859, color_id: 30, size_id: 311 }] } });
  }
  if (pathname === '/api/v1/product-type-remove/list') {
    calls.push({ type: 'productRemoved', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: [10000, 11246, 11247, 11248] });
  }
  if (pathname === '/api/v1/products') {
    calls.push({ type: 'designList', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { data: [{ code: 'HXMKTJ6S', cn_name: '4个成人褶裥防尘口罩', product_type_id: 11273, image: 'https://x/150.jpg', created: '2022-01-24 10:23:58' }, { code: 'JUY8DW3I', cn_name: '铜钱虎 抱枕套', product_type_id: 11398, image: 'https://x/150.jpg', created: '2022-01-15 14:32:29' }], total: 589, per_page: 20, current_page: 1, last_page: 30 } });
  }
  if (pathname.startsWith('/api/v1/product/')) {
    const code = decodeURIComponent(pathname.split('/').pop());
    calls.push({ type: 'designDetail', code, token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { code, cn_name: '铜钱虎 抱枕套', en_name: 'Tiger pillow', product_type_id: 11398, default_color_id: 30, default_view_id: 1, view_cnt: 1, default_gallery_code: 'A2JNYR', design_zh_name: '铜钱虎', design_zh_tags: '新年,老虎', colors: [{ id: 30, cn_name: '白色' }], sizes: [{ id: 138, name: '12x12' }, { id: 140, name: '20x20' }], stock_info: [{ id: 5717, color_id: 30, size_id: 138, sku: '#P7SQOLCQqWfF7GI' }], created: '2022-01-15 14:32:29' } });
  }
  if (pathname === '/api/v1/order' && method === 'POST') {
    const isUrl = init.body && init.body.get;
    calls.push({ type: 'orderCreate', token: isUrl ? init.body.get('access_token') : null, outOrderId: isUrl ? init.body.get('out_order_id') : null, itemsJson: isUrl ? init.body.get('order_items') : null });
    return mockJSON({ status: 'success', code: 200, msg: '操作成功', data: { order_id: 'O96485573922030312117', out_order_id: 'O20220303111', status: -2, grand_total: '11.20', currency_code: 1, total_qty_ordered: 1 } });
  }
  if (pathname === '/api/v1/orders') {
    calls.push({ type: 'orderList', token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { total: 1, per_page: 20, current_page: 1, last_page: 1, data: [{ order_id: 'O96485573922030312117', out_order_id: 'O20220303111', status: -2, grand_total: '11.20', created: '2022-03-03 17:40:57', item: [{ product_name: '男士短袖T恤', qty: 1 }] }] } });
  }
  if (pathname.startsWith('/api/v1/order/')) {
    const id = decodeURIComponent(pathname.split('/').pop());
    calls.push({ type: 'orderDetail', id, token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { order_id: id, out_order_id: 'O20220303111', status: 9, grand_total: '11.20', total_qty_ordered: 1, item: [{ product_name: '男士短袖T恤', qty: 1, product_code: 'ABC', sku: '#123' }], logistic_info: { logistics_company_name: 'DHL', shipping_track_number: 'DHL123456', shipping_time: '2022-03-05 10:00:00' }, address: { country: 'US', region: 'WA', city: 'Seattle', street: '1 Main St', postcode: '98117', firstname: 'John' } } });
  }
  if (pathname.startsWith('/api/v1/out-order-id/')) {
    const id = decodeURIComponent(pathname.split('/').pop());
    calls.push({ type: 'orderByOutId', id, token: q.get('access_token') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: [{ order_id: 'O96485573922030312117', out_order_id: id, store_id: 180819283, status: 9, grand_total: '11.20', created: '2022-03-03 17:40:57', item: [{ product_name: '男士短袖T恤', qty: 1, product_code: 'ABC', sku: '#123' }], logistic_info: { logistics_company_name: 'DHL', shipping_track_number: 'DHL123456' }, error_msg: '' }] });
  }
  if (pathname === '/api/v1/common/order_item_production_info' && method === 'POST') {
    // json 请求，access_token 在 query
    calls.push({ type: 'orderItemProduction', token: q.get('access_token'), body: init.body });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: [{ out_item_id: '46469477602024060310041', out_order_id: 'PONX342029202406031004', product_name: 'QQ爬爬服', product_code: 'ORP9ROF8', qty: 1, size: '2T', color: '黑色', production_items: [{ production_item_code: 'QQcode4', single_codes: ['S-1SE5Z-0'] }] }] });
  }
  if (pathname === '/api/v1/common/trade_record') {
    calls.push({ type: 'tradeList', token: q.get('access_token'), createdRange: q.get('created_range') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { total: 1, page: 1, page_size: 20, list: [{ pay_title: '订单支付', order_num: 'T123', trade_no: 'TX1', pay_type_name: '订单支付', payway_name: '账号余额', total_fee: '11.20', balance: '100', pay_status_name: '已付款', arrival_time: '2022-03-03 17:40:57', store_name: '我的店', sku: '#123', asin: 'B0' }] } });
  }
  if (pathname === '/api/v1/product-preview') {
    calls.push({ type: 'designPreview', token: q.get('access_token'), cfgs: q.get('cfgs'), pid: q.get('product_type_id') });
    return mockJSON({ status: 'success', code: 200, msg: 'ok', data: { cn_name: '免费定制 男款卫衣', en_name: 'Free Customization', product_type_id: '11774', default_color_id: '29', default_view_id: '1', default_gallery_code: 'YNQF8A', view_cnt: 2, design_zh_name: '免费定制', colors: [{ id: 29, cn_name: '黑色', renderings: [{ small_img: 'https://x/500.jpg', big_img: 'https://x/1200.jpg' }] }], sizes: [{ id: 1, name: 'M' }] } });
  }
  return mockJSON({ status: 'error', code: 500, msg: 'unexpected ' + u });
};

// 3) 造一张测试 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const tmpImage = path.join(__dirname, '..', '.hicustom', 'test-img.png');
fs.mkdirSync(path.dirname(tmpImage), { recursive: true });
fs.writeFileSync(tmpImage, PNG);

// 4) bootstrap
const { bootstrap } = require('./core/bootstrap');
const { app, router } = bootstrap();
const cachePath = app.make('config').tokenCachePath;

let ok = 0, bad = 0;
const c = (l, x) => { console.log((x ? '  OK ' : '  XX ') + l); x ? ok++ : bad++; };

(async () => {
  console.log('--- token:get ---');
  await router.dispatch(['token:get']);
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  c('token 缓存已写入 access_token', !!cache.access_token);
  c('token 缓存有 refresh_token', !!cache.refresh_token);

  console.log('\n--- gallery:categories ---');
  await router.dispatch(['gallery:categories']);
  const cat = calls.find((x) => x.type === 'categories');
  c('categories 请求带 access_token 查询参数', !!cat && !!cat.token);

  console.log('\n--- gallery:upload ---');
  await router.dispatch(['gallery:upload', '--file', tmpImage, '--cn-name', '徽章', '--en-name', 'badge']);
  const up = calls.find((x) => x.type === 'upload');
  c('upload 请求是 multipart 且含 image', !!up && up.hasImage);
  c('upload 表单中含 access_token', !!up && !!up.token);

  console.log('\n--- gallery:list / detail / edit ---');
  await router.dispatch(['gallery:list', '--page', '1', '--page-size', '20']);
  const gl = calls.find((x) => x.type === 'list');
  c('list 请求带 access_token 查询参数', !!gl && !!gl.token);

  await router.dispatch(['gallery:detail', '--code', '4DZ6ZS']);
  const gd = calls.find((x) => x.type === 'detail');
  c('detail 路径含 code=4DZ6ZS', !!gd && gd.code === '4DZ6ZS');

  await router.dispatch(['gallery:edit', '--code', '4DZ6ZS', '--cn-name', '徽章']);
  const ge = calls.find((x) => x.type === 'edit');
  c('edit 为 x-www-form-urlencoded 请求体', !!ge && ge.urlencoded);
  c('edit 请求体含 access_token + cn_name', !!ge && ge.hasToken && ge.cnName === '徽章');

  console.log('\n--- product:list / categories / detail ---');
  await router.dispatch(['product:list', '--page', '1', '--page-size', '20']);
  c('product:list 请求带 access_token', !!calls.find((x) => x.type === 'productList').token);
  await router.dispatch(['product:categories']);
  c('product:categories 请求带 access_token', !!calls.find((x) => x.type === 'productCats').token);
  await router.dispatch(['product:detail', '--id', '11222']);
  const pd = calls.find((x) => x.type === 'productDetail');
  c('product:detail 路径含 id=11222', !!pd && pd.id === '11222');
  await router.dispatch(['product:removed']);
  c('product:removed 请求带 access_token', !!calls.find((x) => x.type === 'productRemoved').token);

  console.log('\n--- design:list / detail ---');
  await router.dispatch(['design:list', '--page', '1', '--page-size', '20']);
  c('design:list 请求带 access_token', !!calls.find((x) => x.type === 'designList').token);
  await router.dispatch(['design:detail', '--code', 'JUY8DW3I']);
  const dd = calls.find((x) => x.type === 'designDetail');
  c('design:detail 路径含 code=JUY8DW3I', !!dd && dd.code === 'JUY8DW3I');
  await router.dispatch(['design:preview', '--product-type-id', '11774', '--cfgs', '[{"view_id":1,"gallery_code":"YNQF8A","width":1000,"height":1000,"top_x":0,"top_y":0}]']);
  const dp = calls.find((x) => x.type === 'designPreview');
  c('design:preview 请求带 access_token + product_type_id', !!dp && !!dp.token && dp.pid === '11774');
  c('design:preview cfgs 转成 JSON 字符串', !!dp && !!dp.cfgs && dp.cfgs.indexOf('\"gallery_code\"') >= 0);

  console.log('\n--- order:create / list / detail ---');
  const orderPayload = { out_order_id: 'AMZ-114-1000000', store_id: 180819283, currency_code: 1, address: { country: 'US', region: 'WA', city: 'Seattle', street: '1 Main St', postcode: '98117', firstname: 'John' }, order_items: [{ product_code: 'JUY8DW3I', stock_item_id: 5717, qty: 1, out_item_id: '38690465723298' }] };
  await router.dispatch(['order:create', '--payload', JSON.stringify(orderPayload)]);
  const oc = calls.find((x) => x.type === 'orderCreate');
  c('order:create 为 urlencoded 且含 access_token', !!oc && !!oc.token);
  c('order:create 含 out_order_id', !!oc && oc.outOrderId === 'AMZ-114-1000000');
  let itemsJson = oc && oc.itemsJson;
  c('order:create 的 order_items 是 JSON 字符串', !!(itemsJson && (function(){ try { JSON.parse(itemsJson); return true; } catch(e){ return false; } })()));
  await router.dispatch(['order:list', '--page', '1', '--page-size', '20']);
  c('order:list 请求带 access_token', !!calls.find((x) => x.type === 'orderList').token);
  await router.dispatch(['order:detail', '--order-id', 'O96485573922030312117']);
  const od = calls.find((x) => x.type === 'orderDetail');
  c('order:detail 路径含 order_id', !!od && od.id === 'O96485573922030312117');
  await router.dispatch(['order:by-out-id', '--out-order-id', '114-1000000-1000000']);
  c('order:by-out-id 路径含 out_order_id', !!calls.find((x) => x.type === 'orderByOutId') && calls.find((x) => x.type === 'orderByOutId').id === '114-1000000-1000000');
  await router.dispatch(['order:item-production', '--out-item-ids', '46469477602024060310041,GHJXIZ-1']);
  c('order:item-production 请求带 access_token', !!calls.find((x) => x.type === 'orderItemProduction').token);

  console.log('\n--- trade:list ---');
  await router.dispatch(['trade:list', '--page', '1', '--page-size', '20', '--from', '2022-01-01 00:00:00', '--to', '2022-01-31 23:59:59']);
  const tl = calls.find((x) => x.type === 'tradeList');
  c('trade:list 请求带 access_token', !!tl && !!tl.token);
  c('trade:list created_range 转成 JSON 字符串', !!tl && !!tl.createdRange && tl.createdRange.indexOf('"from"') >= 0);

  console.log('\n--- error:describe / list ---');
  const { describe } = require('./app/Support/ErrorCatalog');
  c('错误码 2104 → 凭证错误', describe(2104).indexOf('client') >= 0);
  c('错误码 1000 → 请求失败', describe(1000).indexOf('请求失败') >= 0);
  await router.dispatch(['error:describe', '--code', '2104']);
  await router.dispatch(['error:list', '--grep', 'access_token']);

  console.log('\n--- list ---');
  await router.dispatch(['list']);

  // 清理缓存文件（保留 skill 干净）
  try { fs.unlinkSync(cachePath); fs.unlinkSync(tmpImage); } catch (e) {}

  console.log('\n结果: ' + ok + ' 通过, ' + bad + ' 失败');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
