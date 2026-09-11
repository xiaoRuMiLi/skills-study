'use strict';
/**
 * P0 探针：拉空白产品 12659，核实 2773×3234 的出处在哪个字段；并落一张原始主图供标定。
 * 只读；输出到 scripts/dev/lab/out/
 */
const fs = require('fs');
const path = require('path');
const { bootstrap } = require('../../core/bootstrap');

const LAB = path.join(__dirname, 'out');
fs.mkdirSync(LAB, { recursive: true });

(async () => {
  const app = bootstrap().app;
  const product = app.make('product');
  const id = '12659';
  const r = await product.detail(id);
  if (!r || r.code !== 200) { console.log('❌ 详情失败', r && r.status, r && r.msg); return; }
  const d = r.data || {};
  const pd = d.product_description || {};
  console.log('产品:', d.cn_name, '/', d.en_name, '| spu', d.spu_code);

  const pa = pd.print_areas || d.print_areas || [];
  console.log('\n印刷面 print_areas:', pa.length);
  pa.forEach((f) => console.log('  [面' + f.id + '] ' + (f.name || '') + '  ' + f.width + 'x' + f.height + '  ratio=' + (f.width / f.height).toFixed(4)));

  // 全 JSON 里出现 2773 / 3234 的字段
  const flat = [];
  (function walk(o, p) {
    if (o == null) return;
    if (typeof o !== 'object') { flat.push([p, o]); return; }
    for (const k of Object.keys(o)) walk(o[k], p ? p + '.' + k : k);
  })(d, '');
  console.log('\n含 2773 或 3234 的字段:');
  flat.filter(([k, v]) => /2773|3234/.test(String(v))).forEach(([k, v]) => console.log('  ' + k + ' = ' + v));
  console.log('\n疑似"尺寸/画布"字段:');
  flat.filter(([k]) => /size|width|height|px|area|canvas|design/i.test(k)).slice(0, 40).forEach(([k, v]) => console.log('  ' + k + ' = ' + String(v).slice(0, 80)));

  // 落原始主图（占位版）
  const rinfo = (d.renderings_info || []).map((g, gi) => (g.renderings || []).map((u, ri) => ({ gi, ri, u })).slice(0, 3)).flat();
  console.log('\nrenderings_info 前几个:', rinfo.length);
  for (const it of rinfo) {
    console.log('  [' + it.gi + '.' + it.ri + '] ' + it.u);
    try {
      const b = Buffer.from(await (await fetch(it.u)).arrayBuffer());
      const f = path.join(LAB, 'blank-' + id + '-r' + it.gi + '-' + it.ri + '.jpg');
      fs.writeFileSync(f, b);
      console.log('      → ' + path.basename(f) + '  ' + (b.length / 1024).toFixed(0) + 'KB');
    } catch (e) { console.log('      下载失败: ' + e.message); }
  }
  fs.writeFileSync(path.join(LAB, 'detail-' + id + '.json'), JSON.stringify(d, null, 2));
  console.log('\n✅ 原始 detail JSON → out/detail-' + id + '.json');
})();
