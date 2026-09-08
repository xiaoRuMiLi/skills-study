'use strict';
/**
 * DesignPreviewCommand — design:preview
 * GET /api/v1/product-preview 定制产品自动合成 效果图预览/调试。
 * 用法: design:preview --product-type-id 11774 --cfgs '[{"view_id":1,"gallery_code":"YNQF8A","width":1000,"height":1000,"top_x":0,"top_y":0}]' [--default-color-id 29] [--default-view-id 1] [--image-width 300]
 */
class DesignPreviewCommand {
  constructor(app) { this.app = app; this.signature = 'design:preview'; this.description = '定制产品自动合成 效果图预览'; this.usage = '--product-type-id <id> --cfgs \'[{"view_id":1,"gallery_code":"..","width":..,"height":..,"top_x":..,"top_y":..}]\' [--default-color-id N] [--default-view-id N] [--image-width 300]'; }
  async handle(opts) {
    const design = this.app.make('design');
    console.log('========== design:preview (自动合成预览) ==========');
    if (!opts.productTypeId) { console.log('需要 --product-type-id <空白产品id>。'); return; }
    let cfgs = opts.cfgs;
    if (cfgs && typeof cfgs === 'string') { try { cfgs = JSON.parse(cfgs); } catch (e) { console.log('--cfgs 不是合法 JSON。'); return; } }
    try {
      const r = await design.preview({ productTypeId: opts.productTypeId, defaultColorId: opts.defaultColorId, defaultViewId: opts.defaultViewId, imageWidth: opts.imageWidth, cfgs });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      console.log('产品: ' + d.cn_name + ' / ' + d.en_name + ' (空白产品 ' + d.product_type_id + ')');
      console.log('预设: 颜色 ' + d.default_color_id + ' | 面 ' + d.default_view_id + ' | 图片 ' + d.default_gallery_code + ' | 面数 ' + d.view_cnt);
      console.log('设计名: ' + (d.design_zh_name || '') + ' | 标签: ' + (d.design_zh_tags || ''));
      console.log('颜色数: ' + (d.colors || []).length + ' | 尺码数: ' + (d.sizes || []).length);
      const imgs = (d.colors && d.colors[0] && d.colors[0].renderings) || [];
      if (imgs.length) console.log('效果图(小/大): ' + (imgs[0].small_img || '') + '\n           ' + (imgs[0].big_img || ''));
      console.log('主图: ' + (d.image || ''));
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { DesignPreviewCommand };
