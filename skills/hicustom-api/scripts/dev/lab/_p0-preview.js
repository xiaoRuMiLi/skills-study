'use strict';
/**
 * P0：直接调 design.preview（自动合成预览），看返回的效果图与分辨率。
 * 用法: node scripts/dev/lab/_p0-preview.js <productTypeId> <galleryCode> <viewId> [imageWidth]
 */
const fs = require('fs');
const path = require('path');
const { bootstrap } = require('../../core/bootstrap');
const sharp = require('../../tools/node_modules/sharp');

const LAB = path.join(__dirname, 'out');
fs.mkdirSync(LAB, { recursive: true });

(async () => {
  const [, , ptId = '12659', code = '8F4JEN', viewId = '1', imageWidth = '1600'] = process.argv;
  const app = bootstrap().app;
  const design = app.make('design');
  const product = app.make('product');
  const r = await product.detail(ptId);
  const pd = (r.data && r.data.product_description) || {};
  const face = (pd.print_areas || []).find((f) => String(f.id) === String(viewId)) || (pd.print_areas || [])[0];

  console.log('产品', ptId, '面', viewId, face && (face.width + 'x' + face.height));
  const pr = await design.preview({
    productTypeId: ptId, defaultViewId: Number(viewId), imageWidth: Number(imageWidth),
    cfgs: [{ view_id: Number(viewId), gallery_code: code, width: face.width, height: face.height, top_x: 0, top_y: 0 }],
  });
  if (!pr || pr.code !== 200) { console.log('❌ 预览失败', pr && pr.status, pr && pr.msg); return; }
  const d = pr.data || {};
  console.log('产品:', d.cn_name, '| 颜色数', (d.colors || []).length);
  const imgs = (d.colors && d.colors[0] && d.colors[0].renderings) || [];
  console.log('renderings:', imgs.length);
  imgs.forEach((x, i) => console.log('  [' + i + '] big=' + x.big_img + '\n      small=' + x.small_img));
  console.log('主图 image:', d.image);

  // 下载前几张看分辨率
  for (let i = 0; i < Math.min(imgs.length, 4); i++) {
    const u = imgs[i].big_img || imgs[i].small_img;
    if (!u) continue;
    try {
      const b = Buffer.from(await (await fetch(u)).arrayBuffer());
      const m = await sharp(b).metadata();
      const f = path.join(LAB, 'preview-' + ptId + '-v' + viewId + '-' + i + '.jpg');
      fs.writeFileSync(f, b);
      console.log('  → ' + path.basename(f) + '  ' + m.width + 'x' + m.height + '  ' + (b.length / 1024).toFixed(0) + 'KB');
    } catch (e) { console.log('  下载失败', e.message); }
  }
  fs.writeFileSync(path.join(LAB, 'preview-' + ptId + '.json'), JSON.stringify(d, null, 2));
})();
