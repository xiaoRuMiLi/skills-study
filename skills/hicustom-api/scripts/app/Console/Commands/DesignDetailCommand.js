'use strict';
/**
 * DesignDetailCommand — design:detail
 * GET /api/v1/product/{code} 定制产品详情。
 * 用法: design:detail --code JUY8DW3I
 */
class DesignDetailCommand {
  constructor(app) { this.app = app; this.signature = 'design:detail'; this.description = '定制产品详情'; this.usage = '--code <定制产品编码>'; }
  async handle(opts) {
    const design = this.app.make('design');
    console.log('========== design:detail ==========');
    if (!opts.code) { console.log('需要 --code <定制产品编码>。'); return; }
    try {
      const r = await design.detail(opts.code);
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
      const d = r.data || {};
      console.log('编码: ' + d.code + ' | 空白产品: ' + d.product_type_id);
      console.log('中文名: ' + d.cn_name + ' | 英文名: ' + d.en_name);
      console.log('设计名: ' + (d.design_zh_name || '') + ' | 标签: ' + (d.design_zh_tags || ''));
      console.log('预设: 颜色 ' + d.default_color_id + ' | 面 ' + d.default_view_id + ' | 面数 ' + d.view_cnt + ' | 图片 ' + d.default_gallery_code);
      console.log('颜色: ' + (d.colors || []).map((c) => c.cn_name).join(', '));
      console.log('尺码: ' + (d.sizes || []).map((s) => s.name).join(', '));
      const skus = (d.stock_info || []);
      console.log('变体数: ' + skus.length + (skus.length ? ' | 例: ' + skus[0].sku + '(color' + skus[0].color_id + '/size' + skus[0].size_id + ')' : ''));
      const img = (d.colors && d.colors[0] && d.colors[0].renderings && d.colors[0].renderings[0]);
      if (img) console.log('效果图: ' + (img.big_img || img.small_img));
      console.log('创建: ' + d.created);
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { DesignDetailCommand };
