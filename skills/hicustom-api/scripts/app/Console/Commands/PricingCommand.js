'use strict';
/**
 * PricingCommand — pricing:calc（定价计算）。
 * 定价=(采购+物流)÷汇率÷(1-利润率-平台成本)。汇率走 PricingService（config/pricing.json + 1天缓存）。
 */
const { PricingService } = require('../../Services/PricingService');

class PricingCommand {
  constructor(app) { this.app = app; this.signature = 'pricing:calc'; this.description = '定价计算(采购+物流→汇率→售价)'; this.usage = '--product-id <id> --country UK [--procurement X] [--shipping Y] [--profit-rate 0.3] [--platform-cost P] [--live]'; }
  async handle(opts) {
    const repo = this.app.make('productRepo');
    const country = String(opts.country || 'UK').toUpperCase();
    let procurement = Number(opts.procurement), shipping = Number(opts.shipping);
    if (opts.productId) {
      const rec = repo.products().find((x) => String(x.id) === String(opts.productId));
      if (rec) {
        procurement = Number(rec.minPrice) || procurement;
        shipping = Number((rec.specs && rec.specs[0] && rec.specs[0].shipping && rec.specs[0].shipping[country])) || shipping;
      }
    }
    if (!procurement) { console.log('缺少采购价 --procurement（或用 --product-id 从库取 min_price）。'); return; }
    const svc = new PricingService();
    try {
      const r = await svc.computePrice({ country, procurement, shipping, force: !!opts.live });
      console.log('========== pricing:calc (' + country + ' ' + r.currency + ') ==========');
      console.log('采购 ¥' + r.procurement + ' | 物流 ¥' + r.shipping + ' → 成本 ¥' + (r.procurement + r.shipping));
      console.log('汇率源: ' + r.source + ' | 更新时间: ' + r.date);
      console.log('汇率(中间价·取小, 保留' + r.country_precision + '位): ' + r.rate + ' ' + r.currency + '/CNY');
      console.log('利润率 ' + Math.round(r.profitRate * 100) + '% | 平台成本 ' + Math.round(r.platformCost * 100) + '% | 分母 ' + r.denominator.toFixed(4));
      console.log('本地成本 ' + r.baseLocal + ' ' + r.currency);
      console.log('\n💡 建议售价: ' + r.symbol + r.price + ' ' + r.currency + '  ≈ ¥' + Math.round(r.price * r.rate) + '');
      console.log('   公式: (¥' + (r.procurement + r.shipping) + '÷' + r.rate + ') ÷' + r.denominator.toFixed(4));
      return r;
    } catch (e) { console.log('❌ ' + e.message); }
  }
}
module.exports = { PricingCommand };
