'use strict';
/** 诊断：同一张孪生图，本地 mockup vs 真实渲染 —— 找差异在哪 */
const fs = require('fs'); const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const Engine = require('../../app/Support/MockupEngine');
const ROOT = path.join(__dirname, '..', '..', '..');
const AL = path.join(ROOT, '.hicustom', 'align');
(async () => {
  const c = JSON.parse(fs.readFileSync(path.join(AL, '12453-v1.json'), 'utf8'));
  const twin = path.join(AL, 'verify-twin-12453-v1.jpg');
  const real = path.join(AL, 'verify-real-12453-v1.jpg');
  const mk = path.join(AL, 'diag-mockup.jpg');
  await Engine.renderMockup({ H: c.H, printArea: c.printArea, baseFile: c.baseFile, maskFile: c.maskFile, designFile: twin, outFile: mk, quality: 92 });
  const a = await sharp(mk).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(real).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const iw = Math.min(a.info.width, b.info.width), ih = Math.min(a.info.height, b.info.height), ch = a.info.channels;
  let sum = 0, n = 0, rows = [];
  for (let y = 0; y < ih; y += 4) {
    let rs = 0;
    for (let x = 0; x < iw; x += 4) {
      const ia = (y * a.info.width + x) * ch, ib = (y * b.info.width + x) * b.info.channels;
      const d = Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      sum += d; n += 3; rs += d;
    }
    rows.push({ y: y, d: rs });
  }
  console.log('平均像素差: ' + (sum / n).toFixed(1) + ' / 255');
  rows.sort((p, q) => q.d - p.d);
  console.log('差异最大的一些行(y, 差值和): ' + rows.slice(0, 8).map((r) => r.y + ':' + r.d).join('  '));
  // 红字框对比（孪生图是红字，两侧都能量）
  const measure = async (f) => { const raw = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return Engine.measureBboxRaw(raw.data, raw.info.width, raw.info.height, raw.info.channels, (r, g, bb) => r > 170 && g < 90 && bb < 90, 30); };
  const o1 = await measure(mk), o2 = await measure(real);
  const f = (o) => o ? 'x[' + o.minx + ',' + o.maxx + '] y[' + o.miny + ',' + o.maxy + '] 宽' + (o.maxx - o.minx + 1) + ' 高' + (o.maxy - o.miny + 1) : 'null';
  console.log('本地 mockup 红字: ' + f(o1));
  console.log('真实渲染   红字: ' + f(o2));
  const cmp = path.join(AL, 'diag-cmp.jpg');
  const L = await sharp(mk).resize(600, 600).png().toBuffer();
  const R = await sharp(real).resize(600, 600).png().toBuffer();
  await sharp({ create: { width: 1210, height: 600, channels: 3, background: '#DDD' } }).composite([{ input: L, left: 0, top: 0 }, { input: R, left: 610, top: 0 }]).jpeg({ quality: 90 }).toFile(cmp);
  console.log('对比图 -> ' + cmp);
})();
