'use strict';
/**
 * ContrastColor — 纯本地「配色工具」（不用图片理解模型）。
 * 目标：在给定图片（或指定区域）上，挑一个**整体反差大、且与背景不趋同的浅色系**文字色。
 *
 * 方法（程序化）：
 *   1. sharp 缩到小图、读像素 → 背景**平均色 / 平均相对亮度 / 主色相**；
 *   2. 在一组**浅色候选**里逐个打分：
 *      score = WCAG对比度(vs 背景均值)  +  α·色相距离(避开与主色趋同)  +  β·饱和度(够鲜艳)
 *      （背景偏灰时降低色相权重）；
 *   3. 取分最高者；对比度低于阈值可加提示。
 *
 * 依赖：scripts/tools 的 sharp。
 */
const sharp = require('../../tools/node_modules/sharp');

const DEFAULT_CANDIDATES = [
  '#FFFFFF', '#FFE873', '#FFD54F', '#FFC107', '#FFB3D9', '#FF9EC4', '#FF7AB6',
  '#9AD8FF', '#8FD3FF', '#67E8F9', '#A8F0D0', '#C7F0A8', '#FFD8A8',
];

function srgb2lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function relLum(r, g, b) { return 0.2126 * srgb2lin(r) + 0.7152 * srgb2lin(g) + 0.0722 * srgb2lin(b); }
function hex2rgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgb2hex(r, g, b) {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return { h: 0, s: 0, v: mx };
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s: d / mx, v: mx };
}
function contrastRatio(l1, l2) { return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

/** 背景统计：平均色 / 相对亮度 / 主色相 / 饱和度。region 传 {x,y,width,height} 只统计该区域。 */
async function backgroundStats(input, region) {
  let p = sharp(input);
  if (region) {
    const x = Math.max(0, Math.round(region.x || 0));
    const y = Math.max(0, Math.round(region.y || 0));
    const meta = await sharp(input).metadata();
    const width = Math.min(region.width || (meta.width - x), meta.width - x);
    const height = Math.min(region.height || (meta.height - y), meta.height - y);
    if (width > 0 && height > 0) p = p.extract({ left: x, top: y, width, height });
  }
  const { data, info } = await p.resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i + 2 < data.length; i += ch) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++; }
  const r = sr / n, g = sg / n, b = sb / n;
  const h = hsv(r, g, b);
  return { rgb: [r, g, b], hex: rgb2hex(r, g, b), lum: relLum(r, g, b), hue: h.h, sat: h.s };
}

/**
 * 挑文字反差色。
 * @param {string|Buffer} input 图片
 * @param {object} opts { region:{x,y,width,height}, candidates:[hex], minContrast }
 * @returns { color, contrast, hueDist, bgHex, bgLum, bgHue, bgSat }
 */
async function pickContrastColor(input, opts = {}) {
  const candidates = (opts.candidates && opts.candidates.length) ? opts.candidates : DEFAULT_CANDIDATES;
  const minContrast = opts.minContrast == null ? 1.4 : Number(opts.minContrast);
  const st = await backgroundStats(input, opts.region);
  const ranked = [];
  for (const c of candidates) {
    const [r, g, b] = hex2rgb(c);
    const cl = relLum(r, g, b);
    const ratio = contrastRatio(st.lum, cl);
    const ch = hsv(r, g, b);
    let hd = Math.abs(ch.h - st.hue); if (hd > 180) hd = 360 - hd;
    const hueW = st.sat > 0.15 ? 0.8 : 0.15;   // 背景偏灰 → 不重色相
    const score = ratio + hueW * (hd / 180) + 0.15 * ch.s;
    ranked.push({ color: c, score, contrast: ratio, hueDist: hd });
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return {
    color: best.color,
    contrast: Math.round(best.contrast * 100) / 100,
    hueDist: Math.round(best.hueDist),
    bgHex: st.hex,
    bgLum: Math.round(st.lum * 1000) / 1000,
    bgHue: Math.round(st.hue),
    bgSat: Math.round(st.sat * 100) / 100,
    ranked: ranked.map((x) => ({ color: x.color, contrast: Math.round(x.contrast * 100) / 100, hueDist: Math.round(x.hueDist) })),
    warn: best.contrast < minContrast ? '对比度偏低（' + Math.round(best.contrast * 100) / 100 + '），建议改底色更深/更浅或加大描边' : '',
  };
}

function hueOf(hex) { const [r, g, b] = hex2rgb(hex); return hsv(r, g, b).h; }

/**
 * 取 n 个**彼此区分**的反差色（用于多行文字）：第1个取反差最优，
 * 之后逐个挑「与已选色相距离 ≥ minHueGap」的次优者，避免几行颜色趋同。
 */
async function pickDistinctColors(input, n = 2, opts = {}) {
  const r = await pickContrastColor(input, opts);
  const picked = [];
  for (const cand of r.ranked) {
    if (picked.length >= n) break;
    const h = hueOf(cand.color);
    const far = picked.every((p) => { let d = Math.abs(h - hueOf(p)); if (d > 180) d = 360 - d; return d >= (opts.minHueGap == null ? 40 : opts.minHueGap); });
    if (far) picked.push(cand.color);
  }
  // 候选中色相都不够分散 → 兜底顺序补足
  for (const cand of r.ranked) { if (picked.length >= n) break; if (!picked.includes(cand.color)) picked.push(cand.color); }
  return { colors: picked.slice(0, n), info: r };
}

module.exports = { pickContrastColor, pickDistinctColors, backgroundStats, DEFAULT_CANDIDATES, contrastRatio, relLum, hex2rgb, rgb2hex, hueOf };
