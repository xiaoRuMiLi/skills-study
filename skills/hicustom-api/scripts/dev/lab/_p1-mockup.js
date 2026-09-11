'use strict';
/**
 * P1 本地 mockup 引擎：把「印刷区尺寸的设计图」按标定 H 贴到商品照片上（免费、<1s）。
 *
 * 关键：用两份已有渲染做差得到「可见印刷区遮罩」——
 *   A) 标定渲染（白底+标记）  B) 另一份渲染（有色设计）
 *   mask = |A-B| > 阈值  → 正好等于「真正被设计覆盖的可见像素」（自动带遮挡）
 * 遮罩外的像素直接取 A（设计不影响的地方）。
 *
 * 用法: node scripts/dev/lab/_p1-mockup.js <productTypeId> <viewId> <设计图> [outName] [tag]
 * 依赖: out/calib-c-<id>-v<view><tag>-r0.jpg（A） + out/preview-<id>-v<view>-0.jpg（B） + calib-H-*.json
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

const LAB = path.join(__dirname, 'out');

function inv(H) {
  const a = H[0][0], b = H[0][1], c = H[0][2], d = H[1][0], e = H[1][1], f = H[1][2], g = H[2][0], h = H[2][1], i = H[2][2];
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e, D = f * g - d * i, E = a * i - c * g, F = c * d - a * f, G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
  const det = a * A + b * D + c * G;
  return [[A / det, B / det, C / det], [D / det, E / det, F / det], [G / det, Hh / det, I / det]];
}
const ap = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };

/** 构建/读取遮罩 + 底图 */
async function getBaseAndMask(ptId, viewId, tagArg) {
  const baseF = path.join(LAB, 'base-' + ptId + '-v' + viewId + tagArg + '.png');
  const maskF = path.join(LAB, 'mask-' + ptId + '-v' + viewId + tagArg + '.png');
  if (fs.existsSync(baseF) && fs.existsSync(maskF)) {
    return { baseFile: baseF, maskFile: maskF, cached: true };
  }
  const A = path.join(LAB, 'calib-c-' + ptId + '-v' + viewId + tagArg + '-r0.jpg');   // 白底+标记
  const B = path.join(LAB, 'preview-' + ptId + '-v' + viewId + '-0.jpg');             // 有色设计
  if (!fs.existsSync(A) || !fs.existsSync(B)) throw new Error('缺少渲染素材 A/B：' + A + ' | ' + B);
  const a = await sharp(A).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(B).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const iw = a.info.width, ih = a.info.height, ch = a.info.channels;
  const mask = Buffer.alloc(iw * ih);
  let cnt = 0;
  for (let p = 0; p < iw * ih; p++) {
    const i = p * ch;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 40) { mask[p] = 255; cnt++; }
  }
  // 去掉孤立噪点（3x3 邻居少于 3 个则清）
  const m2 = Buffer.from(mask);
  for (let y = 1; y < ih - 1; y++) for (let x = 1; x < iw - 1; x++) {
    const p = y * iw + x; if (!mask[p]) continue;
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mask[(y + dy) * iw + x + dx]) c++;
    if (c < 4) m2[p] = 0;
  }
  await sharp(m2, { raw: { width: iw, height: ih, channels: 1 } }).png().toFile(maskF);
  await sharp(A).png().toFile(baseF);
  console.log('遮罩: ' + (cnt / (iw * ih) * 100).toFixed(2) + '% 覆盖（' + iw + 'x' + ih + '）-> ' + path.basename(maskF));
  return { baseFile: baseF, maskFile: maskF, cached: false };
}

/** 用 H 把设计图贴到 base 上（mask 内） */
async function renderMockup({ ptId, viewId, designFile, outFile, tagArg }) {
  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const H = cal.H, PA = cal.printArea;
  const { baseFile, maskFile } = await getBaseAndMask(ptId, viewId, tagArg);

  const base = await sharp(baseFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = await sharp(maskFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const des = await sharp(designFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const iw = base.info.width, ih = base.info.height, ch = base.info.channels;
  const out = Buffer.from(base.data);
  const Hinv = inv(H);
  const DW = des.info.width, DH = des.info.height, dch = des.info.channels;
  const sample = (fx, fy) => {                       // 双线性采样设计图
    if (fx < 0 || fy < 0 || fx > DW - 1 || fy > DH - 1) return null;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, DW - 1), y1 = Math.min(y0 + 1, DH - 1);
    const tx = fx - x0, ty = fy - y0;
    const o = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const p00 = des.data[(y0 * DW + x0) * dch + k], p10 = des.data[(y0 * DW + x1) * dch + k];
      const p01 = des.data[(y1 * DW + x0) * dch + k], p11 = des.data[(y1 * DW + x1) * dch + k];
      o[k] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
    }
    return o;
  };
  let painted = 0;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const p = y * iw + x;
    if (!mask.data[p * mask.info.channels]) continue;
    const q = ap(Hinv, x, y);                       // mockup -> 印刷区
    const s = sample(q[0] * (DW - 1) / PA.width, q[1] * (DH - 1) / PA.height);
    if (!s) continue;
    const i = p * ch;
    out[i] = s[0]; out[i + 1] = s[1]; out[i + 2] = s[2];
    painted++;
  }
  await sharp(out, { raw: { width: iw, height: ih, channels: ch } }).jpeg({ quality: 92 }).toFile(outFile);
  return { outFile: outFile, painted: painted, iw: iw, ih: ih };
}

if (require.main === module) {
  (async () => {
    const [, , ptId = '12659', viewId = '1', design = '', outName = 'mockup.jpg', tag = ''] = process.argv;
    const tagArg = tag ? '-' + tag : '';
    if (!design) { console.log('用法: node scripts/dev/lab/_p1-mockup.js <id> <view> <设计图> [outName] [tag]'); return; }
    const r = await renderMockup({ ptId, viewId, designFile: path.resolve(design), outFile: path.join(LAB, outName), tagArg });
    console.log('✅ mockup -> out/' + outName + ' (贴了 ' + r.painted + ' px)');
  })();
}

module.exports = { renderMockup, getBaseAndMask };
