'use strict';
/** 测试：缓存里"看着有效但服务端已作废"的 token → 应自动作废并重取 */
const fs = require('fs');
const { bootstrap } = require('../../core/bootstrap');
(async () => {
  const app = bootstrap().app;
  const cfg = app.make('config');
  const p = cfg.tokenCachePath;
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  const bad = 'deadbeef'.repeat(5);
  c.access_token = bad;
  c.expires_at = Date.now() + 3600 * 1000;      // 看着还有 1 小时
  fs.writeFileSync(p, JSON.stringify(c, null, 2));
  console.log('已灌入假 token（有效期显示还有 1h）');
  const http = app.make('http');
  const r = await http.get('/api/v1/galleries', { query: { page: 1, page_size: 1 } });
  console.log('调用结果: code=' + r.code + ' msg=' + (r.msg || ''));
  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log('缓存 token 是否已自动换新: ' + (after.access_token !== bad ? '是 ✅' : '否 ❌'));
})();
