'use strict';
const path = require('path');
const HOST = 'C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api';
const { bootstrap } = require(path.join(HOST, 'scripts/core/bootstrap'));
const { app } = bootstrap();
const product = app.make('product');
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' 超时')), ms))]);

(async () => {
  // 先拿一批商品 id
  const r = await product.list({ page: 1, pageSize: 20 });
  const items = (r.data && r.data.data) || [];
  const found = [];
  for (const it of items.slice(0, 6)) {
    try {
      const d = await withTimeout(product.detail(it.id), 12000, 'detail-' + it.id);
      const dd = d.data || {};
      const pdesc = dd.product_description || {};
      const printAreas = (pdesc.print_areas || []).length;
      const colors = (dd.colors || []).length, sizes = (dd.sizes || []).length, variants = (dd.stock_info || []).length;
      found.push({ id: dd.id, name: dd.cn_name, spu: dd.spu_code, colors, sizes, variants, printAreas, release: dd.release_time, score: variants * (colors + sizes) * (printAreas || 1) });
    } catch (e) { console.log('跳过 ' + it.id + ': ' + e.message); }
  }
  found.sort((a, b) => b.score - a.score);
  console.log('扫描 ' + found.length + ' 个，按复杂度排序：\n');
  found.forEach((f) => console.log('  ' + String(f.id).padEnd(8) + (f.name || '').slice(0, 18).padEnd(20) + '颜色' + f.colors + ' 尺码' + f.sizes + ' 变体' + f.variants + ' 面' + f.printAreas + ' 发布' + (f.release || '').slice(0, 10) + ' 得分' + f.score));
})().catch((e) => { console.error('ERR', e); process.exit(1); });
