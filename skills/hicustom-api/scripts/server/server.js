#!/usr/bin/env node
'use strict';
/**
 * server.js — 设计器 SDK 回调服务器（供 HICUSTOM 调用）。
 * 图源 = inputDir 里的图片；图片由本服务器 /files/<name> 提供。
 * 用法: node scripts/server/server.js  →  http://127.0.0.1:8899
 *   GET /gallery/list?page=&size=&kw=            自定义图库（设计器取图源）
 *   GET /gallery/original?ids=A,B&timestamp=..&sign=..   原图地址（保存设计时）
 *   GET /files/<name>                            图片文件
 * 在 HICUSTOM 设计器 iframe 里加：
 *   &customer_gallery_list=http://127.0.0.1:8899/gallery/list
 *   &customer_gallery_map=http://127.0.0.1:8899/gallery/original
 */
const http = require('http');
const Config = require('../core/Config');
const { createDesignerCallback } = require('../app/Sdk/DesignerCallback');

const config = Config.loadConfig();
const port = Number(process.env.HICUSTOM_CALLBACK_PORT || 8899);
const base = process.env.HICUSTOM_CALLBACK_BASE_URL || ('http://127.0.0.1:' + port);
const cb = createDesignerCallback({ inputDir: config.inputDir, appSecret: config.appSecret, callbackBaseUrl: base });

http.createServer(cb.handler).listen(port, () => {
  console.log('✅ 设计器 SDK 回调服务器: ' + base);
  console.log('   图库(取图源):   ' + base + '/gallery/list');
  console.log('   原图地址(保存): ' + base + '/gallery/original');
  console.log('   图片文件:       ' + base + '/files/<图片名>');
  console.log('   图源目录:       ' + config.inputDir + ' | app_secret 已配? ' + (config.appSecret ? '是' : '否'));
  console.log('\n在 HICUSTOM 设计器 iframe 加 customer_gallery_list / customer_gallery_map 参数即可接入。');
});
