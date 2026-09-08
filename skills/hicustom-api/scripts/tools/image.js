'use strict';
/**
 * image.js — 图像处理工具（基于 scripts/tools/ 的 sharp）。
 * 核心能力：把客户图处理成「符合印刷区宽高」的图片（默认 cover 居中裁切填满），
 * 用于后续 gallery:upload + design:composite。
 * 依赖：sharp（已装入 scripts/tools/node_modules）。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

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
async function fitImage({ input, targetW, targetH, fit = 'cover', quality = 92 }) {
  const buf = await readImage(input);
  return sharp(buf).resize({ width: targetW, height: targetH, fit, position: 'centre' }).jpeg({ quality }).toBuffer();
}

// 保存 buffer 到文件
function save(buf, file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }

// 读图片宽高
async function dims(input) {
  const buf = await readImage(input);
  const m = await sharp(buf).metadata();
  return { width: m.width, height: m.height, format: m.format };
}

module.exports = { readImage, fitImage, save, dims, IMG_EXT };
