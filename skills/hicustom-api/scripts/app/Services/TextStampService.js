'use strict';
/**
 * TextStampService — 通用「给图案叠加文字」引擎（独立、纯本地，只依赖 sharp）。
 *
 * 模型：把整段文字当作一个「文字块」，块尺寸受两个比例约束：
 *   - block.widthRatio  整块文字占图案宽度比（0.1~1，默认 0.7）= 块内最宽行宽度上限
 *   - block.heightRatio 整块文字占图案高度比（0.1~1，默认 0.5）= 块高度上限
 *
 * 能力：
 *  - N 行文字，每行独立：内容 / 颜色 / 字体 / 粗细 / 位置(居中|偏上|偏下) / 字号 / 字间距 / 描边。
 *  - 字号自适应：单行时实测反推，使该行正好占「块宽」。
 *  - **逐单词换行**：若某行文字（按其字号）宽度超过块宽，则按单词贪心换行，使每行 ≤ 块宽；
 *    若整块高度超过块高，则整体等比缩小字号直至放得下。
 *  - 无描边 / 透明背景（由配置控制）。
 *
 * 输出：<outFile>（默认 jpeg）。返回 { file, W, H, dark, lines:[...] }。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const DEFAULT_FONTS = {
  modern: 'Arial, Helvetica, sans-serif',
  bold: 'Arial Black, Impact, sans-serif',
  elegant: "Georgia, 'Times New Roman', serif",
  script: "'Segoe Script', 'Brush Script MT', cursive",
  comic: "'Comic Sans MS', cursive",
};

const LINE_BOX = 0.82;   // 行盒高相对字号
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function resolveFont(v, fonts) {
  const map = Object.assign({}, DEFAULT_FONTS, fonts || {});
  if (v == null || v === '' || v === '-') return map.bold;
  const key = String(v).trim();
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  if (map[lower]) return map[lower];
  return key.replace(/"/g, "'");
}

function isLightColor(c) {
  const s = String(c || '').trim();
  let r, g, b, m;
  if ((m = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i))) {
    r = parseInt(m[1], 16); g = parseInt(m[2], 16); b = parseInt(m[3], 16);
  } else if ((m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i))) {
    r = parseInt(m[1] + m[1], 16); g = parseInt(m[2] + m[2], 16); b = parseInt(m[3] + m[3], 16);
  } else if ((m = s.match(/^rgba?\(([^)]+)\)$/i))) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    r = p[0]; g = p[1]; b = p[2];
  } else { return true; }
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255 > 0.6;
}

/** 用 sharp 栅格化 + 去边，实测一行文字在指定字号下的像素宽度（与最终合成同一引擎）。 */
async function measureWidth({ text, fontFamily, fontWeight, fontSize, letterSpacingPx }) {
  const f = Math.max(6, Math.round(fontSize));
  const pad = Math.ceil(f * 2);
  const W = Math.ceil(f * (String(text).length + 3)) + pad * 2;
  const H = Math.ceil(f * 3) + pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
    + `<text x="${W / 2}" y="${H / 2}" font-family="${fontFamily}" font-weight="${fontWeight}" `
    + `font-size="${f}" letter-spacing="${Math.max(0, Number(letterSpacingPx) || 0)}" `
    + `text-anchor="middle" dominant-baseline="central" fill="#000000" stroke-width="0">${esc(text)}</text></svg>`;
  const out = await sharp(Buffer.from(svg)).png().trim().toBuffer({ resolveWithObject: true });
  return out.info.width;
}

/** 单行自适应字号：使整行宽度 ≈ targetW。 */
async function fitLine(line, targetW) {
  let size = 200;
  for (let i = 0; i < 4; i++) {
    let w = 0;
    try { w = await measureWidth({ text: line.text, fontFamily: line.fontFamily, fontWeight: line.fontWeight, fontSize: size, letterSpacingPx: line.letterSpacingRatio * size }); }
    catch (e) { w = 0; }
    if (!w) break;
    const next = clamp(Math.round(size * targetW / w), 6, 4000);
    if (Math.abs(next - size) <= 1) { size = next; break; }
    size = next;
  }
  return size;
}

/** 按单词贪心换行：每行宽度 ≤ maxW。返回 [{text,width,overflow}]。 */
async function wrapWords(line, fontSize, maxW) {
  const words = String(line.text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const widthOf = (t) => measureWidth({ text: t, fontFamily: line.fontFamily, fontWeight: line.fontWeight, fontSize, letterSpacingPx: line.letterSpacingRatio * fontSize });
  const tol = maxW * 1.03; // 容忍 3%（实测/取整误差，避免自适应行被误判超宽而多折一行）
  const rows = [];
  let cur = '', curW = 0;
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    const cw = await widthOf(cand);
    if (!cur || cw <= tol) { cur = cand; curW = cw; }
    else { rows.push({ text: cur, width: curW, overflow: curW > tol }); cur = w; curW = await widthOf(w); }
  }
  if (cur) rows.push({ text: cur, width: curW, overflow: curW > tol });
  return rows;
}

