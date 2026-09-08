'use strict';
/**
 * ShippingQuoteCommand — shipping:quote（运费试算）。
 * 基于商家 web 端点 /merchant/shippingRule/calculateNew（cookie 鉴权），见 references/shipping-quote.md。
 * 用法: shipping:quote --country US --postcode 10001 --weight 200 --length 20 --width 10 --height 5 --qty 1
 *       [--province --platform --transport-type <货物类型> --express-price <申报金额> --page]
 */
class ShippingQuoteCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'shipping:quote';
    this.description = '运费试算（商家后台，cookie 鉴权）';
    this.usage = '--country <国> --postcode <邮编> --weight <g> [--length --width --height cm] --qty <n> [--province --platform --transport-type --express-price --page]';
  }
  async handle(opts) {
    const shipping = this.app.make('shipping');
    console.log('========== shipping:quote (运费试算) ==========');
    const p = {
      country: opts.country,
      province: opts.province,
      postcode: opts.postcode,
      platform: opts.platform,
      transportType: opts.transportType,
      expressPrice: opts.expressPrice,
      weight: opts.weight,
      length: opts.length,
      width: opts.width,
      height: opts.height,
      qty: opts.qty,
      shippingMethodId: opts.shippingMethodId,
      shippingIdFlag: opts.shippingIdFlag,
      page: opts.page,
    };
    if (!p.country || !p.postcode || !p.weight || !p.qty) {
      console.log('必填: --country --postcode --weight --qty（建议加 --length --width --height 算体积重）。');
      return;
    }
    try {
      const rows = await shipping.quote(p);
      if (!rows.length) { console.log('无匹配物流渠道。'); return; }
      const sorted = [...rows].sort((a, b) => Number(a.amount) - Number(b.amount));
      console.log('目的地 ' + p.country + (p.postcode ? ' ' + p.postcode : '') + ' | ' + p.weight + 'g' + (p.qty > 1 ? ' x' + p.qty : '') + (p.length ? ' | 包裹 ' + p.length + 'x' + p.width + 'x' + p.height + 'cm' : '') + ' | 返回 ' + rows.length + ' 条物流渠道');
      const timed = (s) => {
        const sp = s.shippingDeliveredPeriod || {};
        if (sp.delivered_time_effect_day_begin != null && sp.delivered_time_effect_day_end != null) return (sp.delivered_time_effect_day_begin + '~' + sp.delivered_time_effect_day_end + '天/' + sp.delivered_rate + '%');
        if (s.day_from != null && s.day_to != null && Number(s.day_to) > 0) return (s.day_from + '~' + s.day_to + '天');
        return '—';
      };
      console.log('\n  # | 物流方式 | 运费(元) | 计费重 | 时效 | 备注');
      sorted.forEach((r, i) => {
        const extra = [];
        if (r.transport_type_text) extra.push(r.transport_type_text);
        if (Number(r.remote_area_surcharge) > 0) extra.push('偏远+' + r.remote_area_surcharge + '元');
        if (Number(r.is_remote_area)) extra.push('偏远地址');
        if (r.size_limit_text) extra.push(r.size_limit_text);
        console.log(
          (i + 1) + '. | ' + (r.name || '') + ' | ' + (r.amount != null ? r.amount : '—') +
          ' | ' + (r.weight || '—') + 'g | ' + timed(r) + (extra.length ? ' | ' + extra.join('；') : '')
        );
      });
      if (sorted[0]) {
        const rec = shipping.selectChannel(rows, { country: p.country });
        if (rec) console.log('\n💡 推荐(时效+价格较优): ' + rec.channel + ' = ' + rec.amount + ' 元' + (rec.day_from != null ? '（' + rec.day_from + '~' + rec.day_to + '天/' + rec.rate + '%）' : '') + (rec.note ? '  | ' + rec.note : ''));
        console.log('   最省: ' + sorted[0].name + ' = ' + sorted[0].amount + ' 元');
      }
    } catch (e) {
      console.log('❌ ' + e.message);
      if (e.code === 'COOKIE_EXPIRED') {
        console.log('   → 处理：重新登录 hicustom 商家后台，更新 .env 的 HICUSTOM_MERCHANT_COOKIE 后重试。');
      } else if (e.code === 'NO_COOKIE') {
        console.log('   → 处理：登录商家后台后，把 cookie 填进 .env: HICUSTOM_MERCHANT_COOKIE=...');
      }
      process.exitCode = 1;
    }
  }
}
module.exports = { ShippingQuoteCommand };
