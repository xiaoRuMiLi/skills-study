'use strict';
/**
 * GalleryListCommand — gallery:list
 * GET /api/v1/galleries 图库列表（分页）。
 * 用法: gallery:list [--page 1] [--page-size 20] [--lang 1|2] [--cid 分类id] [--customer-code 11位] [--sort-field created] [--sort-type desc] [--created-from "2022-01-01 00:00:00"] ...
 */
class GalleryListCommand {
  constructor(app) { this.app = app; this.signature = 'gallery:list'; this.description = '图库列表(分页)'; this.usage = '[--page 1] [--page-size 20] [--lang 1] [--cid X] [--customer-code ...] [--sort-field created|size] [--sort-type asc|desc]'; }
  async handle(opts) {
    const gallery = this.app.make('gallery');
    console.log('========== gallery:list ==========');
    try {
      const r = await gallery.list({
        page: opts.page, pageSize: opts.pageSize, lang: opts.lang, cid: opts.cid,
        lowestCids: opts.lowestCids, createdFrom: opts.createdFrom, createdTo: opts.createdTo,
        sortField: opts.sortField, sortType: opts.sortType, customerCode: opts.customerCode,
        externalCustomerId: opts.externalCustomerId, externalId: opts.externalId,
      });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      const list = d.data || [];
      console.log('第 ' + d.current_page + '/' + d.last_page + ' 页 | 共 ' + d.total + ' 条 | 本页 ' + list.length + ' 条\n');
      for (const it of list) {
        console.log('  [' + it.code + '] ' + (it.name || '') + '  ' + (it.created || '') + '  ' + (it.design_img || ''));
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { GalleryListCommand };
