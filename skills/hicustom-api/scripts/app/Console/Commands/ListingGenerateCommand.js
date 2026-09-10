'use strict';
/**
 * ListingGenerateCommand — listing:generate（总编排，一条龙）。
 * 逻辑已抽到 app/Flows/WorkflowFlow.js（命令与网页共用）；本命令只做 CLI 壳 + 汇总输出。
 * 用法：
 *   node scripts/hi.js listing:generate --product-id 11243 --images "img1.jpg:1,img2.jpg:2" [--fit cover] [--dry-run] [--external-id X] [--customer-id Y]
 */
class ListingGenerateCommand {
  constructor(app) { this.app = app; this.signature = 'listing:generate'; this.description = '抓详情→处理图→上传→合成→缓存CSV+HTML(总编排)'; this.usage = '--product-id <id> --images "img1:view,img2:view" [--fit][--dry-run][--external-id][--customer-id]'; }
  async handle(opts) {
    const productId = opts.productId;
    if (!productId) { console.log('需要 --product-id <空白产品id>。'); return; }
    const dry = !!opts.dryRun;
    console.log('========== listing:generate ==========');
    console.log('产品 ' + productId + (dry ? '  [DRY-RUN，不写入图库/不合成]' : ''));
    try {
      const { WorkflowFlow } = require('../../Flows/WorkflowFlow');
      const res = await new WorkflowFlow(this.app).run({
        productId, images: opts.images, fit: opts.fit, dryRun: dry,
        defaultColorId: opts.defaultColorId, defaultViewId: opts.defaultViewId,
        externalId: opts.externalId, externalCustomerId: opts.externalCustomerId,
        allColors: opts.allColors,
        log: (m) => console.log('  ' + m),
      });
      console.log('\n✅ 已缓存到: output\\' + productId + '  (product.json / product.csv)');
      console.log('  ' + (res.specRows ? '✅ 已登记到 CSV 数据库（' + res.specRows + ' 个规格行）' : '✅ 已登记到 CSV 数据库') + ' id=' + productId);
      console.log('  📊 管理后台: /manage.html' + (dry ? '（dry-run 状态=draft）' : ''));
      console.log('  （列表: /manage.html；详情模板: /product.html?id=' + productId + '）');
    } catch (e) { console.log('❌ ' + e.message); process.exitCode = 1; }
  }
}
module.exports = { ListingGenerateCommand };
