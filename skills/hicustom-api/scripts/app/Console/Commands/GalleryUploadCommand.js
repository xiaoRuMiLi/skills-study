'use strict';
/**
 * GalleryUploadCommand — gallery:upload
 * POST /api/v1/gallery 上传图片到指纹图库。
 * 用法: gallery:upload --file <图片路径> [--cn-name 徽章] [--en-name badge] [--cn-tags "徽章,复古"] [--en-tags "Badge,vintage"] [--external-id X] [--external-customer-id Y]
 */
class GalleryUploadCommand {
  constructor(app) { this.app = app; this.signature = 'gallery:upload'; this.description = '上传图片到图库'; this.usage = '--file <图片路径> [--cn-name ...] [--en-name ...] [--cn-tags ...] [--en-tags ...]'; }
  async handle(opts) {
    const gallery = this.app.make('gallery');
    console.log('========== gallery:upload ==========');
    try {
      const r = await gallery.upload({
        image: opts.file, cn_name: opts.cnName, en_name: opts.enName,
        cn_tags: opts.cnTags, en_tags: opts.enTags, external_id: opts.externalId,
        external_customer_id: opts.externalCustomerId,
      });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ 上传失败 HTTP ' + r.status + ' msg=' + (r.msg || '')); console.log(JSON.stringify(r.raw).slice(0, 300)); return; }
      const d = r.data || {};
      console.log('✅ 上传成功 图片编码: ' + d.code);
      console.log('  中文名: ' + d.cn_name + ' | 英文名: ' + d.en_name);
      console.log('  尺寸: ' + (d.size ? d.size.width + 'x' + d.size.height : '?'));
      console.log('  design_img: ' + d.design_img);
      console.log('  preview_img: ' + d.preview_img);
      console.log('  创建时间: ' + d.created);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { GalleryUploadCommand };
