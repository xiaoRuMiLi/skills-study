'use strict';
/**
 * watermark.js — 去除图片右下角"AI生成"水印（智谱 glm-image 官方角标）。
 * 方法：从水印左侧的同高度带取一块干净区域，克隆放大盖住右下角。
 * 写进流程：design-area:generate 在 AI 文生图后必须调用，保证成品无水印。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('./node_modules/sharp');

/**
 * @param {string} inputFile 源图路径
 * @param {string} outFile 输出路径（可同 inputFile 覆盖）
 * @param {object} opts 可调水印区域（比例）
 */
async function removeCornerWatermark(inputFile, outFile = inputFile, opts = {}) {
  const W = opts.w || 0.17, Hh = opts.h || 0.09;      // 水印角标占右下角宽/高比例（尽量小，仅罩住角标）
  const meta = await sharp(inputFile).metadata();
  const width = meta.width, height = meta.height;

  const zx = Math.round(width * (1 - W));
  const zy = Math.round(height * (1 - Hh));
  const zw = Math.round(width * W);
  const zh = Math.round(height * Hh);

  // 采样：紧邻水印左侧的同高度带（内容连续），拉伸到水印区大小
  const px = Math.max(0, zx - zw);
  const pw = Math.min(zw, width - px);
  const patch = await sharp(inputFile)
    .extract({ left: px, top: zy, width: pw, height: zh })
    .resize({ width: zw, height: zh })
    .blur(3)   // 高斯模糊，软化边缘、融入背景
    .toBuffer();

  const buf = await sharp(inputFile).composite([{ input: patch, left: zx, top: zy }]).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(outFile, buf); // 支持覆盖同一文件
  return { file: outFile, zone: { zx, zy, zw, zh } };
}

/**
 * 裁掉图片底部的一条"白边"（生成时提示词预留的水印区白边）。
 * 白边在底部，水印也在底部 → 切掉后无水印、无痕迹。
 * @param {string} inputFile
 * @param {string} outFile
 * @param {number} ratio 裁掉底部高度占比（默认 0.12）
 */
async function cropBottomMargin(inputFile, outFile, ratio = 0.12) {
  const meta = await sharp(inputFile).metadata();
  const width = meta.width, height = meta.height;
  const keep = Math.round(height * (1 - ratio));
  const buf = await sharp(inputFile).extract({ left: 0, top: 0, width, height: keep }).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(outFile, buf);
  return { file: outFile, keepH: keep, dropped: height - keep };
}

module.exports = { removeCornerWatermark, cropBottomMargin };
