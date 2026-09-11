'use strict';
/** 用已有图库码补完：preview -> 下载 -> 四联对比。用法: node _p6b-finish.js <id> <view> <tag> <code> */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const { bootstrap } = require('../../core/bootstrap');

const LAB = path.join(__dirname, 'out');
(async () => {
  const [, , ptId = '12659', viewId = '1', tag = 'chest', code = ''] = process.argv;
  const tagArg = tag ? '-' + tag : '';
  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const PA = cal.printArea;
  const app = bootstrap().app;
  const pr = await app.make('design').preview({ productTypeId: ptId, defaultViewId: Number(viewId), imageWidth: 1600, cfgs: [{ view_id: Number(viewId), gallery_code: code, width: PA.width, height: PA.height, top_x: 0, top_y: 0 }] });
  if (!pr || pr.code !== 200) { console.log('preview 失败', pr && pr.status, pr && pr.msg); return; }
  const u = pr.data.colors[0].renderings[0].big_img || pr.data.colors[0].renderings[0].small_img;
  const real = path.join(LAB, 'final-real-' + ptId + '.jpg');
  fs.writeFileSync(real, Buffer.from(await (await fetch(u)).arrayBuffer()));
  console.log('真实渲染 -> ' + path.basename(real) + '\n' + u);

  const W = 700, H = 700;
  const panels = [
    { f: path.join(LAB, 'blank-' + ptId + '-r0-0.jpg') },
    { f: path.join(LAB, 'final-design-' + ptId + '-v' + viewId + tagArg + '.jpg') },
    { f: path.join(LAB, 'final-mockup-' + ptId + '.jpg') },
    { f: real },
  ];
  const comps = [];
  for (let i = 0; i < panels.length; i++) {
    const img = await sharp(panels[i].f).resize(W, H, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    comps.push({ input: img, left: i * (W + 10), top: 0 });
  }
  const out = path.join(LAB, 'final-compare-' + ptId + '.jpg');
  await sharp({ create: { width: panels.length * (W + 10), height: H, channels: 3, background: '#DDDDDD' } }).composite(comps).jpeg({ quality: 90 }).toFile(out);
  console.log('四联对比 -> ' + path.basename(out));
})();
