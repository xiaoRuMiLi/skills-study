'use strict';
/**
 * 临时自测：① cover 适配尺寸正确性 ② 长 CJK / 长英文串不再溢出画布（文字不被切）
 * 用法：node scripts/dev/tests/_test-fit-wrap.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const imageTool = require('../../tools/image');
const { stamp } = require('../../app/Services/TextStampService');

const TMP = path.join(__dirname, '..', '..', '..', '.hicustom', 'tmp-test');
fs.mkdirSync(TMP, { recursive: true });

/** 扫描非背景像素的左右边界，判断有没有贴边/被裁 */
async function inkBox(file, threshold = 128) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      if (lum < threshold) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, width, height };
}

(async () => {
  let fail = 0;
  const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fail++; };

  // ---------- ① cover 适配 ----------
  console.log('① cover 适配（先裁后加字的画布）');
  const wide = path.join(TMP, 'wide.jpg');
  await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#3366aa' } }).jpeg().toFile(wide);
  const buf = await imageTool.fitImage({ input: wide, targetW: 1200, targetH: 800, fit: 'cover' });
  const fit = path.join(TMP, 'wide.print.jpg');
  imageTool.save(buf, fit);
  const fm = await sharp(fit).metadata();
  ok(fm.width === 1200 && fm.height === 800, 'cover 输出 = 1200x800（实际 ' + fm.width + 'x' + fm.height + '）');

  // ---------- ② 长 CJK / 长英文串不溢出 ----------
  console.log('② 换行兜底（长中文无空格 / 超长英文串）');
  const base = path.join(TMP, 'base.jpg');
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ffffff' } }).jpeg().toFile(base);

  const cases = [
    { label: '长中文整句（无空格, auto→缩字号单行）', text: '这是一个非常长的中文标题完全没有空格应该被切成多行显示', size: 'auto' },
    { label: '超长英文单词（auto）', text: 'SUPERCALIFRAGILISTICEXPIALIDOCIOUSANDSOMEMORELETTERS', size: 'auto' },
    { label: '中英混排长句（auto）', text: 'Custom 定制区标记 Photo/Image/Text/Logo 请在此处放置您的专属设计图案', size: 'auto' },
    // ★ 断行路径：显式字号 → 必须按字符断行、绝不溢出
    { label: '长中文整句（显式 120px → 逐字断行）', text: '这是一个非常长的中文标题完全没有空格应该被切成多行显示', size: 120 },
    { label: '超长英文单词（显式 120px → 逐字断行）', text: 'SUPERCALIFRAGILISTICEXPIALIDOCIOUSANDSOMEMORELETTERS', size: 120 },
    { label: '多词（wrap 模式 → 逐词堆叠）', text: 'Custom Door Mat Premium Quality', size: 'wrap' },
  ];
  for (const c of cases) {
    const out = path.join(TMP, 'out-' + Math.random().toString(36).slice(2, 7) + '.jpg');
    const res = await stamp(base, {
      lines: [{ text: c.text, color: '#000000', font: 'bold', weight: 800, posV: 'middle', size: c.size, letterSpacing: 0.04, outline: { color: '#000000', width: 0 } }],
      block: { widthRatio: 0.7, heightRatio: 0.9, vAlign: 'middle', safeMargin: 0.045 },
      background: { enabled: false }, outFile: out, format: 'jpeg', quality: 92,
    });
    const box = await inkBox(out);
    const mx = Math.round(0.045 * 1200), my = Math.round(0.045 * 800);
    const inside = box.minX >= mx - 2 && box.maxX <= 1199 - mx + 2 && box.minY >= 0 && box.maxY <= 799;
    ok(inside, c.label + ' → 墨迹 x[' + box.minX + ',' + box.maxX + '] y[' + box.minY + ',' + box.maxY + ']（安全边距 x<' + mx + '）; 行数 ' + res.lines.length);
  }

  console.log(fail ? '\n结果: ' + fail + ' 项失败' : '\n结果: 全部通过 ✅');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('自测异常:', e); process.exit(2); });
