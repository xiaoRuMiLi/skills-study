'use strict';
/**
 * GalleryEditCommand — gallery:edit
 * PATCH /api/v1/gallery/{code} 图库图片编辑（只传要改的字段）。
 * 用法: gallery:edit --code YVXGRO [--cn-name 徽章] [--en-name badge] [--cn-tags "x,y"] [--en-tags "a,b"] [--type 9] [--external-id X] [--external-customer-id Y] [--categorys "1,2"]
 */
class GalleryEditCommand {
  constructor(app) { this.app = app; this.signature = 'gallery:edit'; this.description = '编辑图库图片(名称/标签/分类/类型)'; this.usage = '--code <编码> [--cn-name ...] [--en-name ...] [--cn-tags ...] [--en-tags ...] [--type 1|2|9] [--categorys "1,2"] [--external-id ...] [--external-customer-id ...]'; }
  async handle(opts) {
    const gallery = this.app.make('gallery');
    console.log('========== gallery:edit ==========');
    if (!opts.code) { console.log('需要 --code <图片编码>。'); return; }
    const fields = {
      cn_name: opts.cnName, en_name: opts.enName, cn_tags: opts.cnTags, en_tags: opts.enTags,
      type: opts.type, external_id: opts.externalId, external_customer_id: opts.externalCustomerId,
    };
    if (opts.categorys) fields.categorys = String(opts.categorys).split(',').map((s) => s.trim()).filter(Boolean);
    if (!Object.values(fields).some((v) => v != null && v !== '')) { console.log('至少传一个要修改的字段（--cn-name/--en-name/--cn-tags/--en-tags/--type/--categorys/--external-id/...）。'); return; }
    try {
      const r = await gallery.edit(opts.code, fields);
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      console.log('✅ 已更新 ' + d.code + ' | 名称: ' + d.cn_name + ' / ' + d.en_name);
      console.log('  标签: ' + d.cn_tags + ' / ' + d.en_tags + ' | 类型: ' + d.type);
      console.log('  modified: ' + d.modified);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { GalleryEditCommand };
