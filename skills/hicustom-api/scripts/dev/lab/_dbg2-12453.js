'use strict';
const fs = require('fs'); const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const Engine = require('../../app/Support/MockupEngine');
const { stamp } = require('../../app/Services/TextStampService');
const ROOT = path.join(__dirname, '..', '..', '..');
const AL = path.join(ROOT, '.hicustom', 'align');

(async () => {
  const c = JSON.parse(fs.readFileSync(path.join(AL, '12453-v1.json'), 'utf8'));
  const PA = c.printArea;
  // 遮罩抽查
  const mask = await sharp(c.maskFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => mask.data[(Math.round(y) * mask.info.width + Math.round(x)) * mask.info.channels];
  console.log('mask size', mask.info.width + 'x' + mask.info.height, 'ch', mask.info.channels);
  const tm = [[0.3, 0.45], [0.5, 0.6], [0.5, 0.75]];
  tm.forEach((m) => { const p = Engine.apply(c.H, m[0] * PA.width, m[1] * PA.height); console.log('  校准点(' + m + ')->(' + p.map((v) => v.toFixed(0)) + ') mask=' + at(p[0], p[1])); });
  const tb = c.target.bboxPrint;
  const cx = (tb.x0 + tb.x1) / 2, cy = (tb.y0 + tb.y1) / 2;
  const pc = Engine.apply(c.H, cx, cy);
  console.log('目标中心 mockup=(' + pc.map((v) => v.toFixed(0)) + ') mask=' + at(pc[0], pc[1]));

  // 用目标导出的参数做一次本地 mockup，并量红字
  const tgt = c.target;
  const wr = Math.round(tgt.norm.w * 1000) / 1000, nu = Math.round((tgt.norm.cy - 0.5) * 1000) / 1000;
  console.log('候选参数: widthRatio=' + wr + ' nudgeUp=' + nu + ' rowGap=0.4');
  const SW = Math.round(PA.width / 2), SH = Math.round(PA.height / 2);
  const canvas = path.join(AL, 'dbg-canvas.jpg');
  await sharp({ create: { width: SW, height: SH, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 95 }).toFile(canvas);
  const design = path.join(AL, 'dbg-design.jpg');
  await stamp(canvas, {
    lines: [{ text: 'Custom Yoga Bag', color: '#FF0000', font: 'bold', weight: 800, posV: 'middle', size: 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
    block: { widthRatio: wr, heightRatio: 0.95, vAlign: 'middle', nudgeUp: nu, rowGap: 0.4 },
    background: { enabled: false }, outFile: design, format: 'jpeg', quality: 90,
  });
  const mock = path.join(AL, 'dbg-mockup.jpg');
  await Engine.renderMockup({ H: c.H, printArea: PA, baseFile: c.baseFile, maskFile: c.maskFile, designFile: design, outFile: mock, scale: 0.5 });
  const o = await Engine.measureBbox(mock, (r, g, b) => r > 190 && g < 70 && b < 70, 12);
  const tgtBox = (() => {
    const cs = [[tb.x0, tb.y0], [tb.x1, tb.y0], [tb.x1, tb.y1], [tb.x0, tb.y1]].map((cc) => Engine.apply(c.H, cc[0], cc[1]));
    const X = cs.map((p) => p[0] * 0.5), Y = cs.map((p) => p[1] * 0.5);
    return { minx: Math.round(Math.min.apply(null, X)), maxx: Math.round(Math.max.apply(null, X)), miny: Math.round(Math.min.apply(null, Y)), maxy: Math.round(Math.max.apply(null, Y)) };
  })();
  console.log('目标框(0.5scale):', JSON.stringify(tgtBox));
  console.log('测量到的红字框   :', JSON.stringify(o));
  console.log('IoU =', o ? Engine.iou(o, tgtBox).toFixed(3) : 'N/A');
  // 可视化
  const rect = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect x="' + tgtBox.minx + '" y="' + tgtBox.miny + '" width="' + (tgtBox.maxx - tgtBox.minx) + '" height="' + (tgtBox.maxy - tgtBox.miny) + '" fill="none" stroke="#00FF00" stroke-width="4"/>' + (o ? '<rect x="' + o.minx + '" y="' + o.miny + '" width="' + (o.maxx - o.minx) + '" height="' + (o.maxy - o.miny) + '" fill="none" stroke="#FF00FF" stroke-width="3"/>' : '') + '</svg>';
  await sharp(mock).resize(600, 600, { fit: 'contain', background: '#fff' }).composite([{ input: await sharp(Buffer.from(rect)).png().toBuffer() }]).jpeg({ quality: 90 }).toFile(path.join(__dirname, 'out', 'dbg2-12453.jpg'));
  console.log('debug2 图 -> out/dbg2-12453.jpg');
})();
