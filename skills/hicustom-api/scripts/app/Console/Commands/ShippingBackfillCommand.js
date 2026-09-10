'use strict';
/**
 * ShippingBackfillCommand — shipping:backfill（物流费规范·批量回填）。
 * 按规范：对每个商品/每个规格（变体）的包装尺寸+重量，在 8 个目标国家试算运费（推荐渠道），
 * 写回 database/products.csv 的 shipping_US/UK/CA/DE/MX/FR/ES/IT 列，并刷新管理后台。
 * 用法: shipping:backfill [--ids 12664,12661,...] [--qty 1] [--dry-run]
 * 国家+邮编口径见 references/shipping-quote.md（UK≠GB）。
 */
const { render: renderAdmin } = require('../../Support/AdminRenderer');

const COUNTRIES = [
  { c: 'US', pc: '10001' }, { c: 'UK', pc: 'SW1A1AA' }, { c: 'CA', pc: 'M5V 2T6' },
  { c: 'DE', pc: '10115' }, { c: 'FR', pc: '75001' }, { c: 'ES', pc: '28001' },
  { c: 'IT', pc: '00184' }, { c: 'MX', pc: '01000' },
];

class ShippingBackfillCommand {
  constructor(app) { this.app = app; this.signature = 'shipping:backfill'; this.description = '物流费规范：8国运费试算→回填products.csv+刷新后台'; this.usage = '[--ids 1,2,3] [--qty 1] [--dry-run]'; }
  async handle(opts) {
    const repo = this.app.make('productRepo');
    const shipping = this.app.make('shipping');
    const config = this.app.make('config');
    const dry = !!opts.dryRun;
    const qty = Number(opts.qty || 1);
    const idFilter = opts.ids ? String(opts.ids).split(',').map((s) => String(s.trim())).filter(Boolean) : null;

    let products = repo.products();
    if (idFilter) products = products.filter((p) => idFilter.includes(String(p.id)));
    if (!products.length) { console.log('没有可回填的商品（用 --ids 指定，或先跑 listing:generate）。'); return; }

    console.log('========== shipping:backfill (物流费规范) ==========' + (dry ? '  [DRY-RUN]' : ''));
    console.log('' + products.length + ' 个商品 | ' + COUNTRIES.length + ' 国 | qty=' + qty + (dry ? '（不写库）' : ''));

    for (const p of products) {
      const perVariant = {};
      const prodShip = {};
      let done = 0, fail = 0, rep = true;
      for (const spec of p.specs) {
        const L = Number(spec.package && spec.package.L), W = Number(spec.package && spec.package.W), H = Number(spec.package && spec.package.H);
        const wt = Number(spec.weight);
        if (!L || !W || !H || !wt) { fail++; continue; }
        const row = {};
        for (const cy of COUNTRIES) {
          try {
            const rows = await shipping.quote({ country: cy.c, postcode: cy.pc, weight: wt, length: L, width: W, height: H, qty });
            const rec = shipping.selectChannel(rows, { country: cy.c });
            row[cy.c] = rec ? Math.round(rec.amount * 100) / 100 : null;
            if (rep) prodShip[cy.c] = shipping.selectTopN(rows, { country: cy.c, n: 2, preferProviders: true }); // 优选+备用渠道（详情页"各国优选"，物流商偏好：云途/递四方全选，燕文/顺丰仅专线）
          } catch (e) { row[cy.c] = null; if (rep) prodShip[cy.c] = []; console.log('  ⚠️ ' + p.id + '/' + spec.sizeName + ' ' + cy.c + ' ' + e.message); }
        }
        rep = false;
        perVariant[String(spec.variantId)] = row;
        if (Object.values(row).some((x) => x != null)) done++; else fail++;
        if (!dry) console.log('  ' + p.id + ' ' + (spec.colorName || '') + '/' + (spec.sizeName || '') + ' | 包裹 ' + L + 'x' + W + 'x' + H + ' ' + wt + 'g | ' + COUNTRIES.map((c) => c.c + '=' + (row[c.c] != null ? row[c.c] : '-')).join(' '));
      }
      if (dry) { console.log('  [dry-run] ' + p.id + ' 拟回填 ' + done + ' 个规格（' + fail + ' 个失败/缺数据）'); continue; }
      const ok = repo.setShipping(String(p.id), perVariant);
      const okShip = repo.setDetailShipping(String(p.id), prodShip);
      console.log('  ✅ ' + p.id + ' 已回填 ' + (ok ? done : 0) + ' 个规格 + 运费优选渠道(' + (okShip ? '写' : '未写') + 'profile.shipping)');
    }

    if (!dry) {
      // 自动触发定价（多国售价，config驱动+汇率1天缓存）
      try {
        const { PricingService } = require('../../Services/PricingService');
        const psvc = new PricingService();
        const pr = await psvc.backfill({ repo, ids: products.map((p) => String(p.id)) });
        console.log('💰 自动定价完成: ' + pr.count + ' 个商品（8国）→ detail_json.pricing');
      } catch (e) { console.log('⚠️ 自动定价失败: ' + e.message); }
      const adminFile = renderAdmin({ records: repo.products(), merchant: config.merchant, htmlDir: config.pagesDir, htmlFile: 'manage.html' });
      console.log('📊 管理后台已刷新: ' + adminFile);
    }
  }
}
module.exports = { ShippingBackfillCommand };
