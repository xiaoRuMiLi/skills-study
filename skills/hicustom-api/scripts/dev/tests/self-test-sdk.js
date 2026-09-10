'use strict';
// 设计器 SDK 回调自测：verify sign + list/original 处理 + 文件服务。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createDesignerCallback, computeSign } = require('../../app/Sdk/DesignerCallback');

const inputDir = path.join(__dirname, '..', '..', '..', '.hicustom', 'sdk-gallery');
fs.mkdirSync(inputDir, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(inputDir, 'A10000001.png'), PNG);
fs.writeFileSync(path.join(inputDir, 'B10000001.png'), PNG);

const base = 'http://127.0.0.1:8899';
const secret = 'TEST_SECRET';
const cb = createDesignerCallback({ inputDir, appSecret: secret, callbackBaseUrl: base });

let ok = 0, bad = 0;
const c = (l, x) => { console.log((x ? '  OK ' : '  XX ') + l); x ? ok++ : bad++; };

// sign 计算一致性
const sign = computeSign({ timestamp: '1663296378', ids: ['A10000001', 'B10000001'] }, secret);
c('sign 计算成功(hmacsha256)', typeof sign === 'string' && sign.length === 64);

// list
const list = cb.handleList({ page: '1', size: '30' });
c('gallery/list 返回 success + total=2', list.body.code === 'success' && list.body.data.total === 2);
c('gallery/list 含 preview_img 指向本服务器', list.body.data.data[0].preview_img.indexOf('/files/') >= 0);

// original 带正确 sign
const goodSign = computeSign({ timestamp: '1663296378', ids: ['A10000001', 'B10000001'] }, secret);
const orig = cb.handleOriginal({ ids: 'A10000001,B10000001', timestamp: '1663296378', sign: goodSign }, secret);
c('gallery/original 正确 sign → img_map', orig.body.code === 200 && orig.body.data.img_map['A10000001'] && orig.body.data.img_map['B10000001']);
const origBad = cb.handleOriginal({ ids: 'A10000001', timestamp: '1663296378', sign: 'bad' }, secret);
c('gallery/original 错误 sign → 401', origBad.statusCode === 401);

// 清理
fs.rmSync(inputDir, { recursive: true, force: true });
console.log('\n结果: ' + ok + ' 通过, ' + bad + ' 失败');
process.exit(bad ? 1 : 0);
