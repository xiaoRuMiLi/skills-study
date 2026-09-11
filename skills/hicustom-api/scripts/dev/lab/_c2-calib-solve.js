'use strict';
/**
 * 标定·第2步：从 mockup 里检测洋红标记 → 与印刷区真值配对 → 解单应矩阵 H(印刷区px → mockup px)。
 * 用法: node scripts/dev/lab/_c2-calib-solve.js <productTypeId> <viewId> [renderIndex]
 * 产物: out/calib-H-<id>-v<view>.json + out/calib-check-<id>-v<view>.jpg（可视化验证）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

const LAB = path.join(__dirname, 'out');

/** 找洋红连通域 → 返回 [{cx,cy,area,w,h}] */
function findMagenta(data, width, height, channels) {
  const isM = (i) => data[i] > 170 && data[i + 2] > 170 && data[i + 1] < 130 && (data[i] - data[i + 1]) > 60 && (data[i + 2] - data[i + 1]) > 60;
  const seen = new Uint8Array(width * height);
  const out = [];
  const stack = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const idx = y * width + x;
    if (seen[idx]) continue;
    if (!isM(idx * channels)) continue;
    // flood
    stack.length = 0; stack.push(idx); seen[idx] = 1;
    let n = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
    while (stack.length) {
      const p = stack.pop();
      const px = p % width, py = (p - px) / width;
      n++; sx += px; sy += py;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (seen[ni]) continue;
        if (isM(ni * channels)) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (n > 30) out.push({ cx: sx / n, cy: sy / n, area: n, w: maxx - minx + 1, h: maxy - miny + 1 });
  }
  return out;
}

/** DLT 解单应（src→dst），带归一化 */
function homography(src, dst) {
  const N = src.length;
  // 归一化
  const norm = (pts) => {
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const s = Math.sqrt(2) / (pts.reduce((a, p) => a + Math.hypot(p[0] - mx, p[1] - my), 0) / pts.length || 1);
    const T = [[s, 0, -s * mx], [0, s, -s * my], [0, 0, 1]];
    return { T, pts: pts.map(([x, y]) => [s * (x - mx), s * (y - my)]) };
  };
  const A = norm(src), B = norm(dst);
  const M = [];
  for (let i = 0; i < N; i++) {
    const [x, y] = A.pts[i], [u, v] = B.pts[i];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u]);
    M.push([0, 0, 0, x, y, 1, -v * x, -v * y, -v]);
  }
  // 最小二乘（8 参数）用正规方程
  const n8 = 8;
  const ATA = Array.from({ length: n8 }, () => new Float64Array(n8));
  const ATb = new Float64Array(n8);
  for (const row of M) {
    for (let i = 0; i < n8; i++) {
      for (let j = 0; j < n8; j++) ATA[i][j] += row[i] * row[j];
      ATb[i] += row[i] * -row[n8];
    }
  }
  // 高斯消元
  const M2 = ATA.map((r, i) => { const a = Array.from(r); a.push(ATb[i]); return a; });
  for (let c = 0; c < n8; c++) {
    let piv = c;
    for (let r = c + 1; r < n8; r++) if (Math.abs(M2[r][c]) > Math.abs(M2[piv][c])) piv = r;
    [M2[c], M2[piv]] = [M2[piv], M2[c]];
    const p = M2[c][c];
    for (let j = c; j <= n8; j++) M2[c][j] /= p;
    for (let r = 0; r < n8; r++) { if (r === c) continue; const f = M2[r][c]; for (let j = c; j <= n8; j++) M2[r][j] -= f * M2[c][j]; }
  }
  const h = Array.from({ length: n8 }, (_, i) => M2[i][n8]);
  const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  // 反归一化: H = Tdst^-1 * Hn * Tsrc
  const inv = (T) => { const [[a, b, c], [d, e, f]] = T; const det = a * e - b * d; return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det], [0, 0, 1]]; };
  const mul = (X, Y) => X.map((r) => [0, 1, 2].map((k) => r[0] * Y[0][k] + r[1] * Y[1][k] + r[2] * Y[2][k]));
  return mul(mul(inv(B.T), Hn), A.T);
}
function apply(H, x, y) { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; }