/**
 * 主入口：给 inputFile 叠加文字，写出 outFile。
 * @param {string} inputFile 图案源图
 * @param {object} opts {
 *   lines:[{text,color,font,weight,posV,size,letterSpacing,outline:{color,width}}],
 *   block:{widthRatio,heightRatio,vAlign,nudgeUp,lineGap,rowGap},
 *   background:{enabled,color,radius,padX,padY},
 *   fonts:{alias->family}, outFile, format, quality }
 */
async function stamp(inputFile, opts = {}) {
  const img = sharp(inputFile);
  const meta = await img.metadata();
  const W = meta.width, H = meta.height;
  const st = await img.stats();
  const lum = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  const darkBg = lum < 132;

  const block = Object.assign({ widthRatio: 0.7, heightRatio: 0.5, vAlign: 'middle', nudgeUp: 0, lineGap: 0.35, rowGap: 0.12, safeMargin: 0.045 }, opts.block || {});
  const bg = Object.assign({ enabled: false, color: 'rgba(0,0,0,0.48)', radius: 12, padX: 0.02, padY: 0.02 }, opts.background || {});
  const fonts = opts.fonts || {};
  // 安全边距：任何文字都不许贴边
  const sm = clamp(Number(block.safeMargin) || 0, 0, 0.2);
  const marginX = Math.round(sm * W), marginY = Math.round(sm * H);
  const boxW = Math.max(10, Math.min(clamp(Number(block.widthRatio) || 0.7, 0.1, 1) * W, W - 2 * marginX));
  const boxH = Math.max(10, Math.min(clamp(Number(block.heightRatio) || 0.5, 0.1, 1) * H, H - 2 * marginY));

  const inputLines = (opts.lines || []).filter((l) => l && String(l.text == null ? '' : l.text).trim() !== '');
  if (!inputLines.length) throw new Error('没有可渲染的文字行（每行 text 为空？）');

  // ① 准备每行：字体/基础字号/颜色/描边
  const prepared = [];
  for (const l of inputLines) {
    const fontFamily = resolveFont(l.font, fonts);
    const fontWeight = (l.weight == null || l.weight === '') ? 800 : l.weight;
    const letterSpacingRatio = l.letterSpacing == null ? 0.04 : Number(l.letterSpacing);

    let fg = (l.color == null || l.color === '') ? '#FFE873' : l.color;
    const auto = String(fg).toLowerCase() === 'auto' || fg === '自动';
    if (auto) fg = darkBg ? '#FFFFFF' : '#1A1A1A';

    const outline = l.outline || {};
    let outlineColor = outline.color || (isLightColor(fg) ? '#000000' : '#FFFFFF');
    if (auto && !outline.color) outlineColor = darkBg ? '#000000' : '#FFFFFF';
    const outlineWidthRatio = outline.width == null ? 0 : Number(outline.width);

    let baseSize;
    if (l.size === 'auto' || l.size == null || l.size === '') {
      baseSize = await fitLine({ text: l.text, fontFamily, fontWeight, letterSpacingRatio }, boxW);
    } else if (l.size === 'wrap') {
      // 强制按词换行：字号取「最宽的单词正好占满块宽」→ 每行≈一个单词（用于复刻“逐词堆叠”的排版）
      const widest = String(l.text).split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
      baseSize = await fitLine({ text: widest, fontFamily, fontWeight, letterSpacingRatio }, boxW);
    } else {
      const n = Number(l.size);
      baseSize = clamp(n <= 1 ? Math.round(n * W) : Math.round(n), 6, 4000);
    }

    const hAlign = ['left', 'center', 'right'].includes(String(l.align || '').toLowerCase()) ? String(l.align).toLowerCase() : 'center';
    prepared.push({
      text: String(l.text), fontFamily, fontWeight, letterSpacingRatio,
      fg, outlineColor, outlineWidthRatio, posV: l.posV || 'middle', hAlign, baseSize,
    });
  }

  // 分组（按 posV，保持顺序）
  const groups = [];
  const gIndex = {};
  prepared.forEach((ln) => {
    const k = ln.posV;
    if (gIndex[k] == null) { gIndex[k] = groups.length; groups.push({ posV: k, items: [] }); }
    groups[gIndex[k]].items.push(ln);
  });

  // ② 对一个「全局缩放 s」求整块布局，供二分搜索
  const anchorOf = (posV) => posV === 'top' ? Math.round(H * 0.2)
    : posV === 'bottom' ? Math.round(H * 0.8)
      : Math.round(H * 0.5 + (block.nudgeUp || 0) * H);

  async function evalScale(s) {
    const out = [];
    let fits = true;
    for (const g of groups) {
      const rows = [];
      for (const it of g.items) {
        const fs2 = Math.max(6, it.baseSize * s);
        const wrapped = await wrapWords(it, fs2, boxW);
        for (const r of wrapped) {
          if (r.overflow) fits = false;
          rows.push({ text: r.text, width: r.width, fontSize: fs2, item: it, overflow: r.overflow });
        }
      }
      // 高度
      let h = 0;
      for (let i = 0; i < rows.length; i++) {
        h += rows[i].fontSize * LINE_BOX;
        if (i < rows.length - 1) {
          const sameItem = rows[i].item === rows[i + 1].item;
          h += (sameItem ? (block.rowGap || 0) : (block.lineGap || 0)) * rows[i].fontSize;
        }
      }
      if (h > boxH * 1.001) fits = false;
      out.push({ posV: g.posV, rows, totalH: h });
    }
    return { groups: out, fits };
  }

  // 二分：优先 s=1；不满足则向下搜索最大可行 s
  let chosen = await evalScale(1);
  if (!chosen.fits) {
    let lo = 0.05, hi = 1, best = null;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const ev = await evalScale(mid);
      if (ev.fits) { best = ev; lo = mid; } else { hi = mid; }
    }
    chosen = best || await evalScale(0.05);
  }

  // ③ 定位：每组块相对其锚点垂直居中
  const finalRows = [];
  for (const g of chosen.groups) {
    let y = anchorOf(g.posV) - g.totalH / 2;
    // 安全边距：整块留在上下边距内（避免文字贴边/被裁）
    if (H - marginY - g.totalH < marginY) y = marginY;              // 块过高 → 贴安全顶(由缩放兜底)
    else y = Math.max(marginY, Math.min(y, H - marginY - g.totalH));
    for (let i = 0; i < g.rows.length; i++) {
      const r = g.rows[i];
      r.centerY = Math.round(y + r.fontSize * LINE_BOX / 2);
      y += r.fontSize * LINE_BOX;
      if (i < g.rows.length - 1) {
        const sameItem = r.item === g.rows[i + 1].item;
        y += (sameItem ? (block.rowGap || 0) : (block.lineGap || 0)) * r.fontSize;
      }
      finalRows.push(r);
    }
  }

  // ④ 半透明衬底（默认关；开启则按「组」各画一块）
  const padX = (bg.padX || 0) * W, padY = (bg.padY || 0) * H;
  const bandEls = [];
  if (bg.enabled) {
    for (const g of chosen.groups) {
      const maxW = Math.max(...g.rows.map((r) => r.width));
      let top = H, bottom = 0;
      for (const r of g.rows) { top = Math.min(top, r.centerY - r.fontSize * 0.62); bottom = Math.max(bottom, r.centerY + r.fontSize * 0.62); }
      const x = Math.max(0, Math.round(W / 2 - maxW / 2 - padX));
      const yy = Math.max(0, Math.round(top - padY));
      const w = Math.round(Math.min(W, W / 2 + maxW / 2 + padX) - x);
      const h = Math.round(Math.min(H, bottom + padY) - yy);
      bandEls.push(`<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${bg.radius || 0}" fill="${bg.color}"/>`);
    }
  }

  // ⑤ SVG 合成
  const textEls = finalRows.map((r) => {
    const it = r.item;
    const ls = Math.round(it.letterSpacingRatio * r.fontSize);
    const ow = it.outlineWidthRatio > 0 ? Math.max(1, Math.round(it.outlineWidthRatio * r.fontSize)) : 0;
    const stroke = ow > 0 ? ` stroke="${it.outlineColor}" stroke-width="${ow}" stroke-linejoin="round" paint-order="stroke"` : '';
    // 注：librsvg 不生效 dominant-baseline，y 即基线 → 用 cap 高的一半把「行中心」换算成基线
    const baseline = Math.round(r.centerY + r.fontSize * 0.35);
    // 水平对齐：left/center/right（相对整幅，留安全边距 marginX）
    const x = it.hAlign === 'left' ? marginX : it.hAlign === 'right' ? W - marginX : W / 2;
    const anchor = it.hAlign === 'left' ? 'start' : it.hAlign === 'right' ? 'end' : 'middle';
    return `<text x="${x}" y="${baseline}" font-family="${it.fontFamily}" font-weight="${it.fontWeight}" `
      + `font-size="${Math.round(r.fontSize)}" fill="${it.fg}" text-anchor="${anchor}" `
      + `letter-spacing="${ls}"${stroke}>${esc(r.text)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bandEls.join('')}${textEls}</svg>`;

  const outFile = opts.outFile || path.join(path.dirname(inputFile), path.basename(inputFile, path.extname(inputFile)) + '_add_text.jpg');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const fmt = (opts.format || 'jpeg').toLowerCase();
  let pipe = sharp(inputFile).composite([{ input: await sharp(Buffer.from(svg)).png().toBuffer() }]);
  pipe = fmt === 'png' ? pipe.png() : pipe.jpeg({ quality: opts.quality || 92 });
  await pipe.toFile(outFile);

  return {
    file: outFile, W, H, dark: darkBg,
    lines: finalRows.map((r) => ({ text: r.text, fontSize: Math.round(r.fontSize), color: r.item.fg, posV: r.item.posV, centerY: r.centerY })),
  };
}

module.exports = { stamp, resolveFont, isLightColor, DEFAULT_FONTS };
