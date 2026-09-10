'use strict';
/**
 * SampleListCommand — sample:list（列出排版样稿库 type-setting-images/）。
 * 用法: sample:list [--grep 关键字] [--dir 目录]
 * 样稿文件命名 = 商品名/类别（如 衬衫.jpg / 网球拍.jpg），"适合类别" 即文件名本身。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../../tools/node_modules/sharp');
const { listSamples } = require('../../Support/TypeSetting');
const { ROOT } = require('../../../core/Config');

class SampleListCommand {
  constructor(app) { this.app = app; this.signature = 'sample:list'; this.description = '列出排版样稿(type-setting-images)'; this.usage = '[--grep 关键字] [--dir 目录]'; }
  async handle(opts) {
    const config = this.app.make('config');
    const dir = opts.dir ? (path.isAbsolute(opts.dir) ? opts.dir : path.join(ROOT, opts.dir)) : config.typeSettingDir;
    console.log('========== sample:list ==========');
    console.log('样稿目录: ' + dir);
    if (!fs.existsSync(dir)) { console.log('（目录不存在）'); return; }
    let files = listSamples(dir);
    if (opts.grep) files = files.filter((f) => f.includes(opts.grep));
    if (!files.length) { console.log('（无样稿）'); return; }
    console.log('共 ' + files.length + ' 个样稿:\n');
    for (const f of files) {
      const full = path.join(dir, f);
      const base = path.basename(f, path.extname(f));
      let dim = '';
      try { const m = await sharp(full).metadata(); dim = (m.width || '?') + 'x' + (m.height || '?'); } catch (e) { /* ignore */ }
      let kb = '';
      try { kb = (fs.statSync(full).size / 1024).toFixed(0) + 'KB'; } catch (e) { /* ignore */ }
      console.log('  • ' + base + '   [适合类别: ' + base + ']   ' + f + (dim ? '  ' + dim : '') + (kb ? '  ' + kb : ''));
    }
    console.log('\n用法: node scripts/hi.js design-area:generate --product-id <id> [--image 图案] --sample <类别名|auto>');
  }
}
module.exports = { SampleListCommand };
