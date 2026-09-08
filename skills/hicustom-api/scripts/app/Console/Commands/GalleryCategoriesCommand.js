'use strict';
/**
 * GalleryCategoriesCommand — gallery:categories
 * GET /api/v1/gallery-categories 图库分类（下拉）。--lang 1中文 2英文。
 */
class GalleryCategoriesCommand {
  constructor(app) { this.app = app; this.signature = 'gallery:categories'; this.description = '图库分类列表'; this.usage = '[--lang 1|2]'; }
  async handle(opts) {
    const gallery = this.app.make('gallery');
    console.log('========== gallery:categories ==========');
    try {
      const r = await gallery.categories({ lang: opts.lang });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const list = Array.isArray(r.data) ? r.data : [];
      console.log('图库分类 ' + list.length + ' 个：');
      const walk = (items, depth) => {
        for (const it of items || []) {
          console.log('  '.repeat(depth) + '- [' + it.id + '] ' + it.name);
          if (it.sub_cg && it.sub_cg.length) walk(it.sub_cg, depth + 1);
        }
      };
      walk(list, 0);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { GalleryCategoriesCommand };
