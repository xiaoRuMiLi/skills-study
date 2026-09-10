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
  const boxOn = String(opts.box || 'none') === 'dashed';   // 默认无虚线框（用户要求去掉）
  const boxW = Math.round(W * Math.min(opts.boxW || 0.72, 0.66));   // 框宽上限 = 图案宽 2/3
  const boxH = Math.min(Math.round(H * 0.20 * (opts.scale || 1)), Math.round(boxW * 0.26));
  const x = Math.round((W - boxW) / 2);
  const y = posV === 'top' ? Math.round(H * 0.06) : posV === 'bottom' ? Math.round(H * 0.94 - boxH) : Math.round((H - boxH) / 2);
  const cx = Math.round(W / 2), cy = Math.round(y + boxH / 2);

  let mainFS = Math.max(18, Math.min(Math.round(W * 0.07 * (opts.scale || 1)), Math.round(H * 0.06 * (opts.scale || 1))));
  let subFS = Math.max(12, Math.round(mainFS * 0.45));
  // ★ 文字总宽不得超过图案宽度 2/3（用户要求：两边不能顶到边被裁掉）
  const maxTextW = Math.round(W * (2 / 3));                       // 2/3 图案宽
  const pad = Math.round(maxTextW * 0.05);                        // 边缘留 5% 内边距
  const estW = (fs, txt) => fs * 0.55 * String(txt || '').length; // 粗估文本像素宽
  if (estW(mainFS, mainText) > maxTextW - pad) mainFS = Math.max(14, Math.floor((maxTextW - pad) / (0.55 * Math.max(1, String(mainText).length))));
  subFS = Math.max(10, Math.round(mainFS * 0.45));
  if (estW(subFS, subText) > maxTextW - pad) subFS = Math.max(10, Math.floor((maxTextW - pad) / (0.55 * Math.max(1, String(subText).length))));
  const mainY = boxOn ? Math.round(cy - subFS * 0.1) : posV === 'top' ? Math.round(H * 0.12) : posV === 'bottom' ? Math.round(H * 0.88) : Math.round(H * 0.5);
  const subY = mainY + Math.round(mainFS * 0.78);
  const ls = Math.round(mainFS * 0.08); // 字间距

  // 字色：默认「白字 + 粗黑描边」（任何底图都最醒目）；--text-color 可强制
  const tc = opts.textColor || 'auto';
  let fg = '#ffffff';                 // 白字（默认，最强对比）
  let outlineColor = '#000000';
  if (tc === 'dark') { fg = '#000000'; outlineColor = '#ffffff'; }
  else if (tc === 'light') { fg = '#ffffff'; outlineColor = '#000000'; }
  else if (tc !== 'auto') { fg = tc; outlineColor = '#000000'; }
  const customColor = (tc !== 'auto' && tc !== 'light' && tc !== 'dark');
  // 强描边：粗、加粗字体，文字 + 半透明衬底 保证醒目
  const outline = ' stroke="' + outlineColor + '" stroke-width="' + Math.max(4, Math.round(mainFS * 0.18)) + '" stroke-linejoin="round" paint-order="stroke"';
  const artFont = opts.font || 'Arial, Helvetica, sans-serif';

  // 半透明深色衬底（圆角矩形，去虚线边框）——提高任何底图上的可读性
  const band = `<rect x="${Math.round(maxTextW * 0.02)}" y="${Math.round(mainY - subFS * 0.9)}" width="${Math.round(maxTextW * 0.96)}" height="${Math.round(subFS * 1.1 + mainFS * 0.95)}" rx="${Math.round(subFS * 0.3)}" fill="rgba(0,0,0,0.48)" />`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${band}
    <text x="${cx}" y="${mainY}" font-family="${artFont}" font-weight="800"
          font-size="${mainFS}" fill="${fg}" text-anchor="middle" letter-spacing="${ls}"${outline}>${esc(mainText)}</text>
    <text x="${cx}" y="${subY}" font-family="${artFont}" font-weight="600"
          font-size="${subFS}" fill="${fg}" text-anchor="middle"${outline}>${esc(subText)}</text>
  </svg>`;

  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.mkdirSync(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, (opts.baseName || 'design-area') + '.jpg');
  await sharp(inputFile).composite([{ input: overlay }]).jpeg({ quality: 92 }).toFile(outFile);
  return { file: outFile, outDir: opts.outDir, W, H, dark };
}

module.exports = { mark };
