'use strict';
/** 探测官方 API 是否支持删除图库图片（参数名不明，逐个试） */
const { bootstrap } = require('../../core/bootstrap');
(async () => {
  const app = bootstrap().app;
  const cfg = app.make('config');
  const at = JSON.parse(require('fs').readFileSync(require('path').join(cfg.tokenCachePath), 'utf8')).access_token;
  const post = async (u, body) => {
    const r = await fetch(cfg.baseUrl + u + '?access_token=' + at, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body,
    });
    const t = await r.text();
    console.log(('POST ' + u + '  [' + body + ']').padEnd(70) + ' -> ' + t.slice(0, 130).replace(/\s+/g, ' '));
  };
  const urls = ['/api/v1/gallery/delete', '/api/v1/gallery/batch-delete'];
  const bodies = ['image=NOTEXIST_X', 'code=NOTEXIST_X', 'codes=NOTEXIST_X', 'image[]=NOTEXIST_X', 'id=999999999'];
  for (const u of urls) for (const b of bodies) { try { await post(u, b); } catch (e) { console.log(u, b, 'ERR', e.message); } }
})();
