'use strict';
/**
 * GalleryBatchCommand — gallery:batch
 * 批量：读 <inputDir> 下的图片 -> 逐张 upload -> 结果写 <outputDir>/upload-manifest.json(+csv)。
 * --input/--output 可覆盖 config.paths；--sleep 每次间隔毫秒（默认 800，尊重限流）。
 * 仅支持 png/jpg/jpeg。
 */
const fs = require('fs');
const path = require('path');

class GalleryBatchCommand {
  constructor(app) { this.app = app; this.signature = 'gallery:batch'; this.description = '批量上传输入夹图片，结果写输出夹'; this.usage = '[--input DIR] [--output DIR] [--sleep MS]'; }
  async handle(opts) {
    const config = this.app.make('config');
    const gallery = this.app.make('gallery');
    const inputDir = path.resolve(opts.input || config.inputDir);
    const outputDir = path.resolve(opts.output || config.outputDir);
    const ext = /\.(png|jpe?g)$/i;

    console.log('========== gallery:batch ==========');
    if (!fs.existsSync(inputDir)) { console.log('❌ 输入夹不存在: ' + inputDir); process.exitCode = 1; return; }
    fs.mkdirSync(outputDir, { recursive: true });
    const files = fs.readdirSync(inputDir).filter((f) => ext.test(f)).sort();
    if (!files.length) { console.log('输入夹无 png/jpg 图片: ' + inputDir); return; }

    console.log('输入夹: ' + inputDir + ' | 发现 ' + files.length + ' 张 -> 输出夹: ' + outputDir);
    const sleep = Number(opts.sleep) || 800;
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const imgPath = path.join(inputDir, f);
      const name = f.replace(ext, '');
      let r;
      try {
        r = await gallery.upload({ image: imgPath, cn_name: name, en_name: name });
        if (r.status >= 400 || r.code !== 200) { results.push({ file: f, ok: false, msg: r.msg || ('HTTP ' + r.status) }); console.log('  [' + (i + 1) + '/' + files.length + '] ' + f + ' ❌ ' + (r.msg || r.status)); }
        else { results.push({ file: f, ok: true, code: r.data.code, design_img: r.data.design_img, preview_img: r.data.preview_img, created: r.data.created }); console.log('  [' + (i + 1) + '/' + files.length + '] ' + f + ' ✅ ' + r.data.code + ' ' + r.data.design_img); }
      } catch (e) { results.push({ file: f, ok: false, msg: e.message }); console.log('  [' + (i + 1) + '/' + files.length + '] ' + f + ' ❌ ' + e.message); }
      if (i < files.length - 1) await new Promise((res) => setTimeout(res, sleep));
    }

    // 写清单（json + csv）
    const jsonFile = path.join(outputDir, 'upload-manifest.json');
    fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2), 'utf8');
    const csv = [['file', 'ok', 'code', 'design_img', 'preview_img', 'created', 'msg']]
      .concat(results.map((r) => [r.file, r.ok ? '1' : '0', r.code || '', r.design_img || '', r.preview_img || '', r.created || '', r.msg || '']))
      .map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    fs.writeFileSync(path.join(outputDir, 'upload-manifest.csv'), '\uFEFF' + csv, 'utf8');

    const okN = results.filter((r) => r.ok).length;
    console.log('\n✅ 完成 ' + okN + '/' + results.length + ' | 清单: ' + jsonFile + ' (+csv)');
  }
}
module.exports = { GalleryBatchCommand };
