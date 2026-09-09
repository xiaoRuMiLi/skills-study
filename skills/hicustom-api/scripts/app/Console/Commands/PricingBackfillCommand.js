'use strict';
/**
 * PricingBackfillCommand — pricing:backfill（多国售价回填）。
 * 用 PricingService（config/pricing.json 国别配置 + 汇率1天缓存）为商品算 8 国售价 → detail_json.pricing。
 * 用法: pricing:backfill [--ids 12664,...] [--live] [--dry-run]
 */
const { PricingService } = require('../../Services/PricingService');

class PricingBackfillCommand {
  constructor(app) { this.app = app; this.signature = 'pricing:backfill'; this.description = '多国售价回填(config驱动+汇率1天缓存→8国售价→detail_json.pricing)'; this.usage = '[--ids 1,2] [--live] [--dry-run]'; }
  async handle(opts) {
    const repo = this.app.make('productRepo');
    const svc = new PricingService();
    const dry = !!opts.dryRun;
    const idFilter = opts.ids ? String(opts.ids).split(',').map((s) => String(s.trim())).filter(Boolean) : null;
    console.log('========== pricing:backfill ==========' + (dry ? '  [DRY-RUN]' : ''));
    // 先确保汇率新鲜（>1天则拉最新，写回 config）
    const fr = await svc.ensureFreshRates({ force: !!opts.live });
    console.log('汇率源: ' + svc.cfg.rate_source + ' | 更新时间: ' + svc.cfg.rate_updated_at + (fr.fresh ? ' (1天内, 用缓存)' : ' (已刷新)'));
    if (dry) { console.log('[dry-run] 跳过写库'); return; }
    const r = await svc.backfill({ repo, ids: idFilter });
    console.log('✅ 已定价 ' + r.count + ' 个商品（8国）→ detail_json.pricing');
    const sample = Object.entries(r.pricing).slice(0, 12).map(([id, per]) => id + ': ' + Object.entries(per).map(([k, v]) => k + '=' + v.symbol + v.price).join(' ')).join('\n  ');
    if (sample) console.log('  ' + sample);
  }
}
module.exports = { PricingBackfillCommand };
