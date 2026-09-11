'use strict';
/**
 * 标定·第1步：生成"定位图"(白底+九宫格洋红标记) → 上传图库 → design:preview(仅主面) → 下载 mockup。
 * 用法: node scripts/dev/lab/_c1-calib-capture.js <productTypeId> <viewId>
 * 产物: out/calib-<id>-v<view>.jpg + out/calib-<id>-v<view>.json（含图库码/URL）
 */
const fs = require('fs');
const path = require('path');
const { bootstrap } = require('../../core/bootstrap');
const sharp = require('../../tools/node_modules/sharp');

const LAB = path.join(__dirname, 'out');
fs.mkdirSync(LAB, { recursive: true });
const MARK = 'magenta';

(async () => {
  const [, , ptId = '12659', viewId = '1'] = process.argv;
  const app = bootstrap().app;
  const product = app.make('product');
  const gallery = app.make('gallery');
  const design = app.make('design');

  const r = await product.detail(ptId);
  const pd = (r.data && r.data.product_description) || {};
  const face = (pd.print_areas || []).find((f) => String(f.id) === String(viewId)) || (pd.print_areas || [])[0];
  const W = face.width, H = face.height;
  console.log('产品 ' + ptId + ' 面' + viewId + ' 印刷区 ' + W + 'x' + H);

  // ① 生成定位图：白底 + 9 个洋红方块（集中在"可见胸口"区域 20%/50%/80%）
  //    （顶部/两侧会被领口与手臂遮挡，故不放到 10%/90%）
  const frac = [0.2, 0.5, 0.8];
  const sq = Math.round(Math.min(W, H) * 0.05);   // 方块边长 5%
  const els = [];
  const marks = [];
  for (const fy of frac) for (const fx of frac) {
    const cx = Math.round(W * fx), cy = Math.round(H * fy);
    els.push(`<rect x="${cx - sq / 2}" y="${cy - sq / 2}" width="${sq}" height="${sq}" fill="#FF00FF"/>`);
    marks.push({ fx, fy, cx, cy });               // 印刷区像素坐标（真值）
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#FFFFFF"/>${els.join('')}</svg>`;
  fs.writeFileSync(path.join(LAB, 'calib-marks-' + ptId + '-v' + viewId + '.json'), JSON.stringify(marks, null, 2));
  const calibImg = path.join(LAB, 'calib-src-' + ptId + '-v' + viewId + '.jpg');
  await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(calibImg);
  console.log('① 定位图 → ' + path.basename(calibImg));

  // ② 上传图库
  const up = await gallery.upload({ image: calibImg, cn_name: 'CALIB-' + ptId, en_name: 'CALIB-' + ptId });
  if (!up || up.code !== 200 || !up.data) { console.log('❌ 上传失败', up && up.status, up && up.msg); return; }
  const code = up.data.code;
  console.log('② 已上传图库码: ' + code);

  // ③ 预览（只主面）
  const pr = await design.preview({
    productTypeId: ptId, defaultViewId: Number(viewId), imageWidth: 1600,
    cfgs: [{ view_id: Number(viewId), gallery_code: code, width: W, height: H, top_x: 0, top_y: 0 }],
  });
  if (!pr || pr.code !== 200) { console.log('❌ 预览失败', pr && pr.status, pr && pr.msg); return; }
  const imgs = (pr.data.colors && pr.data.colors[0] && pr.data.colors[0].renderings) || [];
  const main = imgs[0] && (imgs[0].big_img || imgs[0].small_img);
  console.log('③ 预览返回 ' + imgs.length + ' 张，主图 ' + main);

  // ④ 下载主图（+ 全部）
  const outs = [];
  for (let i = 0; i < imgs.length; i++) {
    const u = imgs[i].big_img || imgs[i].small_img; if (!u) continue;
    const b = Buffer.from(await (await fetch(u)).arrayBuffer());
    const f = path.join(LAB, 'calib-' + ptId + '-v' + viewId + '-r' + i + '.jpg');
    fs.writeFileSync(f, b);
    const m = await sharp(b).metadata();
    outs.push({ i, url: u, file: f, w: m.width, h: m.height });
  }
  console.log('④ 下载 ' + outs.length + ' 张：' + outs.map((o) => o.w + 'x' + o.h).join(', '));
  fs.writeFileSync(path.join(LAB, 'calib-' + ptId + '-v' + viewId + '.json'),
    JSON.stringify({ productTypeId: ptId, viewId, printArea: { width: W, height: H }, galleryCode: code, marker: MARK, renderings: outs }, null, 2), 'utf8');
  console.log('✅ 标定素材就绪: out/calib-' + ptId + '-v' + viewId + '-r0.jpg');
})();
