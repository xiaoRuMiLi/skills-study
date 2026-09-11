'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const Engine = require('../../app/Support/MockupEngine');
const ROOT = path.join(__dirname, '..', '..', '..');

(async () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, '.hicustom', 'align', '12453-v1.json'), 'utf8'));
  const PA = c.printArea;
  console.log('printArea', JSON.stringify(PA), 'imageSize', c.imageSize);
  console.log('target.bboxPrint', JSON.stringify(c.target.bboxPrint));
  console.log('target.norm', JSON.stringify(c.target.norm));
  console.log('bands', JSON.stringify(c.target.bands));
  const tb = c.target.bboxPrint;
  const corners = [[tb.x0, tb.y0], [tb.x1, tb.y0], [tb.x1, tb.y1], [tb.x0, tb.y1]].map((cc) => Engine.apply(c.H, cc[0], cc[1]));
  console.log('目标角点 -> mockup:', corners.map((p) => '(' + p[0].toFixed(0) + ',' + p[1].toFixed(0) + ')').join(' '));
  const marks = [[0.3, 0.45], [0.5, 0.45], [0.7, 0.45], [0.3, 0.6], [0.5, 0.6], [0.7, 0.6], [0.3, 0.75], [0.5, 0.75]];
  console.log('校准点 -> mockup:');
  marks.forEach((m) => { const p = Engine.apply(c.H, m[0] * PA.width, m[1] * PA.height); console.log('  (' + m[0] + ',' + m[1] + ') -> (' + p[0].toFixed(0) + ',' + p[1].toFixed(0) + ')'); });
  const cx = (tb.x0 + tb.x1) / 2 / PA.width, cy = (tb.y0 + tb.y1) / 2 / PA.height;
  const tgt = Engine.apply(c.H, cx * PA.width, cy * PA.height);
  console.log('目标中心 -> mockup', tgt.map((v) => v.toFixed(0)).join(','));
  const mask = await sharp(c.maskFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mi = Math.round(tgt[1]) * mask.info.width + Math.round(tgt[0]);
  console.log('该点在遮罩内?', mask.data[mi * mask.info.channels] ? '是' : '否');
  const wrap = (m) => { const X = m.map((p) => p[0]), Y = m.map((p) => p[1]); return { x: Math.min.apply(null, X).toFixed(0), y: Math.min.apply(null, Y).toFixed(0), w: (Math.max.apply(null, X) - Math.min.apply(null, X)).toFixed(0), h: (Math.max.apply(null, Y) - Math.min.apply(null, Y)).toFixed(0) }; };
  const r = wrap(corners);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + mask.info.width + '" height="' + mask.info.height + '">' +
    '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="none" stroke="#00FF00" stroke-width="5"/>' +
    marks.map((m) => { const p = Engine.apply(c.H, m[0] * PA.width, m[1] * PA.height); return '<circle cx="' + p[0].toFixed(0) + '" cy="' + p[1].toFixed(0) + '" r="10" fill="none" stroke="#00FFFF" stroke-width="4"/>'; }).join('') + '</svg>';
  await sharp(c.baseFile).composite([{ input: await sharp(Buffer.from(svg)).png().toBuffer() }]).jpeg({ quality: 90 }).toFile(path.join(__dirname, 'out', 'dbg-12453.jpg'));
  console.log('debug 图 -> out/dbg-12453.jpg');
})();
