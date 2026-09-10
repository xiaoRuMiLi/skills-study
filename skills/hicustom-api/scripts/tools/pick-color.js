#!/usr/bin/env node
'use strict';
/**
 * pick-color.js — 本地配色工具：给图片挑「反差大、与背景不趋同的浅色系」文字色。
 * 用法:
 *   node scripts/tools/pick-color.js <图> [--region x,y,w,h] [--candidates "#a,#b"] [--min-contrast 1.4]
 */
const { pickContrastColor, pickDistinctColors } = require('../app/Support/ContrastColor');

(async () => {
  const args = process.argv.slice(2);
  const input = args[0];
  if (!input) { console.log('用法: node scripts/tools/pick-color.js <图> [--region x,y,w,h] [--candidates "#a,#b"] [--min-contrast 1.4]'); return; }
  let region, candidates, minContrast;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) { const p = args[++i].split(',').map(Number); region = { x: p[0], y: p[1], width: p[2], height: p[3] }; }
    else if (args[i] === '--candidates' && args[i + 1]) { candidates = args[++i].split(',').map((s) => s.trim()).filter(Boolean); }
    else if (args[i] === '--min-contrast' && args[i + 1]) { minContrast = Number(args[++i]); }
  }
  const r = await pickContrastColor(input, { region, candidates, minContrast });
  const dis = await pickDistinctColors(input, 2, { region, candidates, minContrast });
  console.log('背景均值: ' + r.bgHex + '  亮度 ' + r.bgLum + '  色相 ' + r.bgHue + '°  饱和 ' + r.bgSat);
  console.log('候选取色排名（反差优先）:');
  (r.ranked || []).slice(0, 4).forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x.color + '  对比度 ' + x.contrast + '  色相距离 ' + x.hueDist + '°'));
  console.log('→ 两行互异配色: 第1行 ' + (dis.colors[0] || r.color) + '   第2行 ' + (dis.colors[1] || r.color) + '（色相拉开，避免趋同）');
  if (r.warn) console.log('⚠️ ' + r.warn);
})();
