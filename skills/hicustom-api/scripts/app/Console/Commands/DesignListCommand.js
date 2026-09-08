'use strict';
/**
 * DesignListCommand — design:list
 * GET /api/v1/products 定制产品列表（分页）。
 * 用法: design:list [--page 1] [--page-size 20] [--lang 1|2] [--created-from "2022-01-01 00:00:00"] [--external-id ...] [--customer-code ...]
 */
class DesignListCommand {
  constructor(app) { this.app = app; this.signature = 'design:list'; this.description = '定制产品列表(分页)'; this.usage = '[--page 1] [--page-size 20] [--lang 1] [--created-from ...] [--created-to ...] [--customer-code ...] [--external-id ...]'; }
  async handle(opts) {
    const design = this.app.make('design');
    console.log('========== design:list ==========');
    try {
      const r = await design.list({
        page: opts.page, pageSize: opts.pageSize, lang: opts.lang, createdFrom: opts.createdFrom, createdTo: opts.createdTo,
        customerCode: opts.customerCode, externalCustomerId: opts.externalCustomerId, externalId: opts.externalId,
      });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      const list = d.data || [];
      console.log('第 ' + d.current_page + '/' + d.last_page + ' 页 | 共 ' + d.total + ' 条 | 本页 ' + list.length + ' 条\n');
      for (const it of list) {
        console.log('  [' + it.code + '] ' + (it.cn_name || '') + '  | 空白产品 ' + it.product_type_id + '  | ' + (it.created || '') + '  | ' + (it.image || ''));
      }
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { DesignListCommand };
