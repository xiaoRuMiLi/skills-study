'use strict';
/**
 * GalleryDetailCommand — gallery:detail
 * GET /api/v1/gallery/{code} 单张图片详情。
 * 用法: gallery:detail --code YVXGRO [--lang 1]
 */
class GalleryDetailCommand {
  constructor(app) { this.app = app; this.signature = 'gallery:detail'; this.description = '单张图片详情'; this.usage = '--code <图片编码> [--lang 1|2]'; }
  async handle(opts) {
    const gallery = this.app.make('gallery');
    console.log('========== gallery:detail ==========');
    if (!opts.code) { console.log('需要 --code <图片编码>。'); return; }
    try {
      const r = await gallery.detail(opts.code, { lang: opts.lang });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      console.log('编码: ' + d.code + ' | 名称: ' + d.name);
      console.log('标签: ' + d.tags + ' | 类型: ' + d.type + ' (1主题/2背景/9都有)');
      console.log('尺寸: ' + (d.size ? d.size.width + 'x' + d.size.height : '?'));
      console.log('design_img: ' + d.design_img);
      console.log('preview_img: ' + d.preview_img);
      console.log('创建: ' + d.created);
      console.log('分类: ' + JSON.stringify((d.categorys || []).map((x) => x.id)));
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { GalleryDetailCommand };
