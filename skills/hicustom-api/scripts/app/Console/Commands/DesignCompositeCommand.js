'use strict';
/**
 * DesignCompositeCommand — design:composite
 * POST /api/v1/product 定制产品自动合成（x-www-form-urlencoded）。
 * 根据空白产品 + 图片元素(cfgs) 自动合成定制产品，返回完整展示图（colors[].renderings[]）。
 * 用法: design:composite --product-type-id 11991 --default-color-id 204 --cfgs '[{"view_id":1,"gallery_code":"WJNZWG","width":1371,"height":1300,"top_x":0,"top_y":0}]'
 */
class DesignCompositeCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'design:composite';
    this.description = '定制产品自动合成(出完整展示图)';
    this.usage = '--product-type-id <id> [--default-color-id N] [--default-view-id N] --cfgs \'[{"view_id":1,"gallery_code":"..","width":..,"height":..,"top_x":..,"top_y":..}]\' [--external-id ..] [--external-customer-id ..]';
  }
  async handle(opts) {
    const design = this.app.make('design');
    console.log('========== design:composite (自动合成) ==========');
    if (!opts.productTypeId) { console.log('需要 --product-type-id <空白产品id>。'); return; }
    let cfgs = opts.cfgs;
    if (cfgs && typeof cfgs === 'string') { try { cfgs = JSON.parse(cfgs); } catch (e) { console.log('--cfgs 不是合法 JSON。'); return; } }
    if (!Array.isArray(cfgs) || cfgs.length === 0) { console.log('需要 --cfgs 图片元素参数。'); return; }
    try {
      const r = await design.composite({
        productTypeId: opts.productTypeId, defaultColorId: opts.defaultColorId, defaultViewId: opts.defaultViewId,
        externalId: opts.externalId, externalCustomerId: opts.externalCustomerId, cfgs,
      });
      if (r.status >= 400 || r.code !== 200) { console.log('❌ HTTP ' + r.status + ' msg=' + (r.msg || '')); console.log(JSON.stringify(r.raw).slice(0, 300)); return; }
      const d = r.data || {};
      console.log('✅ 自动合成成功 定制产品: ' + d.code);
      console.log('  中文名: ' + d.cn_name + ' | 英文名: ' + d.en_name);
      console.log('  空白产品: ' + d.product_type_id + ' | 预设面: ' + d.default_view_id + ' (' + d.default_gallery_code + ') | 设计面数: ' + d.view_cnt);
      console.log('  颜色数: ' + ((d.colors || []).length) + ' | 尺码数: ' + ((d.sizes || []).length) + ' | 变体数: ' + ((d.stock_info || []).length));
      const cs = d.colors || [];
      let total = 0;
      for (const c of cs) {
        const rs = c.renderings || [];
        total += rs.length;
        console.log('  ▶ 颜色[' + c.cn_name + '] 效果图 ' + rs.length + ' 张');
        const r0 = rs[0];
        console.log('    示例 big_img: ' + (r0 && r0.big_img));
      }
      console.log('  ✅ 合计展示效果图: ' + total + ' 张');
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { DesignCompositeCommand };
