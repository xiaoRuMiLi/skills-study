'use strict';
/**
 * 清理：删除本次实验在商家图库留下的测试上传。
 * 用法: node scripts/dev/lab/_p7-cleanup.js [--dry] CODE1,CODE2,...
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const cookie = env.HICUSTOM_MERCHANT_COOKIE || '';
const BASE = 'https://www.hicustom.com';
const H = { cookie: cookie, 'user-agent': 'Mozilla/5.0', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json,*/*' };
const P = (o) => new URLSearchParams(o).toString();
const post = async (u, body) => {
  const r = await fetch(BASE + u, { method: 'POST', headers: Object.assign({}, H, { 'content-type': 'application/x-www-form-urlencoded' }), body: P(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { }
  return { status: r.status, j: j, t: t };
};

(async () => {
  const dry = process.argv.includes('--dry');
  const codes = process.argv.filter((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
    .join(',').split(',').map((s) => s.trim()).filter(Boolean);
  if (!codes.length) { console.log('用法: node _p7-cleanup.js [--dry] CODE1,CODE2,...'); return; }
  console.log('待清理图库码(' + codes.length + '): ' + codes.join(', '));

  // 1) 找 id
  const found = [];
  for (let page = 1; page <= 5 && found.length < codes.length; page++) {
    const r = await post('/merchant/customerGallery/index', { page: page, pageSize: 50 });
    const list = (r.j && r.j.data && r.j.data.data) || [];
    for (const it of list) if (codes.indexOf(it.code) >= 0) found.push({ id: it.id, code: it.code, name: it.customer_alias_name || it.name });
    if (!list.length) break;
  }
  console.log('命中 ' + found.length + '/' + codes.length + ':');
  found.forEach((f) => console.log('  id=' + f.id + ' [' + f.code + '] ' + String(f.name).slice(0, 30)));
  const missing = codes.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) console.log('未找到(可能已删/不在前 5 页): ' + missing.join(', '));
  if (!found.length || dry) { if (dry) console.log('[dry] 不执行删除'); return; }

  // 2) 试删除（先探参数名）
  const ids = found.map((f) => f.id);
  for (const key of ['ids', 'id', 'gallery_ids']) {
    const r = await post('/merchant/customerGallery/batchdelete', { [key]: ids.join(',') });
    console.log('  尝试 ' + key + ' -> HTTP ' + r.status + ' ' + JSON.stringify(r.j || r.t.slice(0, 120)).slice(0, 200));
    if (r.j && (r.j.status === 1000 || r.j.code === 'success')) { console.log('  ✅ 删除接口参数名 = ' + key); break; }
  }

  // 3) 回收站彻底删除
  const r2 = await post('/merchant/customerGallery/deleterecycle', { ids: ids.join(',') });
  console.log('  回收站清理 -> ' + JSON.stringify(r2.j || r2.t.slice(0, 120)).slice(0, 200));

  // 4) 复核
  await new Promise((s) => setTimeout(s, 1500));
  let still = [];
  for (let page = 1; page <= 5; page++) {
    const r = await post('/merchant/customerGallery/index', { page: page, pageSize: 50 });
    const list = (r.j && r.j.data && r.j.data.data) || [];
    for (const it of list) if (codes.indexOf(it.code) >= 0) still.push(it.code);
    if (!list.length) break;
  }
  console.log('复核：仍存在 ' + still.length + (still.length ? ' -> ' + still.join(',') : ' ✅ 已全部清理'));
})();
