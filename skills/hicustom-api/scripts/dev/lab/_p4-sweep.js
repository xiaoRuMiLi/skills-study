'use strict';
/**
 * P2 参数扫描：网格搜索 (widthRatio, rowGap, nudgeUp) -> 本地 mockup -> IoU，取最优。
 * 用法: node scripts/dev/lab/_p4-sweep.js <id> <view> <tag>
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const { stamp } = require('../../app/Services/TextStampService');
const { renderMockup } = require('./_p1-mockup');

const LAB = path.join(__dirname, 'out');
const ap = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx) + 1);
  const iy = Math.max(0, Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny) + 1);
  const inter = ix * iy;
  const ua = (a.maxx - a.minx + 1) * (a.maxy - a.miny + 1) + (b.maxx - b.minx + 1) * (b.maxy - b.miny + 1) - inter;
  return ua > 0 ? inter / ua : 0;
};
async function bboxOfColor(file, test, minN) {
  const raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data, iw = raw.info.width, ih = raw.info.height, ch = raw.info.channels;
  const m = new Uint8Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const i = (y * iw + x) * ch; if (test(d[i], d[i + 1], d[i + 2])) m[y * iw + x] = 1; }
  const seen = new Uint8Array(iw * ih), st = [];
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, tot = 0;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const p = y * iw + x; if (seen[p] || !m[p]) continue;
    st.length = 0; st.push(p); seen[p] = 1;
    let n = 0, ax = 1e9, bx = -1, ay = 1e9, by = -1;
    while (st.length) {
      const q = st.pop(), qx = q % iw, qy = (q - qx) / iw; n++;
      if (qx < ax) ax = qx; if (qx > bx) bx = qx; if (qy < ay) ay = qy; if (qy > by) by = qy;
      for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dd[0], ny = qy + dd[1]; if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue; const q2 = ny * iw + nx; if (seen[q2] || !m[q2]) continue; seen[q2] = 1; st.push(q2); }
    }
    if (n < (minN || 20)) continue; tot += n;
    if (ax < minx) minx = ax; if (bx > maxx) maxx = bx; if (ay < miny) miny = ay; if (by > maxy) maxy = by;
  }
  return tot >= (minN || 20) ? { minx: minx, maxx: maxx, miny: miny, maxy: maxy, n: tot } : null;
}

(async () => {
  const ptId = process.argv[2] || '12659', viewId = process.argv[3] || '1', tag = process.argv[4] || 'chest';
  const tagArg = tag ? '-' + tag : '';
  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const H = cal.H, PA = cal.printArea;
  const target = JSON.parse(fs.readFileSync(path.join(LAB, 'target-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const tb = target.bboxPrint;
  const corners = [[tb.x0, tb.y0], [tb.x1, tb.y0], [tb.x1, tb.y1], [tb.x0, tb.y1]].map((c) => ap(H, c[0], c[1]));
  let tgt = { minx: Math.round(Math.min.apply(null, corners.map((c) => c[0]))), maxx: Math.round(Math.max.apply(null, corners.map((c) => c[0]))), miny: Math.round(Math.min.apply(null, corners.map((c) => c[1]))), maxy: Math.round(Math.max.apply(null, corners.map((c) => c[1]))) };
  console.log('目标框: x[' + tgt.minx + ',' + tgt.maxx + '] y[' + tgt.miny + ',' + tgt.maxy + '] 宽' + (tgt.maxx - tgt.minx + 1) + ' 高' + (tgt.maxy - tgt.miny + 1));
  // 可选：等效目标缩放（补偿"本地mockup vs 真实渲染"的系统差异），绕中心缩放
  const sx = Number(process.env.TGT_SX || 1), sy = Number(process.env.TGT_SY || 1);
  if (sx !== 1 || sy !== 1) {
    const cx = (tgt.minx + tgt.maxx) / 2, cy = (tgt.miny + tgt.maxy) / 2;
    const hw = (tgt.maxx - tgt.minx + 1) / 2 * sx, hh = (tgt.maxy - tgt.miny + 1) / 2 * sy;
    tgt = { minx: Math.round(cx - hw), maxx: Math.round(cx + hw), miny: Math.round(cy - hh), maxy: Math.round(cy + hh) };
    console.log('等效目标(×' + sx + ',' + sy + '): 宽' + (tgt.maxx - tgt.minx + 1) + ' 高' + (tgt.maxy - tgt.miny + 1));
  }

  const canvas = path.join(LAB, 'canvas-' + ptId + '.jpg');
  if (!fs.existsSync(canvas)) await sharp({ create: { width: PA.width, height: PA.height, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 95 }).toFile(canvas);

  const res = [];
  const wr = (process.env.WR || '0.26,0.275,0.288,0.30,0.315').split(',').map(Number);
  const rg = (process.env.RG || '0.32,0.42,0.52,0.62,0.72').split(',').map(Number);
  const nu = (process.env.NU || '-0.044').split(',').map(Number);
  for (const w of wr) for (const g of rg) for (const n of nu) {
    const design = path.join(LAB, 'design-sweep.jpg');
    await stamp(canvas, {
      lines: [{ text: 'YOUR DESIGN HERE', color: '#FF0000', font: 'bold', weight: 800, posV: 'middle', size: 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
      block: { widthRatio: w, heightRatio: 0.95, vAlign: 'middle', nudgeUp: n, rowGap: g },
      background: { enabled: false }, outFile: design, format: 'jpeg', quality: 95,
    });
    const mk = path.join(LAB, 'mockup-sweep.jpg');
    await renderMockup({ ptId: ptId, viewId: viewId, designFile: design, outFile: mk, tagArg: tagArg });
    const o = await bboxOfColor(mk, (r, gg, b) => r > 190 && gg < 70 && b < 70, 50);
    const score = o ? iou(o, tgt) : 0;
    res.push({ w: w, g: g, n: n, iou: score, o: o });
  }
  res.sort((a, b) => b.iou - a.iou);
  console.log('\nTop 8:');
  res.slice(0, 8).forEach((r) => console.log('  IoU=' + r.iou.toFixed(3) + '  widthRatio=' + r.w + ' rowGap=' + r.g + ' nudgeUp=' + r.n + '  -> 框 x[' + r.o.minx + ',' + r.o.maxx + '] y[' + r.o.miny + ',' + r.o.maxy + '] 宽' + (r.o.maxx - r.o.minx + 1) + ' 高' + (r.o.maxy - r.o.miny + 1)));
  const best = res[0];
  fs.writeFileSync(path.join(LAB, 'best-' + ptId + '-v' + viewId + tagArg + '.json'), JSON.stringify(best, null, 2));
  console.log('\n最优: widthRatio=' + best.w + ' rowGap=' + best.g + ' nudgeUp=' + best.n + '  IoU=' + best.iou.toFixed(3));
})();
