'use strict';
/**
 * OriginalArchive.js — 图案原稿归档规范。
 * 把「设计/合成所用图案原稿」归档到 output/<productId>/原稿/。
 * - 始终保存「加文字前」原稿；
 * - 若加了文字，则额外保存「加文字后」版本，文件名加 `_加文字` 后缀。
 * 目的：客户后续要这个图案时，能直接从这里拿原稿。
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {object} opts
 * @param {string|number} opts.productId  空白产品 id
 * @param {string} opts.outputDir         output 根目录（config.outputDir）
 * @param {Array<{src:string, name?:string, suffix?:string}>} opts.items
 *   src: 源文件路径；name: 可选归档名（默认取源文件名）；suffix: 可选后缀(如 '_加文字')
 * @returns {{dir:string|null, files:string[]}}
 */
function archiveOriginal({ productId, outputDir, items }) {
  if (productId == null || !outputDir) return { dir: null, files: [] };
  const dir = path.join(outputDir, String(productId), '原稿');
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const it of items || []) {
    if (!it || !it.src || !fs.existsSync(it.src)) continue;
    try {
      const ext = path.extname(it.src) || '.jpg';
      const rawName = it.name || path.basename(it.src, ext);
      const name = String(rawName).replace(/[\\/:*?"<>|]/g, '_').trim() || '原稿';
      const outName = (name + (it.suffix || '')) + ext;
      const out = path.join(dir, outName);
      fs.copyFileSync(it.src, out);
      files.push(outName);
    } catch (e) {
      console.log('  ⚠️ 原稿归档失败 ' + it.src + ': ' + e.message);
    }
  }
  return { dir, files };
}

module.exports = { archiveOriginal };
