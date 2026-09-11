'use strict';
/**
 * MockupEngine —— 本地「商品效果图」引擎（把印刷区设计图贴到商品照片上，免费、<1s）。
 *
 * 依赖标定产物：
 *   - H        单应矩阵（印刷区 px → 商品照片 px），由 DesignAlignService.calibrate 得到
 *   - base     底图（标定渲染，遮罩外像素直接取它）
 *   - mask     可见印刷区遮罩（由「白底渲染」与「纯色渲染」两图做差得到，自动带遮挡）
 *
 * 提供：homography / invert / apply / detectMarkers / buildBaseAndMask / renderMockup /
 *       measureBbox / iou / fitLineToRect
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

// ---------- 单应矩阵 ----------
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
  const inv3 = (T) => { const a = T[0][0], b = T[0][1], c = T[0][2], d = T[1][0], e = T[1][1], f = T[1][2]; const det = a * e - b * d; return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det], [0, 0, 1]]; };
  const mul = (X, Y) => X.map((r) => [0, 1, 2].map((k) => r[0] * Y[0][k] + r[1] * Y[1][k] + r[2] * Y[2][k]));
  return mul(mul(inv3(B.T), Hn), A.T);
}
function invert(H) {
  const a = H[0][0], b = H[0][1], c = H[0][2], d = H[1][0], e = H[1][1], f = H[1][2], g = H[2][0], h = H[2][1], i = H[2][2];
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e, D = f * g - d * i, E = a * i - c * g, F = c * d - a * f, G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
  const det = a * A + b * D + c * G;
  return [[A / det, B / det, C / det], [D / det, E / det, F / det], [G / det, Hh / det, I / det]];
}
function apply(H, x, y) { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; }

// ---------- 颜色标记检测 ----------
/** 在照片里按「每个标记一种颜色」检测小块；返回 [{fx,fy,px,py,name}] */
async function detectMarkers(file, markers, opts = {}) {
  const tol = opts.tol || 110, minN = opts.minN || 25, maxBox = opts.maxBox || 70;
  const raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data, iw = raw.info.width, ih = raw.info.height, ch = raw.info.channels;
  const tag = new Int8Array(iw * ih).fill(-1);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y * iw + x) * ch, r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 80 || mx < 110) continue;
    let best = -1, bd = 1e9;
    for (let k = 0; k < markers.length; k++) {
      const c = markers[k].rgb;
      const dd = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
      if (dd < bd) { bd = dd; best = k; }
    }
    if (bd > tol * tol) continue;
    tag[y * iw + x] = best;
  }
  const comps = (k) => {
    const seen = new Uint8Array(iw * ih), out = [], st = [];
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const p = y * iw + x; if (seen[p] || tag[p] !== k) continue;
      st.length = 0; st.push(p); seen[p] = 1;
      let n = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
      while (st.length) {
        const q = st.pop(), qx = q % iw, qy = (q - qx) / iw; n++; sx += qx; sy += qy;
        if (qx < minx) minx = qx; if (qx > maxx) maxx = qx; if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
        for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dd[0], ny = qy + dd[1]; if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
          const q2 = ny * iw + nx; if (seen[q2] || tag[q2] !== k) continue; seen[q2] = 1; st.push(q2);
        }
      }
      out.push({ n: n, cx: sx / n, cy: sy / n, w: maxx - minx + 1, h: maxy - miny + 1 });
    }
    return out.sort((a, b) => b.n - a.n);
  };
  const pairs = [];
  markers.forEach((m, k) => {
    const c = comps(k).filter((x) => x.n >= minN && x.w <= maxBox && x.h <= maxBox && x.w / x.h > 0.45 && x.w / x.h < 2.2);
    if (c[0]) pairs.push({ fx: m.fx, fy: m.fy, px: c[0].cx, py: c[0].cy, name: m.name, cand: c.length });
  });
  return pairs;
}

/** 稳健单应：迭代拟合，剔除残差过大的离群点（如被领口分裂的标记），保留 ≥4 点 */
function robustHomography(dstPts, srcPts, opts = {}) {
  const maxIter = opts.maxIter || 4, minPx = opts.minPx || 4;
  let idx = dstPts.map((_, i) => i);
  let H = null, res = [];
  for (let it = 0; it < maxIter; it++) {
    if (idx.length < 4) { idx = dstPts.map((_, i) => i); break; }
    const d = idx.map((i) => dstPts[i]), s = idx.map((i) => srcPts[i]);
    H = homography(d, s);
    res = idx.map((i) => {
      const p = apply(H, dstPts[i][0], dstPts[i][1]);
      return { i: i, e: Math.hypot(p[0] - srcPts[i][0], p[1] - srcPts[i][1]) };
    });
    const es = res.map((r) => r.e).sort((a, b) => a - b);
    const med = es[Math.floor(es.length / 2)] || 0;
    const limit = Math.max(minPx, med * 3);
    const keep = res.filter((r) => r.e <= limit).map((r) => r.i);
    if (keep.length === idx.length || keep.length < 4) break;
    idx = keep;
  }
  const inSet = {};
  idx.forEach((i) => { inSet[i] = 1; });
  return {
    H: H, inliers: idx, outliers: dstPts.map((_, i) => i).filter((i) => !inSet[i]), residuals: res,
    maxInlier: res.filter((r) => inSet[r.i]).reduce((a, r) => Math.max(a, r.e), 0),
  };
}

