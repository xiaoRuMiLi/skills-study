'use strict';
/**
 * GalleryPullCommand — gallery:pull
 * 从商家后台「图库 / 图库收藏」拉取图片原图（走导出 ZIP）。
 *
 * 用法：
 *   node scripts/hi.js gallery:pull --list                      # 只看收藏夹与数量
 *   node scripts/hi.js gallery:pull                             # 拉「图库收藏」全部 → input/gallery-fav/
 *   node scripts/hi.js gallery:pull --ids 98378293,98378385     # 只拉指定图片
 *   node scripts/hi.js gallery:pull --out input/复活节 --scope gallery   # 从「我的图库」拉
 *   node scripts/hi.js gallery:pull --no-extract --keep-zip     # 只下 ZIP 不解压
 * 依赖：.env 的 HICUSTOM_MERCHANT_COOKIE（同 shipping:quote）；解压用系统 tar/Expand-Archive。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function safeName(s) {
  return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '_').trim() || 'gallery-pull';
}
function extractZip(zipFile, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  try { execFileSync('tar', ['-xf', zipFile, '-C', destDir], { stdio: 'ignore' }); return 'tar'; }
  catch (e) { /* fallback */ }
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${zipFile}" -DestinationPath "${destDir}" -Force`], { stdio: 'ignore' });
  return 'Expand-Archive';
}

class GalleryPullCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'gallery:pull';
    this.description = '拉取商家后台「图库/图库收藏」图片原图（导出ZIP→解压）';
    this.usage = '[--list] [--ids a,b,c] [--scope category|gallery] [--out 目录] [--zip 文件] [--no-extract] [--keep-zip] [--page-size 200] [--timeout 180]';
  }

  async handle(opts) {
    const config = this.app.make('config');
    const cg = this.app.make('customerGallery');
    console.log('========== gallery:pull ==========');
    if (!cg._hasCookie()) { console.log('❌ 未配置 HICUSTOM_MERCHANT_COOKIE（.env）。请登录商家后台后取其 Cookie 填入。'); process.exitCode = 1; return; }

    // 收藏夹概览
    try {
      const cats = await cg.categories();
      const shown = cats.folders.filter((f) => f.count == null || f.count > 0);
      console.log('收藏夹: ' + cats.groups.join(' / ') + '   分类: ' + shown.map((f) => '[' + f.id + ']' + f.name + '(' + f.count + ')').join('  '));
    } catch (e) { console.log('⚠️ 读取收藏夹失败: ' + e.message); }

    const list = async () => {
      const r = await cg.listAll({ pageSize: Number(opts.pageSize) || 200, scope: opts.scope || 'category', catId: opts.cat });
      console.log('共 ' + r.total + ' 张（取回 ' + r.list.length + '）');
      r.list.slice(0, 10).forEach((x, i) => console.log('  ' + String(i + 1).padStart(3) + '. [' + x.code + '] ' + x.width + 'x' + x.height + '  ' + x.size + '  ' + String(x.customer_alias_name || x.name || '').slice(0, 40)));
      if (r.list.length > 10) console.log('  … 其余 ' + (r.list.length - 10) + ' 张');
      return r;
    };

    let items = [];
    if (opts.list) { await list(); return; }

    if (opts.ids) {
      const want = new Set(String(opts.ids).split(',').map((s) => s.trim()));
      const r = await cg.listAll({ pageSize: Number(opts.pageSize) || 200, scope: opts.scope || 'category' });
      items = r.list.filter((x) => want.has(String(x.id)) || want.has(String(x.code)));
      if (!items.length) { console.log('❌ --ids 未匹配到任何图片'); process.exitCode = 1; return; }
      console.log('按 --ids 命中 ' + items.length + ' 张');
    } else {
      const r = await list();
      items = r.list;
    }
    if (!items.length) { console.log('没有可拉取的图片。'); return; }

    const tag = safeName(opts.out ? path.basename(String(opts.out)) : 'gallery-fav');
    const outDir = path.resolve(opts.out || path.join(config.inputDir, 'gallery-fav'));
    const zipFile = path.resolve(opts.zip || path.join(path.dirname(config.tokenCachePath), 'gallery-pull.zip'));

    // ① 建导出任务
    const exp = await cg.export(items.map((x) => x.id));
    console.log('① 已建导出任务：' + items.length + ' 张');

    // ② 轮询
    const rec = await cg.waitExport({ ids: exp.ids, timeoutMs: (Number(opts.timeout) || 180) * 1000, log: (m) => console.log(m) });
    console.log('② 导出完成：' + rec.code + '（' + rec.export_num + '/' + rec.num + ' 张，用时 ' + rec.process_time + '）');

    // ③ 下载 ZIP
    const buf = await cg.downloadZip(rec.code);
    fs.mkdirSync(path.dirname(zipFile), { recursive: true });
    fs.writeFileSync(zipFile, buf);
    console.log('③ ZIP：' + zipFile + '  ' + (buf.length / 1048576).toFixed(2) + ' MB');

    // ④ 解压
    if (!opts.noExtract) {
      const via = extractZip(zipFile, outDir);
      const files = fs.readdirSync(outDir).filter((f) => fs.statSync(path.join(outDir, f)).isFile());
      const total = files.reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
      console.log('④ 已解压(' + via + ') → ' + outDir + '  共 ' + files.length + ' 个文件，' + (total / 1048576).toFixed(2) + ' MB');
    }

    // ⑤ 清单
    const manifest = path.join(path.dirname(zipFile), tag + '-manifest.json');
    const extOf = (x) => { const e = String(x.ext || '').toLowerCase(); return e.includes('png') ? 'png' : e.includes('webp') ? 'webp' : 'jpg'; };
    fs.writeFileSync(manifest, JSON.stringify(items.map((x) => ({
      id: x.id, code: x.code, name: x.customer_alias_name || x.name, tags: x.customer_alias_tags || x.tags,
      width: x.width, height: x.height, size: x.size,
      file: x.id + '.' + extOf(x),            // ZIP 内文件名 = 图片 id + 扩展名
      preview: x.imageUrl,
    })), null, 2), 'utf8');
    console.log('⑤ 清单：' + manifest);

    if (!opts.keepZip) { try { fs.unlinkSync(zipFile); console.log('⑥ 已删除 ZIP（--keep-zip 可保留）'); } catch (e) { /* ignore */ } }
    console.log('\n✅ 原图输出 → ' + outDir);
  }
}

module.exports = { GalleryPullCommand, extractZip };