(async () => {
  const [, , ptId = '12659', viewId = '1', ri = '0'] = process.argv;
  const meta = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-' + ptId + '-v' + viewId + '.json'), 'utf8'));
  const marks = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-marks-' + ptId + '-v' + viewId + '.json'), 'utf8'));
  const render = meta.renderings[Number(ri)];
  const img = render.file;
  console.log('mockup: ' + path.basename(img) + '  ' + render.w + 'x' + render.h);

  const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const blobs = findMagenta(data, info.width, info.height, info.channels);
  console.log('检测到洋红块 ' + blobs.length + ' 个:');
  blobs.forEach((b) => console.log('  (' + b.cx.toFixed(1) + ',' + b.cy.toFixed(1) + ') area=' + b.area + ' ' + b.w + 'x' + b.h));

  // 只保留"方块"（宽高比接近 1 且不过小） → 完整可见的标记
  const squarish = blobs.filter((b) => b.w > 4 && b.h > 4 && b.w / b.h > 0.6 && b.w / b.h < 1.7);
  console.log('方形完整标记: ' + squarish.length + ' / 预期 ' + marks.length);

  // 配对：按 (y,x) 排序后依序配（假设全部检出）
  if (squarish.length < 4) { console.log('❌ 标记不足 4 个，无法解单应'); return; }
  const src = squarish.map((b) => [b.cx, b.cy]);
  const sortedB = squarish.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const sortedM = marks.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const n = Math.min(sortedB.length, sortedM.length);
  const dst = sortedM.slice(0, n).map((m) => [m.cx, m.cy]);
  const srcPts = sortedB.slice(0, n).map((b) => [b.cx, b.cy]);

  const H = homography(dst, srcPts); // 印刷区px → mockup px
  console.log('\n单应矩阵 H(印刷区→mockup):');
  console.log(H.map((r) => '  ' + r.map((v) => v.toFixed(7)).join('  ')).join('\n'));

  // 残差
  console.log('\n残差(px):');
  let maxr = 0;
  for (let i = 0; i < n; i++) {
    const [px, py] = apply(H, dst[i][0], dst[i][1]);
    const e = Math.hypot(px - srcPts[i][0], py - srcPts[i][1]);
    maxr = Math.max(maxr, e);
    console.log('  印刷(' + dst[i][0] + ',' + dst[i][1] + ') → 预测(' + px.toFixed(1) + ',' + py.toFixed(1) + ') 实测(' + srcPts[i][0].toFixed(1) + ',' + srcPts[i][1].toFixed(1) + ')  err=' + e.toFixed(2));
  }
  console.log('最大残差 ' + maxr.toFixed(2) + 'px / ' + info.width + 'px = ' + (maxr / info.width * 100).toFixed(2) + '%');

  fs.writeFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + '.json'),
    JSON.stringify({ productTypeId: ptId, viewId, printArea: meta.printArea, imageSize: [info.width, info.height], H, markers: { src: srcPts, dst }, maxResidual: maxr }, null, 2), 'utf8');

  // 可视化：把配对点画成交叉（绿=实测，红=H 预测），并画印刷区外框中点
  const svg = [];
  for (let i = 0; i < n; i++) {
    svg.push(`<circle cx="${srcPts[i][0].toFixed(1)}" cy="${srcPts[i][1].toFixed(1)}" r="10" fill="none" stroke="#00AA00" stroke-width="4"/>`);
    const [px, py] = apply(H, dst[i][0], dst[i][1]);
    svg.push(`<line x1="${px - 12}" y1="${py}" x2="${px + 12}" y2="${py}" stroke="#FF0000" stroke-width="3"/><line x1="${px}" y1="${py - 12}" x2="${px}" y2="${py + 12}" stroke="#FF0000" stroke-width="3"/>`);
  }
  const overlay = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${svg.join('')}</svg>`)).png().toBuffer();
  const chk = path.join(LAB, 'calib-check-' + ptId + '-v' + viewId + '.jpg');
  await sharp(img).composite([{ input: overlay }]).jpeg({ quality: 92 }).toFile(chk);
  console.log('\n✅ 可视化验证 → ' + path.basename(chk) + '（绿圈=实测标记，红十字=H 预测）');
})();
