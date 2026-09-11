'use strict';
/**
 * 标定 v2：彩色标记（每个标记一种颜色）-> 按色识别（不依赖顺序，容忍遮挡）-> 解 H + 残差 + 可视化。
 * 默认「胸口带」网格（fy 0.45/0.6/0.75，避开领口分裂区）；GRID=full 用全幅 3x3。
 * 用法: node scripts/dev/lab/_c3-color-calib.js <productTypeId> <viewId> [--capture]
 *   --capture   重新生成定位图并上传+预览（消耗 1 次上传）；否则复用已下载的 mockup。
 *   EXCLUDE=a,b 剔除歧义标记；TAG=xx 给产物文件名加后缀。
 * 产物: out/calib-H-<id>-v<view><tag>.json、out/calib-check-c-<id>-v<view><tag>.jpg
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

const LAB = path.join(__dirname, 'out');
fs.mkdirSync(LAB, { recursive: true });

const CHEST = [
  { fx: 0.3, fy: 0.45, rgb: [255, 0, 0], name: 'red' },
  { fx: 0.5, fy: 0.45, rgb: [0, 255, 0], name: 'green' },
  { fx: 0.7, fy: 0.45, rgb: [0, 0, 255], name: 'blue' },
  { fx: 0.3, fy: 0.6, rgb: [255, 255, 0], name: 'yellow' },
  { fx: 0.5, fy: 0.6, rgb: [0, 200, 255], name: 'cyan' },
  { fx: 0.7, fy: 0.6, rgb: [255, 0, 255], name: 'magenta' },
  { fx: 0.3, fy: 0.75, rgb: [255, 128, 0], name: 'orange' },
  { fx: 0.5, fy: 0.75, rgb: [128, 0, 255], name: 'purple' },
];
const FULL = [
  { fx: 0.2, fy: 0.2, rgb: [255, 0, 0], name: 'red' },
  { fx: 0.5, fy: 0.2, rgb: [0, 255, 0], name: 'green' },
  { fx: 0.8, fy: 0.2, rgb: [0, 0, 255], name: 'blue' },
  { fx: 0.2, fy: 0.5, rgb: [255, 255, 0], name: 'yellow' },
  { fx: 0.5, fy: 0.5, rgb: [0, 255, 255], name: 'cyan' },
  { fx: 0.8, fy: 0.5, rgb: [255, 0, 255], name: 'magenta' },
  { fx: 0.2, fy: 0.8, rgb: [255, 128, 0], name: 'orange' },
  { fx: 0.5, fy: 0.8, rgb: [128, 0, 255], name: 'purple' },
  { fx: 0.8, fy: 0.8, rgb: [0, 128, 0], name: 'dkgreen' },
];
const MARKERS = (process.env.GRID === 'full') ? FULL : CHEST;
const TAG = process.env.TAG ? '-' + process.env.TAG : '';

function homography(src, dst) {
  const N = src.length;
  const norm = (pts) => {
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const s = Math.sqrt(2) / (pts.reduce((a, p) => a + Math.hypot(p[0] - mx, p[1] - my), 0) / pts.length || 1);
    return { T: [[s, 0, -s * mx], [0, s, -s * my], [0, 0, 1]], pts: pts.map(([x, y]) => [s * (x - mx), s * (y - my)]) };
  };
  const A = norm(src), B = norm(dst), M = [];
  for (let i = 0; i < N; i++) {
    const x = A.pts[i][0], y = A.pts[i][1], u = B.pts[i][0], v = B.pts[i][1];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u]);
    M.push([0, 0, 0, x, y, 1, -v * x, -v * y, -v]);
  }
  const n8 = 8, ATA = Array.from({ length: n8 }, () => new Float64Array(n8)), ATb = new Float64Array(n8);
  for (const row of M) for (let i = 0; i < n8; i++) { for (let j = 0; j < n8; j++) ATA[i][j] += row[i] * row[j]; ATb[i] += row[i] * -row[n8]; }
  const Aug = ATA.map((r, i) => { const a = Array.from(r); a.push(ATb[i]); return a; });
  for (let c = 0; c < n8; c++) {
    let piv = c; for (let r = c + 1; r < n8; r++) if (Math.abs(Aug[r][c]) > Math.abs(Aug[piv][c])) piv = r;
    const t = Aug[c]; Aug[c] = Aug[piv]; Aug[piv] = t;
    const p = Aug[c][c]; for (let j = c; j <= n8; j++) Aug[c][j] /= p;
    for (let r = 0; r < n8; r++) { if (r === c) continue; const f = Aug[r][c]; for (let j = c; j <= n8; j++) Aug[r][j] -= f * Aug[c][j]; }
  }
  const h = Aug.map((r) => r[n8]);
  const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  const inv = (T) => { const a = T[0][0], b = T[0][1], c = T[0][2], d = T[1][0], e = T[1][1], f = T[1][2]; const det = a * e - b * d; return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det], [0, 0, 1]]; };
  const mul = (X, Y) => X.map((r) => [0, 1, 2].map((k) => r[0] * Y[0][k] + r[1] * Y[1][k] + r[2] * Y[2][k]));
  return mul(mul(inv(B.T), Hn), A.T);
}
const apply = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };

(async () => {
  const [, , ptId = '12659', viewId = '1'] = process.argv;
  const capture = process.argv.includes('--capture');
  let imgFile = path.join(LAB, 'calib-c-' + ptId + '-v' + viewId + TAG + '-r0.jpg');
  let W, H;

  if (capture) {
    const { bootstrap } = require('../../core/bootstrap');
    const app = bootstrap().app;
    const product = app.make('product'), gallery = app.make('gallery'), design = app.make('design');
    const r = await product.detail(ptId);
    const pd = (r.data && r.data.product_description) || {};
    const face = (pd.print_areas || []).find((f) => String(f.id) === String(viewId)) || (pd.print_areas || [])[0];
    W = face.width; H = face.height;
    const sq = Math.round(Math.min(W, H) * 0.04);
    const els = MARKERS.map((m) => '<rect x="' + Math.round(W * m.fx - sq / 2) + '" y="' + Math.round(H * m.fy - sq / 2) + '" width="' + sq + '" height="' + sq + '" fill="rgb(' + m.rgb.join(',') + ')"/>');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>' + els.join('') + '</svg>';
    const src = path.join(LAB, 'calib-c-src-' + ptId + '-v' + viewId + TAG + '.jpg');
    await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(src);
    const up = await gallery.upload({ image: src, cn_name: 'CALIB2-' + ptId, en_name: 'CALIB2-' + ptId });
    console.log('[1] 上传图库码 ' + up.data.code);
    const pr = await design.preview({ productTypeId: ptId, defaultViewId: Number(viewId), imageWidth: 1600, cfgs: [{ view_id: Number(viewId), gallery_code: up.data.code, width: W, height: H, top_x: 0, top_y: 0 }] });
    const imgs = (pr.data.colors[0].renderings) || [];
    const u = imgs[0].big_img || imgs[0].small_img;
    fs.writeFileSync(imgFile, Buffer.from(await (await fetch(u)).arrayBuffer()));
    fs.writeFileSync(path.join(LAB, 'calib-c-' + ptId + '-v' + viewId + TAG + '.meta.json'), JSON.stringify({ printArea: { W: W, H: H }, url: u }, null, 2));
    console.log('[2] mockup -> ' + path.basename(imgFile));
  } else {
    const meta = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-c-' + ptId + '-v' + viewId + TAG + '.meta.json'), 'utf8'));
    W = meta.printArea.W; H = meta.printArea.H;
  }

  const raw = await sharp(imgFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = raw.data, info = raw.info, iw = info.width, ih = info.height, ch = info.channels;
  console.log('mockup ' + iw + 'x' + ih + '  印刷区 ' + W + 'x' + H);

  const tag = new Int8Array(iw * ih).fill(-1);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y * iw + x) * ch;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mxv = Math.max(r, g, b), mnv = Math.min(r, g, b);
    if (mxv - mnv < 80 || mxv < 110) continue;
    let best = -1, bd = 1e9;
    for (let k = 0; k < MARKERS.length; k++) {
      const c = MARKERS[k].rgb;
      const d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
      if (d < bd) { bd = d; best = k; }
    }
    if (bd > 110 * 110) continue;
    tag[y * iw + x] = best;
  }

  function components(k) {
    const seen = new Uint8Array(iw * ih), out = [], st = [];
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const p = y * iw + x;
      if (seen[p] || tag[p] !== k) continue;
      st.length = 0; st.push(p); seen[p] = 1;
      let n = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
      while (st.length) {
        const q = st.pop(), qx = q % iw, qy = (q - qx) / iw;
        n++; sx += qx; sy += qy;
        if (qx < minx) minx = qx; if (qx > maxx) maxx = qx;
        if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + d[0], ny = qy + d[1];
          if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
          const q2 = ny * iw + nx; if (seen[q2] || tag[q2] !== k) continue;
          seen[q2] = 1; st.push(q2);
        }
      }
      out.push({ n: n, cx: sx / n, cy: sy / n, w: maxx - minx + 1, h: maxy - miny + 1 });
    }
    return out.sort((a, b) => b.n - a.n);
  }

  const pairs = [];
  console.log('\n标记检测（按色 + 连通域）:');
  MARKERS.forEach((m, k) => {
    const comps = components(k).filter((c) => c.n >= 25 && c.w <= 70 && c.h <= 70 && c.w / c.h > 0.45 && c.w / c.h < 2.2);
    const best = comps[0];
    if (best) {
      console.log('  ' + m.name.padEnd(8) + 'OK n=' + String(best.n).padStart(4) + ' ' + best.w + 'x' + best.h + ' c=(' + best.cx.toFixed(1) + ',' + best.cy.toFixed(1) + ')' + (comps.length > 1 ? '  [候选' + comps.length + ']' : ''));
      pairs.push({ fx: m.fx, fy: m.fy, px: best.cx, py: best.cy, w: best.w, h: best.h, name: m.name });
    } else {
      const all = components(k);
      console.log('  ' + m.name.padEnd(8) + '-- 无紧凑块' + (all[0] ? '（最大域 n=' + all[0].n + ' ' + all[0].w + 'x' + all[0].h + '）' : ''));
    }
  });

  const exclude = (process.env.EXCLUDE || '').split(',').map((s) => s.trim()).filter(Boolean);
  const kept = exclude.length ? pairs.filter((p) => exclude.indexOf(p.name) < 0) : pairs.slice();
  if (exclude.length) console.log('剔除: ' + exclude.join(',') + ' -> 保留 ' + kept.length + ' 对');
  pairs.length = 0; Array.prototype.push.apply(pairs, kept);
  console.log('可用配对: ' + pairs.length + '/' + MARKERS.length);
  if (pairs.length < 4) { console.log('-- 不足 4 个，无法解单应'); return; }

  const dst = pairs.map((p) => [W * p.fx, H * p.fy]);
  const srcPts = pairs.map((p) => [p.px, p.py]);
  const Hm = homography(dst, srcPts);
  console.log('\nH(印刷区px -> mockup px):');
  console.log(Hm.map((r) => '  ' + r.map((v) => v.toFixed(8)).join('  ')).join('\n'));
  let maxr = 0;
  console.log('\n残差:');
  pairs.forEach((p, i) => {
    const q = apply(Hm, dst[i][0], dst[i][1]);
    const e = Math.hypot(q[0] - p.px, q[1] - p.py); maxr = Math.max(maxr, e);
    console.log('  ' + p.name.padEnd(8) + ' 真值(' + dst[i][0] + ',' + dst[i][1] + ') -> (' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + ') 实测(' + p.px.toFixed(1) + ',' + p.py.toFixed(1) + ') err=' + e.toFixed(2) + 'px');
  });
  console.log('最大残差 ' + maxr.toFixed(2) + 'px (' + (maxr / iw * 100).toFixed(2) + '%)');

  fs.writeFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + TAG + '.json'),
    JSON.stringify({ productTypeId: ptId, viewId, printArea: { width: W, height: H }, imageSize: [iw, ih], H: Hm, pairs: pairs, maxResidual: maxr }, null, 2));

  const svg2 = pairs.map((p, i) => {
    const q = apply(Hm, dst[i][0], dst[i][1]);
    return '<circle cx="' + p.px.toFixed(1) + '" cy="' + p.py.toFixed(1) + '" r="12" fill="none" stroke="#000000" stroke-width="3"/>' +
      '<line x1="' + (q[0] - 14) + '" y1="' + q[1] + '" x2="' + (q[0] + 14) + '" y2="' + q[1] + '" stroke="#FF0000" stroke-width="3"/>' +
      '<line x1="' + q[0] + '" y1="' + (q[1] - 14) + '" x2="' + q[0] + '" y2="' + (q[1] + 14) + '" stroke="#FF0000" stroke-width="3"/>';
  }).join('');
  const chk = path.join(LAB, 'calib-check-c-' + ptId + '-v' + viewId + TAG + '.jpg');
  await sharp(imgFile).composite([{ input: await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + iw + '" height="' + ih + '">' + svg2 + '</svg>')).png().toBuffer() }]).jpeg({ quality: 92 }).toFile(chk);
  console.log('\n[OK] H -> out/calib-H-' + ptId + '-v' + viewId + TAG + '.json ；验证图 -> out/' + path.basename(chk));
})();
