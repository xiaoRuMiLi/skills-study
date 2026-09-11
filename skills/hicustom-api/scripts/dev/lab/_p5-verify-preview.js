'use strict';
/**
 * P2 复核：把「本地迭代好的设计」上传 -> design:preview（真实渲染）-> 量红字 bbox -> 与目标比 IoU。
 * 目的：验证「本地 mockup + 标定 H」与真实渲染器一致。
 * 用法: node scripts/dev/lab/_p5-verify-preview.js <id> <view> <tag>
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const { bootstrap } = require('../../core/bootstrap');

const LAB = path.join(__dirname, 'out');
const ap = (H, x, y) => { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]; };
const iou = (a, b) => { const ix = Math.max(0, Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx) + 1), iy = Math.max(0, Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny) + 1); const inter = ix * iy; const ua = (a.maxx - a.minx + 1) * (a.maxy - a.miny + 1) + (b.maxx - b.minx + 1) * (b.maxy - b.miny + 1) - inter; return ua > 0 ? inter / ua : 0; };
async function bboxOfColor(file, test, minN) {
  const raw = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data, iw = raw.info.width, ih = raw.info.height, ch = raw.info.channels;
  const m = new Uint8Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const i = (y * iw + x) * ch; if (test(d[i], d[i + 1], d[i + 2])) m[y * iw + x] = 1; }
  const seen = new Uint8Array(iw * ih), st = []; let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, tot = 0;
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
  const app = bootstrap().app;
  const gallery = app.make('gallery'), design = app.make('design');
  const cal = JSON.parse(fs.readFileSync(path.join(LAB, 'calib-H-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const H = cal.H, PA = cal.printArea;
  const target = JSON.parse(fs.readFileSync(path.join(LAB, 'target-' + ptId + '-v' + viewId + tagArg + '.json'), 'utf8'));
  const designFile = path.join(LAB, 'design-' + ptId + '-v' + viewId + tagArg + '.jpg');

  const up = await gallery.upload({ image: designFile, cn_name: 'VERIFY-' + ptId, en_name: 'VERIFY-' + ptId });
  console.log('[1] 上传图库码 ' + up.data.code);
  const pr = await design.preview({ productTypeId: ptId, defaultViewId: Number(viewId), imageWidth: 1600, cfgs: [{ view_id: Number(viewId), gallery_code: up.data.code, width: PA.width, height: PA.height, top_x: 0, top_y: 0 }] });
  const imgs = (pr.data.colors[0].renderings) || [];
  const u = imgs[0].big_img || imgs[0].small_img;
  const realF = path.join(LAB, 'verify-real-' + ptId + '-v' + viewId + tagArg + '.jpg');
  fs.writeFileSync(realF, Buffer.from(await (await fetch(u)).arrayBuffer()));
  console.log('[2] 真实渲染 -> ' + path.basename(realF) + '\n    ' + u);

  const tb = target.bboxPrint;
  const corners = [[tb.x0, tb.y0], [tb.x1, tb.y0], [tb.x1, tb.y1], [tb.x0, tb.y1]].map((c) => ap(H, c[0], c[1]));
  const tgt = { minx: Math.round(Math.min.apply(null, corners.map((c) => c[0]))), maxx: Math.round(Math.max.apply(null, corners.map((c) => c[0]))), miny: Math.round(Math.min.apply(null, corners.map((c) => c[1]))), maxy: Math.round(Math.max.apply(null, corners.map((c) => c[1]))) };

  const ours = await bboxOfColor(realF, (r, g, b) => r > 190 && g < 70 && b < 70, 50);
  const fmt = (o) => 'x[' + o.minx + ',' + o.maxx + '] y[' + o.miny + ',' + o.maxy + '] 宽' + (o.maxx - o.minx + 1) + ' 高' + (o.maxy - o.miny + 1) + ' 中心(' + ((o.minx + o.maxx) / 2).toFixed(0) + ',' + ((o.miny + o.maxy) / 2).toFixed(0) + ')';
  console.log('\n[真实渲染] 目标: ' + fmt(tgt));
  console.log('[真实渲染] 我们: ' + fmt(ours));
  console.log('[真实渲染] IoU: ' + iou(ours, tgt).toFixed(3));

  // 真实渲染 vs 本地 mockup 的像素差（几何一致性）
  const mk = path.join(LAB, 'mockup-' + ptId + '-v' + viewId + tagArg + '.jpg');
  if (fs.existsSync(mk)) {
    const a = await sharp(mk).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(realF).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const iw = Math.min(a.info.width, b.info.width), ih = Math.min(a.info.height, b.info.height);
    let diff = 0, n = 0;
    for (let y = 0; y < ih; y += 2) for (let x = 0; x < iw; x += 2) {
      const ia = (y * a.info.width + x) * a.info.channels, ib = (y * b.info.width + x) * b.info.channels;
      diff += Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      n += 3;
    }
    console.log('[本地mockup vs 真实渲染] 平均像素差: ' + (diff / n).toFixed(1) + ' / 255');
  }

  const left = await sharp(path.join(LAB, 'blank-' + ptId + '-r0-0.jpg')).resize(1200, 1200).png().toBuffer();
  const rect = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect x="' + tgt.minx + '" y="' + tgt.miny + '" width="' + (tgt.maxx - tgt.minx) + '" height="' + (tgt.maxy - tgt.miny) + '" fill="none" stroke="#00FF00" stroke-width="4"/><rect x="' + ours.minx + '" y="' + ours.miny + '" width="' + (ours.maxx - ours.minx) + '" height="' + (ours.maxy - ours.miny) + '" fill="none" stroke="#FF0000" stroke-width="4"/></svg>')).png().toBuffer();
  const right = await sharp(realF).resize(1200, 1200).composite([{ input: rect }]).png().toBuffer();
  const cmp = path.join(LAB, 'cmp-real-' + ptId + '-v' + viewId + tagArg + '.jpg');
  await sharp({ create: { width: 2420, height: 1200, channels: 3, background: '#FFFFFF' } }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: 1220, top: 0 }]).jpeg({ quality: 92 }).toFile(cmp);
  console.log('\n对比图(左:空白 右:**真实渲染**) -> out/' + path.basename(cmp));
})();
