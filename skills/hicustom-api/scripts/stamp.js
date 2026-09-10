#!/usr/bin/env node
'use strict';
/**
 * stamp.js — 「给图案叠加文字」独立入口（本地、零 API）。
 *
 *   node scripts/stamp.js <图案文件路径> \
 *     第一行内容 第一行颜色 第一行字体 第一行粗细 第一行位置 \
 *     第二行内容 第二行颜色 第二行字体 第二行粗细 第二行位置
 *
 * 省略/填 "-" = 取 config/stamp.json 默认值。
 * 图案文件路径传文件夹时批量处理，并跳过已带 _add_text 的文件。
 * 输出：<图案文件同目录>/<原名>_add_text.jpg + 前后对比 HTML（8098）。
 */
const { bootstrap } = require('./core/bootstrap');
const { router } = bootstrap();
router.dispatch(['stamp', ...process.argv.slice(2)])
  .catch((e) => { console.error('错误: ' + e.message); process.exit(1); });
