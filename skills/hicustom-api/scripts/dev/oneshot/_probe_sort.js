'use strict';
const { bootstrap } = require('../../core/bootstrap');
const app = bootstrap().app;
const http = app.make('http');
const ep = http.config.endpoints.productTypes;
const first = (d) => (d && d.data && d.data[0] && d.data[0].id);
(async () => {
  const base = await http.get(ep, { query: { page: 1, page_size: 3 } });
  console.log('baseline page1 first id =', first(base.data), '| total', base.data.total, 'per_page', base.data.per_page);

  const combos = [
    { sort: 'id', order: 'desc' }, { order: 'desc' }, { order: 'DESC' },
    { sort: 'desc' }, { desc: 1 }, { sort: 'id', direction: 'desc' },
    { order_by: 'id', order_type: 'desc' }, { sort_type: 'desc' },
  ];
  for (const c of combos) {
    try {
      const r = await http.get(ep, { query: Object.assign({ page: 1, page_size: 3 }, c) });
      const fid = first(r.data);
      console.log(JSON.stringify(c), '=> first id', fid, fid >= 12000 ? '  <== 倒序生效!' : '');
    } catch (e) { console.log(JSON.stringify(c), '=> ERR', e.message); }
  }

  // 单页最大条数
  for (const s of [100, 200, 500]) {
    try { const r = await http.get(ep, { query: { page: 1, page_size: s } }); console.log('page_size=' + s, '=> 返回', (r.data.data || []).length, 'per_page', r.data.per_page); }
    catch (e) { console.log('page_size=' + s, 'ERR', e.message); }
  }
})().catch(e => console.log('ERR', e.message));
