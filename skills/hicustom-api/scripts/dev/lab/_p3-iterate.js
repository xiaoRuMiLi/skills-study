'use strict';
/**
 * P2 迭代：按目标参数生成设计 -> 本地 mockup -> 量出"我们的文字" bbox -> 与目标比 IoU，
 * 并输出 左(空白营销图) / 右(我们的mockup) 对比图。
 * 用法: node scripts/dev/lab/_p3-iterate.js <id> <view> <tag> [widthRatio] [nudgeUp] [fontScale]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const { stamp } = require('../../app/Services/TextStampService');
const { renderMockup } = require('./_p1-mockup');

const LAB = path.join(__dirname, 'out');

function inv(H) {
  const a = H[0][0], b = H[0][1], c = H[0][2], d = H[1][0], e = H[1][1], f = H[1][2], g = H[2][0], h = H[2][1], i = H[2][2];
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e, D = f * g - d * i, E = a * i - c * g, F = c * d - a * f, G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
  const det = a * A + b * D + c * G;
  return [[A / det, B / det, C / det], [D / det, E / det, F / det], [G / det, Hh / det, I / det]];
}
const ap = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };

async function bboxOfColor(file, test, minN) {
  const raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data, iw = raw.info.width, ih = raw.info.height, ch = raw.info.channels;
  const m = new Uint8Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y * iw + x) * ch;
    if (test(d[i], d[i + 1], d[i + 2])) m[y * iw + x] = 1;
  }
  // 连通域：只保留 ≥ minN 的块，再取并集 bbox（排除嘴唇/肤色等零星像素）
  const seen = new Uint8Array(iw * ih), st = [];
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, tot = 0;
  const need = minN || 20;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const p = y * iw + x;
    if (seen[p] || !m[p]) continue;
    st.length = 0; st.push(p); seen[p] = 1;
    let n = 0, ax = 1e9, bx = -1, ay = 1e9, by = -1;
    while (st.length) {
      const q = st.pop(), qx = q % iw, qy = (q - qx) / iw;
      n++;
      if (qx < ax) ax = qx; if (qx > bx) bx = qx; if (qy < ay) ay = qy; if (qy > by) by = qy;
      for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dd[0], ny = qy + dd[1];
        if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const q2 = ny * iw + nx; if (seen[q2] || !m[q2]) continue;
        seen[q2] = 1; st.push(q2);
      }
    }
    if (n < need) continue;
    tot += n;
    if (ax < minx) minx = ax; if (bx > maxx) maxx = bx; if (ay < miny) miny = ay; if (by > maxy) maxy = by;
  }
  return tot >= need ? { minx: minx, maxx: maxx, miny: miny, maxy: maxy, n: tot, iw: iw, ih: ih } : null;
}
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx) + 1);
  const iy = Math.max(0, Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny) + 1);
  const inter = ix * iy;
  const ua = (a.maxx - a.minx + 1) * (a.maxy - a.miny + 1) + (b.maxx - b.minx + 1) * (b.maxy - b.miny + 1) - inter;
  return ua > 0 ? inter / ua : 0;
};

(async () => {
  const ptId = process.argv[2] || '12659';
  const viewId = process.argv[3] || '1';
  const tag = process.argv[4] || 'chest';
  const tagArg = tag ? '-' + tag : '';
  const widthRatio = Number(process.argv[5] || 0.307);
  const nudgeUp = Number(process.argv[6] || -0.044);
  const rowGap = Number(process.argv[7] || 0.12);

  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const H = cal.H, PA = cal.printArea;
  const target = JSON.parse(fs.readFileSync(path.join(LAB, 'target-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));

  // 1) 生成设计图（白底 + 红字，便于测量）——真实使用时会换成用户素材+真色
  const basePng = path.join(LAB, 'canvas-' + ptId + '.jpg');
  await sharp({ create: { width: PA.width, height: PA.height, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 95 }).toFile(basePng);
  const design = path.join(LAB, 'design-' + ptId + '-v' + viewId + tagArg + '.jpg');
  await stamp(basePng, {
    lines: [{ text: 'YOUR DESIGN HERE', color: '#FF0000', font: 'bold', weight: 800, posV: 'middle', size: 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
    block: { widthRatio: widthRatio, heightRatio: 0.95, vAlign: 'middle', nudgeUp: nudgeUp, rowGap: rowGap, lineGap: 0.35 },
    background: { enabled: false }, outFile: design, format: 'jpeg', quality: 95,
  });
  console.log('① 设计图 -> ' + path.basename(design) + '  (widthRatio=' + widthRatio + ', nudgeUp=' + nudgeUp + ')');

  // 2) 本地 mockup
  const outName = 'mockup-' + ptId + '-v' + viewId + tagArg + '.jpg';
  const mr = await renderMockup({ ptId: ptId, viewId: viewId, designFile: design, outFile: path.join(LAB, outName), tagArg: tagArg });
  console.log('② mockup -> ' + outName);

  // 3) 目标 bbox 映射到 mockup 坐标
  const tb = target.bboxPrint;
  const corners = [[tb.x0, tb.y0], [tb.x1, tb.y0], [tb.x1, tb.y1], [tb.x0, tb.y1]].map((c) => ap(H, c[0], c[1]));
  const tgt = {
    minx: Math.round(Math.min.apply(null, corners.map((c) => c[0]))), maxx: Math.round(Math.max.apply(null, corners.map((c) => c[0]))),
    miny: Math.round(Math.min.apply(null, corners.map((c) => c[1]))), maxy: Math.round(Math.max.apply(null, corners.map((c) => c[1]))),
  };

  // 4) 量我们的文字（红）
  const ours = await bboxOfColor(path.join(LAB, outName), (r, g, b) => r > 190 && g < 70 && b < 70, 50);
  if (!ours) { console.log('❌ 没测到红色文字'); return; }

  const fmt = (o) => 'x[' + o.minx + ',' + o.maxx + '] y[' + o.miny + ',' + o.maxy + '] 宽' + (o.maxx - o.minx + 1) + ' 高' + (o.maxy - o.miny + 1) + ' 中心(' + ((o.minx + o.maxx) / 2).toFixed(0) + ',' + ((o.miny + o.maxy) / 2).toFixed(0) + ')';
  console.log('\n目标 : ' + fmt(tgt));
  console.log('我们 : ' + fmt(ours));
  console.log('IoU  : ' + iou(ours, tgt).toFixed(3) + '   (达标 ≥ 0.9)');
  console.log('尺寸差: 宽 ' + (((ours.maxx - ours.minx + 1) / (tgt.maxx - tgt.minx + 1) - 1) * 100).toFixed(1) + '%  高 ' + (((ours.maxy - ours.miny + 1) / (tgt.maxy - tgt.miny + 1) - 1) * 100).toFixed(1) + '%');
  console.log('中心差: dx=' + (((ours.minx + ours.maxx) / 2) - ((tgt.minx + tgt.maxx) / 2)).toFixed(0) + 'px dy=' + (((ours.miny + ours.maxy) / 2) - ((tgt.miny + tgt.maxy) / 2)).toFixed(0) + 'px');

  // 5) 对比图：左=空白营销图(放大到1200) 右=我们的 mockup，并画目标框
  const left = await sharp(path.join(LAB, 'blank-' + ptId + '-r0-0.jpg')).resize(1200, 1200).png().toBuffer();
  const rect = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">' +
    '<rect x="' + tgt.minx + '" y="' + tgt.miny + '" width="' + (tgt.maxx - tgt.minx) + '" height="' + (tgt.maxy - tgt.miny) + '" fill="none" stroke="#00FF00" stroke-width="4"/>' +
    '<rect x="' + ours.minx + '" y="' + ours.miny + '" width="' + (ours.maxx - ours.minx) + '" height="' + (ours.maxy - ours.miny) + '" fill="none" stroke="#FF0000" stroke-width="4"/>' +
    '</svg>')).png().toBuffer();
  const right = await sharp(path.join(LAB, outName)).resize(1200, 1200).composite([{ input: rect }]).png().toBuffer();
  const cmp = path.join(LAB, 'cmp-' + ptId + '-v' + viewId + tagArg + '.jpg');
  await sharp({ create: { width: 2420, height: 1200, channels: 3, background: '#FFFFFF' } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 1220, top: 0 }]).jpeg({ quality: 92 }).toFile(cmp);
  console.log('\n对比图(左:空白 右:我们, 绿=目标框 红=我们的框) -> out/' + path.basename(cmp));
})();
