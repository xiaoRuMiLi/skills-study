'use strict';
/**
 * P2·目标测量：从空白主图里量出占位文字（蓝色）的 bbox -> 映射到「印刷区坐标」目标值。
 * 用法: node scripts/dev/lab/_p2-target.js <productTypeId> <viewId> [tag]
 * 依赖: out/blank-<id>-r0-0.jpg（营销图，500px）+ out/calib-H-<id>-v<view><tag>.json
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

const LAB = path.join(__dirname, 'out');

function comps(mask, iw, ih, minN) {
  const seen = new Uint8Array(iw * ih), out = [], st = [];
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const p = y * iw + x;
    if (seen[p] || !mask[p]) continue;
    st.length = 0; st.push(p); seen[p] = 1;
    let n = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
    while (st.length) {
      const q = st.pop(), qx = q % iw, qy = (q - qx) / iw;
      n++; sx += qx; sy += qy;
      if (qx < minx) minx = qx; if (qx > maxx) maxx = qx; if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + d[0], ny = qy + d[1];
        if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const q2 = ny * iw + nx; if (seen[q2] || !mask[q2]) continue;
        seen[q2] = 1; st.push(q2);
      }
    }
    if (n >= minN) out.push({ n: n, cx: sx / n, cy: sy / n, minx: minx, maxx: maxx, miny: miny, maxy: maxy });
  }
  return out;
}
const inv = (H) => { const a = H[0][0], b = H[0][1], c = H[0][2], d = H[1][0], e = H[1][1], f = H[1][2], g = H[2][0], h = H[2][1], i = H[2][2]; const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e, D = f * g - d * i, E = a * i - c * g, F = c * d - a * f, G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d; const det = a * A + b * D + c * G; return [[A / det, B / det, C / det], [D / det, E / det, F / det], [G / det, Hh / det, I / det]]; };
const ap = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };

(async () => {
  const ptId = process.argv[2] || '12659';
  const viewId = process.argv[3] || '1';
  const tagArg = process.argv[4] ? '-' + process.argv[4] : '';
  const blank = path.join(LAB, 'blank-' + ptId + '-r0-0.jpg');
  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const H = cal.H, PA = cal.printArea, IS = cal.imageSize;

  const raw = await sharp(blank).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data, iw = raw.info.width, ih = raw.info.height, ch = raw.info.channels;
  console.log('空白营销图 ' + iw + 'x' + ih + ' | 印刷区 ' + PA.width + 'x' + PA.height + ' | 标定图 ' + IS.join('x'));

  // 蓝色文字掩码：偏蓝、够深（浅紫背景的菱形花纹排除）
  const mask = new Uint8Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y * iw + x) * ch; const r = d[i], g = d[i + 1], b = d[i + 2];
    if (b - r > 45 && b > 95 && r < 140 && g < 150) mask[y * iw + x] = 1;
  }
  const cs = comps(mask, iw, ih, 8).sort((a, b) => a.miny - b.miny);
  console.log('\n蓝色块（按 y 排序，前 12 个常见）:');
  cs.slice(0, 12).forEach((c) => console.log('  n=' + String(c.n).padStart(5) + '  x[' + c.minx + ',' + c.maxx + '] y[' + c.miny + ',' + c.maxy + ']  c=(' + c.cx.toFixed(0) + ',' + c.cy.toFixed(0) + ')'));

  const SCALE = IS[0] / iw;                       // 500 -> 1200
  // 按行扫描：统计每行掩码像素 -> 找连续"行带"
  const rowCnt = new Int32Array(ih), rowMinX = new Int32Array(ih).fill(1e9), rowMaxX = new Int32Array(ih).fill(-1);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    if (!mask[y * iw + x]) continue;
    rowCnt[y]++; if (x < rowMinX[y]) rowMinX[y] = x; if (x > rowMaxX[y]) rowMaxX[y] = x;
  }
  const bands = [];
  for (let y = 0; y < ih; y++) {
    if (rowCnt[y] < 2) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.maxy <= 3) {
      last.maxy = y; last.n += rowCnt[y];
      last.minx = Math.min(last.minx, rowMinX[y]); last.maxx = Math.max(last.maxx, rowMaxX[y]);
    } else bands.push({ miny: y, maxy: y, n: rowCnt[y], minx: rowMinX[y], maxx: rowMaxX[y] });
  }
  console.log('\n文字行带（y 扫描）:');
  bands.forEach((b, i) => console.log('  #' + (i + 1) + ' y[' + b.miny + ',' + b.maxy + '] x[' + b.minx + ',' + b.maxx + '] 高=' + (b.maxy - b.miny + 1) + ' 宽=' + (b.maxx - b.minx + 1) + ' px=' + b.n));

  // 标题块 = 前 3 行带（YOUR/DESIGN/HERE）
  const titleBands = bands.slice(0, 3);
  const titleMaxY = titleBands.length ? titleBands[titleBands.length - 1].maxy : ih * 0.4;
  const titleish = cs.filter((c) => c.miny <= titleMaxY && c.n >= 5);
  if (!titleish.length) { console.log('未找到文字块'); return; }
  const bb = {
    x0: Math.min.apply(null, titleish.map((c) => c.minx)), x1: Math.max.apply(null, titleish.map((c) => c.maxx)),
    y0: Math.min.apply(null, titleish.map((c) => c.miny)), y1: Math.max.apply(null, titleish.map((c) => c.maxy)),
  };
  console.log('\n"上面那坨蓝"合并 bbox(500系): x[' + bb.x0 + ',' + bb.x1 + '] y[' + bb.y0 + ',' + bb.y1 + ']' + '  块数=' + titleish.length);

  // 映射：先按比例到 1200 系，再用 H^-1 到印刷区
  const Hinv = inv(H);
  const toPrint = (x500, y500) => ap(Hinv, x500 * SCALE, y500 * SCALE);
  const c0 = toPrint(bb.x0, bb.y0), c1 = toPrint(bb.x1, bb.y1);
  console.log('\n映射到印刷区坐标(px): x[' + c0[0].toFixed(0) + ',' + c1[0].toFixed(0) + '] y[' + c0[1].toFixed(0) + ',' + c1[1].toFixed(0) + ']');
  console.log('归一化(0~1): x[' + (c0[0] / PA.width).toFixed(3) + ',' + (c1[0] / PA.width).toFixed(3) + '] y[' + (c0[1] / PA.height).toFixed(3) + ',' + (c1[1] / PA.height).toFixed(3) + ']');

  const bw = (c1[0] - c0[0]) / PA.width, bh = (c1[1] - c0[1]) / PA.height;
  const cx = (c0[0] + c1[0]) / 2 / PA.width, cy = (c0[1] + c1[1]) / 2 / PA.height;
  const target = { printArea: PA, bboxPrint: { x0: c0[0], y0: c0[1], x1: c1[0], y1: c1[1] }, norm: { w: bw, h: bh, cx: cx, cy: cy } };
  fs.writeFileSync(path.join(LAB, 'target-' + ptId + '-v' + viewId + tagArg + '.json'), JSON.stringify(target, null, 2));
  console.log('\n目标(归一化): 宽 ' + bw.toFixed(3) + '  高 ' + bh.toFixed(3) + '  中心(' + cx.toFixed(3) + ',' + cy.toFixed(3) + ')');
  console.log('[OK] -> out/target-' + ptId + '-v' + viewId + tagArg + '.json');
})();
