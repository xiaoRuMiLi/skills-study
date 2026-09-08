'use strict';
/**
 * DesignAreaService — 给商品图加"定制区"标记文字（独立流程）。
 * 读输入图 → 自动判断明暗 → 居中虚线框 + "YOUR DESIGN HERE" 等文字 → 合成输出。
 * 依赖：scripts/tools/ 的 sharp。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 在输入图上叠加"定制区"标记。
 * @param {string} inputFile 源图路径
 * @param {object} opts { productId, productName, mainText, subText, outDir, baseName }
 */
async function mark(inputFile, opts = {}) {
  const src = sharp(inputFile);
  const meta = await src.metadata();
  const W = meta.width, H = meta.height;
  // 平均亮度 → 决定文字/边框颜色（深底用浅字，浅底用深字）；--text-color 可强制
  const st = await src.stats();
  const lum = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  const autoDark = lum < 132;
  const force = opts.textColor; // auto | light | dark
  const dark = force === 'light' ? false : force === 'dark' ? true : autoDark;
  const fill = dark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.42)';
  const dash = dark ? 'rgba(255,255,255,0.85)' : 'rgba(30,30,30,0.85)';

  const mainText = opts.mainText || 'YOUR DESIGN HERE';
  const subText = opts.subText || 'Any Color · Text · Logo · Photo';

  // 布局：--posV top|middle|bottom，--boxW 宽度占比(0~1)，--scale 文字缩放，--box none|dashed
  const posV = opts.posV || 'middle';
  const boxOn = (opts.box || 'dashed') !== 'none';
  const boxW = Math.round(W * (opts.boxW || 0.72));
  const boxH = Math.min(Math.round(H * 0.20 * (opts.scale || 1)), Math.round(boxW * 0.26));
  const x = Math.round((W - boxW) / 2);
  const y = posV === 'top' ? Math.round(H * 0.06) : posV === 'bottom' ? Math.round(H * 0.94 - boxH) : Math.round((H - boxH) / 2);
  const cx = Math.round(W / 2), cy = Math.round(y + boxH / 2);

  const mainFS = Math.max(18, Math.min(Math.round(W * 0.07 * (opts.scale || 1)), Math.round(H * 0.06 * (opts.scale || 1))));
  const subFS = Math.max(12, Math.round(mainFS * 0.45));
  const mainY = boxOn ? Math.round(cy - subFS * 0.1) : posV === 'top' ? Math.round(H * 0.12) : posV === 'bottom' ? Math.round(H * 0.88) : Math.round(H * 0.5);
  const subY = mainY + Math.round(mainFS * 0.78);
  const ls = Math.round(mainFS * 0.08); // 字间距

  // 字色：--text-color 可为 auto|light|dark|<hex/颜色名>（黄色推荐 #FFD700 / #FFC107）
  const tc = opts.textColor || 'auto';
  let fg = dark ? '#ffffff' : '#1c1c1c'; // 默认：auto 按明暗
  if (tc === 'light') fg = '#ffffff';
  else if (tc === 'dark') fg = '#1c1c1c';
  else if (tc !== 'auto') fg = tc;
  // 自定义/彩色字加描边保证可读（黄色在亮底也能看清）
  const customColor = (tc !== 'auto' && tc !== 'light' && tc !== 'dark');
  const outline = customColor ? ' stroke="rgba(0,0,0,0.55)" stroke-width="' + Math.max(2, Math.round(mainFS * 0.06)) + '" stroke-linejoin="round" paint-order="stroke"' : '';
  const artFont = opts.font || 'Segoe Script, Brush Script MT, Comic Sans MS, Georgia, cursive';

  const rect = boxOn ? `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${Math.round(boxH * 0.14)}"
          fill="${fill}" stroke="${dash}" stroke-width="${Math.max(2, Math.round(boxH * 0.02))}" stroke-dasharray="14 10" />` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${rect}
    <text x="${cx}" y="${mainY}" font-family="${artFont}" font-weight="700"
          font-size="${mainFS}" fill="${fg}" text-anchor="middle" letter-spacing="${ls}"${outline}>${esc(mainText)}</text>
    <text x="${cx}" y="${subY}" font-family="${artFont}" font-weight="400"
          font-size="${subFS}" fill="${fg}" text-anchor="middle" opacity="0.95"${outline}>${esc(subText)}</text>
  </svg>`;

  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.mkdirSync(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, (opts.baseName || 'design-area') + '.jpg');
  await sharp(inputFile).composite([{ input: overlay }]).jpeg({ quality: 92 }).toFile(outFile);
  return { file: outFile, outDir: opts.outDir, W, H, dark };
}

module.exports = { mark };
