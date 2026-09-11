'use strict';
/**
 * P3 出片：真实素材 + 对齐好的文字参数 -> 设计图 -> 本地 mockup + 真实渲染，三图对比。
 * 用法: node scripts/dev/lab/_p6-final.js <id> <view> <tag> <素材图> ["文案"]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const imageTool = require('../../tools/image');
const { stamp } = require('../../app/Services/TextStampService');
const { pickDistinctColors } = require('../../app/Support/ContrastColor');
const { renderMockup } = require('./_p1-mockup');
const { bootstrap } = require('../../core/bootstrap');

const LAB = path.join(__dirname, 'out');

(async () => {
  const ptId = process.argv[2] || '12659';
  const viewId = process.argv[3] || '1';
  const tag = process.argv[4] || 'chest';
  const tagArg = tag ? '-' + tag : '';
  const asset = process.argv[5] || 'input/gallery-fav/88387211.jpg';
  const text = process.argv[6] || 'YOUR DESIGN HERE';

  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const PA = cal.printArea;
  const best = JSON.parse(fs.readFileSync(path.join(LAB, 'best-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));

  // ① 素材 cover 适配印刷区
  const canvas = path.join(LAB, 'final-canvas-' + ptId + '.jpg');
  const buf = await imageTool.fitImage({ input: path.resolve(asset), targetW: PA.width, targetH: PA.height, fit: 'cover', quality: 94 });
  imageTool.save(buf, canvas);
  console.log('① 素材 ' + path.basename(asset) + ' -> cover ' + PA.width + 'x' + PA.height);

  // ② 选色 + 叠字（用对齐好的参数）
  let colors = ['#FFFFFF'];
  try { const c = await pickDistinctColors(canvas, 1, {}); if (c.colors && c.colors.length) colors = c.colors; } catch (e) { /* default */ }
  const design = path.join(LAB, 'final-design-' + ptId + '-v' + viewId + tagArg + '.jpg');
  const res = await stamp(canvas, {
    lines: [{ text: text, color: colors[0], font: 'bold', weight: 800, posV: 'middle', size: 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0.035 } }],
    block: { widthRatio: best.w, heightRatio: 0.95, vAlign: 'middle', nudgeUp: best.n, rowGap: best.g },
    background: { enabled: false }, outFile: design, format: 'jpeg', quality: 94,
  });
  console.log('② 叠字 -> ' + path.basename(design) + '  色=' + colors[0] + '  字号=' + res.lines.map((l) => l.fontSize).join('/'));

  // ③ 本地 mockup
  const mk = path.join(LAB, 'final-mockup-' + ptId + '.jpg');
  await renderMockup({ ptId: ptId, viewId: viewId, designFile: design, outFile: mk, tagArg: tagArg });
  console.log('③ 本地 mockup -> ' + path.basename(mk));

  // ④ 真实渲染
  const app = bootstrap().app;
  const up = await app.make('gallery').upload({ image: design, cn_name: 'FINAL-' + ptId, en_name: 'FINAL-' + ptId });
  const pr = await app.make('design').preview({ productTypeId: ptId, defaultViewId: Number(viewId), imageWidth: 1600, cfgs: [{ view_id: Number(viewId), gallery_code: up.data.code, width: PA.width, height: PA.height, top_x: 0, top_y: 0 }] });
  const u = pr.data.colors[0].renderings[0].big_img || pr.data.colors[0].renderings[0].small_img;
  const real = path.join(LAB, 'final-real-' + ptId + '.jpg');
  fs.writeFileSync(real, Buffer.from(await (await fetch(u)).arrayBuffer()));
  console.log('④ 真实渲染(图库码 ' + up.data.code + ') -> ' + path.basename(real));

  // ⑤ 三图对比：空白 | 设计图 | 本地mockup | 真实渲染
  const W = 700, H = 700;
  const panels = [
    { f: path.join(LAB, 'blank-' + ptId + '-r0-0.jpg'), label: '空白(占位)' },
    { f: design, label: '设计图(印刷区)' },
    { f: mk, label: '本地mockup' },
    { f: real, label: '真实渲染' },
  ];
  const composites = [];
  for (let i = 0; i < panels.length; i++) {
    const img = await sharp(panels[i].f).resize(W, H, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    composites.push({ input: img, left: i * (W + 10), top: 0 });
  }
  const out = path.join(LAB, 'final-compare-' + ptId + '.jpg');
  await sharp({ create: { width: panels.length * (W + 10), height: H, channels: 3, background: '#DDDDDD' } }).composite(composites).jpeg({ quality: 90 }).toFile(out);
  console.log('\n⑤ 四联对比 -> out/' + path.basename(out) + '  (左→右: 空白 / 设计图 / 本地mockup / 真实渲染)');
  console.log('   真实渲染 URL: ' + u);
})();
