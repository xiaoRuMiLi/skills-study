'use strict';
/** 测：商家后台调用是否串行 + 节流 + 留痕 */
const { bootstrap } = require('../../core/bootstrap');
(async () => {
  const app = bootstrap().app;
  const cg = app.make('customerGallery');
  const t0 = Date.now();
  for (let i = 1; i <= 3; i++) {
    const s = Date.now();
    const r = await cg.list({ page: 1, pageSize: 5 });
    console.log('第 ' + i + ' 次调用: 耗时 ' + (Date.now() - s) + 'ms  累计 ' + (Date.now() - t0) + 'ms  返回条数 ' + r.list.length);
  }
  const mhttp = require('../../app/Support/MerchantHttp').getMerchantHttp(app.make('config'));
  console.log('\n最近调用日志（' + mhttp.logFile + '）:');
  mhttp.recent(5).forEach((r) => console.log('  ' + r.ts + '  ' + r.method + ' ' + r.path + '  -> ' + (r.status || r.error) + '  ' + r.ms + 'ms'));
})();