// ---------- 底图 + 遮罩 ----------
/** 用「白底渲染 A」与「纯色渲染 B」做差 → 可见印刷区遮罩；底图 = A */
async function buildBaseAndMask({ renderA, renderB, outBase, outMask, diff = 40, cleanup = true }) {
  const a = await sharp(renderA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(renderB).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const iw = a.info.width, ih = a.info.height, ch = a.info.channels;
  const mask = Buffer.alloc(iw * ih);
  let cnt = 0;
  for (let p = 0; p < iw * ih; p++) {
    const i = p * ch;
    const dd = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (dd > diff) { mask[p] = 255; cnt++; }
  }
  if (cleanup) {
    const m2 = Buffer.from(mask);
    for (let y = 1; y < ih - 1; y++) for (let x = 1; x < iw - 1; x++) {
      const p = y * iw + x; if (!mask[p]) continue;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mask[(y + dy) * iw + x + dx]) c++;
      if (c < 4) m2[p] = 0;
    }
    mask.set(m2);
  }
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  await sharp(renderA).png().toFile(outBase);
  await sharp(mask, { raw: { width: iw, height: ih, channels: 1 } }).png().toFile(outMask);
  return { coverage: cnt / (iw * ih), imageSize: [iw, ih] };
}

// ---------- 渲染 ----------
/** 把印刷区尺寸的 designFile 按 H 贴到 base 上（mask 内） */
async function renderMockup({ H, printArea, baseFile, maskFile, designFile, outFile, quality = 92, scale = 1, pre, designBuffer, bufferOnly = false }) {
  /* 性能：输出按 scale 直接采样（真缩放），mask 只查一次/像素；内联矩阵运算（避免闭包开销） */
  // 可选 pre：外部缓存的 base/mask 原始数据（sweep 时只解码一次）；designBuffer：内存中的设计图
  const base = (pre && pre.base) ? pre.base : await sharp(baseFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = (pre && pre.mask) ? pre.mask : await sharp(maskFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const des = designBuffer
    ? await sharp(designBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    : await sharp(designFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const iw = base.info.width, ih = base.info.height, ch = base.info.channels, mch = mask.info.channels;
  const DW = des.info.width, DH = des.info.height, dch = des.info.channels;
  const Hinv = invert(H);
  const out = Buffer.from(base.data);
  const sample = (fx, fy) => {
    if (fx < 0 || fy < 0 || fx > DW - 1 || fy > DH - 1) return null;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, DW - 1), y1 = Math.min(y0 + 1, DH - 1);
    const tx = fx - x0, ty = fy - y0, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const p00 = des.data[(y0 * DW + x0) * dch + k], p10 = des.data[(y0 * DW + x1) * dch + k];
      const p01 = des.data[(y1 * DW + x0) * dch + k], p11 = des.data[(y1 * DW + x1) * dch + k];
      o[k] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
    }
    return o;
  };
  const m = mask.data, b = base.data;
  const ow = Math.max(1, Math.round(iw * scale)), oh = Math.max(1, Math.round(ih * scale));
  const small = Buffer.alloc(ow * oh * ch);
  // 1) base 缩放到 ow×oh（最近邻）
  for (let y = 0; y < oh; y++) {
    const sy = Math.min(ih - 1, Math.floor(y / scale));
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(iw - 1, Math.floor(x / scale));
      const si = (sy * iw + sx) * ch, di = (y * ow + x) * ch;
      small[di] = b[si]; small[di + 1] = b[si + 1]; small[di + 2] = b[si + 2];
    }
  }
  // 2) 贴设计（只在遮罩 bbox 内遍历），内联单应 + 双线性采样
  const h0 = Hinv[0][0], h1 = Hinv[0][1], h2 = Hinv[0][2], h3 = Hinv[1][0], h4 = Hinv[1][1], h5 = Hinv[1][2], h6 = Hinv[2][0], h7 = Hinv[2][1], h8 = Hinv[2][2];
  const kW = (DW - 1) / printArea.width, kH = (DH - 1) / printArea.height;
  const d = des.data;
  let painted = 0;
  // 遮罩 bbox（全分辨率）
  let mX0 = iw, mX1 = -1, mY0 = ih, mY1 = -1;
  for (let y = 0; y < ih; y++) {
    const rowBase0 = y * iw;
    for (let x = 0; x < iw; x++) {
      if (!m[(rowBase0 + x) * mch]) continue;
      if (x < mX0) mX0 = x; if (x > mX1) mX1 = x; if (y < mY0) mY0 = y; if (y > mY1) mY1 = y;
    }
  }
  const oX0 = mX1 < 0 ? 0 : Math.max(0, Math.floor(mX0 * scale)), oX1 = mX1 < 0 ? -1 : Math.min(ow - 1, Math.ceil(mX1 * scale));
  const oY0 = mY1 < 0 ? 0 : Math.max(0, Math.floor(mY0 * scale)), oY1 = mY1 < 0 ? -1 : Math.min(oh - 1, Math.ceil(mY1 * scale));
  for (let y = oY0; y <= oY1; y++) {
    const my = y / scale;
    const sy = Math.min(ih - 1, Math.floor(my));
    const rowBase = sy * iw;
    for (let x = oX0; x <= oX1; x++) {
      const mx = x / scale;
      const sx = Math.min(iw - 1, Math.floor(mx));
      if (!m[(rowBase + sx) * mch]) continue;
      const w0 = h6 * mx + h7 * my + h8; if (w0 === 0) continue;
      const fx = ((h0 * mx + h1 * my + h2) / w0) * kW, fy = ((h3 * mx + h4 * my + h5) / w0) * kH;
      if (fx < 0 || fy < 0 || fx > DW - 1 || fy > DH - 1) continue;
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const x1 = x0 + 1 > DW - 1 ? DW - 1 : x0 + 1, y1 = y0 + 1 > DH - 1 ? DH - 1 : y0 + 1;
      const i00 = (y0 * DW + x0) * dch, i10 = (y0 * DW + x1) * dch, i01 = (y1 * DW + x0) * dch, i11 = (y1 * DW + x1) * dch;
      const di = (y * ow + x) * ch;
      small[di] = (d[i00] * (1 - tx) + d[i10] * tx) * (1 - ty) + (d[i01] * (1 - tx) + d[i11] * tx) * ty;
      small[di + 1] = (d[i00 + 1] * (1 - tx) + d[i10 + 1] * tx) * (1 - ty) + (d[i01 + 1] * (1 - tx) + d[i11 + 1] * tx) * ty;
      small[di + 2] = (d[i00 + 2] * (1 - tx) + d[i10 + 2] * tx) * (1 - ty) + (d[i01 + 2] * (1 - tx) + d[i11 + 2] * tx) * ty;
      painted++;
    }
  }
  if (bufferOnly || !outFile) return { outFile: null, buffer: small, info: { width: ow, height: oh, channels: ch }, painted: painted, imageSize: [ow, oh] };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(small, { raw: { width: ow, height: oh, channels: ch } }).jpeg({ quality }).toFile(outFile);
  return { outFile, painted, imageSize: [ow, oh] };
}

// ---------- 度量 ----------
/** 取满足 test(r,g,b) 的连通域（≥minN）并集 bbox */
async function measureBbox(file, test, minN = 30) {
  const raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return measureBboxRaw(raw.data, raw.info.width, raw.info.height, raw.info.channels, test, minN);
}

/** 直接在内存 raw 数据上量 bbox（免落盘/免解码） */
function measureBboxRaw(d, iw, ih, ch, test, minN = 30) {
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
      for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dd[0], ny = qy + dd[1]; if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const q2 = ny * iw + nx; if (seen[q2] || !m[q2]) continue; seen[q2] = 1; st.push(q2);
      }
    }
    if (n < minN) continue; tot += n;
    if (ax < minx) minx = ax; if (bx > maxx) maxx = bx; if (ay < miny) miny = ay; if (by > maxy) maxy = by;
  }
  return tot >= minN ? { minx, maxx, miny, maxy, n: tot, iw, ih } : null;
}
function iou(a, b) {
  const ix = Math.max(0, Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx) + 1);
  const iy = Math.max(0, Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny) + 1);
  const inter = ix * iy;
  const ua = (a.maxx - a.minx + 1) * (a.maxy - a.miny + 1) + (b.maxx - b.minx + 1) * (b.maxy - b.miny + 1) - inter;
  return ua > 0 ? inter / ua : 0;
}

module.exports = { homography, robustHomography, invert, apply, detectMarkers, buildBaseAndMask, renderMockup, measureBbox, measureBboxRaw, iou };
