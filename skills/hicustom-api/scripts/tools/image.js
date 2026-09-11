'use strict';
/**
 * image.js — 图像处理工具（基于 scripts/tools/ 的 sharp）。
 * 核心能力：把客户图处理成「符合印刷区宽高」的图片（默认 cover 居中裁切填满），
 * 用于后续 gallery:upload + design:composite。
 * 依赖：sharp（已装入 scripts/tools/node_modules）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

/**
 * 超大图内存护栏：sharp 放宽像素上限后会整张解码（约 w*h*4 字节）。
 * 若超过当前可用内存的一半 → 直接报可执行的错误，别把机器拖垮。
 */
function memGuard(w, h, file) {
  const need = w * h * 4;
  const free = os.freemem();
  if (need > free * 0.5) {
    const e = new Error(
      '图片过大 ' + w + 'x' + h + '（解码约需 ' + (need / 1073741824).toFixed(1) + 'GB，当前可用 ' +
      (free / 1073741824).toFixed(1) + 'GB）：' + path.basename(file || '') +
      '。请先缩小该图再用（本机内存不足，无法硬解）。'
    );
    e.code = 'IMAGE_TOO_BIG';
    throw e;
  }
}

const IMG_EXT = /\.(png|jpe?g|jpeg|gif|webp)$/i;

// 从本地路径 / http(s) url / base64 data-url 读取图片 Buffer
async function readImage(src) {
  if (Buffer.isBuffer(src)) return src;
  if (typeof src !== 'string') throw new Error('image 参数必须是路径/URL/base64');
  if (src.startsWith('data:')) {
    const b64 = src.split(',')[1];
    return Buffer.from(b64, 'base64');
  }
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error('下载图片失败: HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  }
  if (fs.existsSync(src)) return fs.readFileSync(src);
  throw new Error('找不到图片文件: ' + src);
}

// 把图片处理成 targetW x targetH（fit: cover=居中裁切填满(默认) / contain=等比留白）
// ⚠️ 花瓣/网络素材常有超大图（如 14883x21048）；sharp 默认有像素上限会直接报错 → 兜底放宽再试。
async function fitImage({ input, targetW, targetH, fit = 'cover', quality = 92 }) {
  const buf = await readImage(input);
  const run = (sharpOpts) => sharp(buf, sharpOpts).resize({ width: targetW, height: targetH, fit, position: 'centre' }).jpeg({ quality }).toBuffer();
  try {
    return await run(undefined);
  } catch (e) {
    if (!/pixel limit/i.test(e.message || '')) throw e;
    const m = await sharp(buf, { limitInputPixels: false }).metadata(); // 头部读取，代价低
    memGuard(m.width, m.height, input);                                 // 内存不够就明确报错
    return run({ limitInputPixels: false });
  }
}

// 保存 buffer 到文件
function save(buf, file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }

// 读图片宽高（超大图兜底放宽像素上限）
async function dims(input) {
  const buf = await readImage(input);
  let m;
  try { m = await sharp(buf).metadata(); }
  catch (e) { if (!/pixel limit/i.test(e.message || '')) throw e; m = await sharp(buf, { limitInputPixels: false }).metadata(); }
  return { width: m.width, height: m.height, format: m.format };
}

module.exports = { readImage, fitImage, save, dims, memGuard, IMG_EXT };
