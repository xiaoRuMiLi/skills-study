'use strict';
const { bootstrap } = require('../../core/bootstrap');
const app = bootstrap().app;
(async () => {
  const product = app.make('product');
  const r = await product.list({ page: 1, pageSize: 3 });
  const d = r.data || {};
  console.log('HTTP', r.status, 'code', r.code, '| total', d.total, 'last_page', d.last_page, 'per_page', d.per_page);
  const it = (d.data || [])[0] || {};
  console.log('item keys:', Object.keys(it).join(', '));
  console.log('first item:', JSON.stringify(it).slice(0, 900));
  // 看是否有图片相关字段
  const imgKeys = Object.keys(it).filter(k => /img|image|pic|cover|thumb|url/i.test(k));
  console.log('image-like keys:', imgKeys.join(', ') || '(无)');
})().catch(e => console.log('ERR', e.message));
