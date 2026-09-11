'use strict';
/**
 * ShippingService — 商家 web「运费试算」接口（cookie 鉴权）。
 *
 * ⚠️ 开放平台(api.hicustom.com)【没有】运费试算端点（已探测，候选路径全 404）。
 *    运费试算在商家后台 web 端：www.hicustom.com/merchant/shippingRule/calculateNew，需要【登录会话 cookie】。
 *    本地逆向记录见 references/shipping-quote.md。
 *
 * 用途：在下单前根据 收货国/邮编 + 包裹重量体积 + 数量，拿到各物流渠道运费（供 order:create 的 shipping_amount）。
 */
class ShippingService {
  constructor(config) {
    this.config = config;
    this.merchantBase = config.merchantBaseUrl || 'https://www.hicustom.com';
    this.quotePath = (config.merchant && config.merchant.shippingQuote) || '/merchant/shippingRule/calculateNew';
    this.cookie = config.merchantCookie || '';
    // 商家后台专用 HTTP：串行 + 节流 + 退避 + 留痕
    this.mhttp = require('../Support/MerchantHttp').getMerchantHttp(config);
  }

  _hasCookie() { return !!this.cookie; }

  // 拼 query；跳过空值/0（shipping_method_id 等默认 0）
  _qs(p = {}) {
    const map = {
      isSearch: '1',
      shipping_status: '',
      country: p.country,
      province: p.province,
      postcode: p.postcode,
      platform: p.platform,
      transport_type: p.transportType,
      shipping_method_id: p.shippingMethodId || '0',
      shipping_id_flag: p.shippingIdFlag || '0',
      weight: p.weight,
      length: p.length,
      width: p.width,
      height: p.height,
      qty: p.qty,
      express_price: p.expressPrice,
      page: p.page || '1',
    };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(map)) if (v != null && v !== '') u.set(k, String(v));
    return u.toString();
  }

  /**
   * 运费试算。p: { country, province, postcode, platform, transportType, expressPrice, weight, length, width, height, qty, shippingMethodId, shippingIdFlag, page }
   * 返回渠道数组（按 amount 升序建议），每条含 name/amount/weight/volume/day_from/day_to/shippingDeliveredPeriod/transport_type_text/remote_area_surcharge/freight_formula 等。
   */
  async quote(p = {}) {
    if (!this._hasCookie()) {
      const err = new Error('未配置 HICUSTOM_MERCHANT_COOKIE（.env）。请登录 hicustom 商家后台 www.hicustom.com/merchant 后，复制浏览器 Cookie 头里的 PHPSESSID / UCSDK_COOKIES 填入 .env 的 HICUSTOM_MERCHANT_COOKIE。');
      err.code = 'NO_COOKIE';
      throw err;
    }
    const url = this.merchantBase + this.quotePath + '?' + this._qs(p);
    let resp;
    try {
      resp = await this.mhttp.get(url, { headers: { Cookie: this.cookie } });
    } catch (e) {
      const err = new Error('请求运费试算失败(网络): ' + e.message); err.code = 'NETWORK'; throw err;
    }
    const text = await resp.text();
    const ct = (resp.headers.get('content-type') || '');

    // cookie 过期/未登录 → 商家web返回登录页 HTML
    if (ct.includes('text/html') || /登录|login|merchant\/login|loginPage/i.test(text.slice(0, 2000))) {
      const err = new Error('HICUSTOM_MERCHANT_COOKIE 已失效（商家会话过期）。请重新登录 hicustom 商家后台并更新 .env 的 HICUSTOM_MERCHANT_COOKIE。');
      err.code = 'COOKIE_EXPIRED';
      throw err;
    }

    let o;
    try { o = JSON.parse(text); } catch (e) {
      const err = new Error('运费试算返回非JSON: ' + text.slice(0, 120)); err.code = 'BAD_RESPONSE'; throw err;
    }
    if (o.code !== 'success' && o.status !== 1000) {
      const err = new Error('运费试算失败: ' + (o.msg || o.code || JSON.stringify(o).slice(0, 120))); err.code = 'API_ERROR'; throw err;
    }
    return (o.data && o.data.data) || [];
  }

  /**
   * 选渠道：时效+价格较优（排除特殊/国内通道；墨西哥仅云途精选）。
   * rules: ① 排除 金额<5 特殊/平台专享、国内「送货上门」、蜂鸟发仓默认物流；
   *        ② MX 仅取「云途（优先含"精选"）」系列；
   *        ③ 优先在「有时效(妥投率>=95 且 最迟时效<=20天)」渠道里选价最低；
   *        ④ 否则退而取「有时效」里价最低；再无则取有效集价最低。
   * 返回 { channel, amount, day_from, day_to, rate, note, raw }。
   */
  selectChannel(channels, { country } = {}) {
    const onlyYuntu = String(country).toUpperCase() === 'MX';
    let valid = (channels || []).filter((r) => Number(r.amount) > 0 && Number(r.amount) >= 5 && !/送货上门|蜂鸟发仓默认物流/i.test(r.name || ''));
    if (onlyYuntu) {
      const yun = valid.filter((r) => /云途/.test(r.name || ''));
      const yunSel = yun.filter((r) => /精选/.test(r.name || ''));
      valid = yunSel.length ? yunSel : yun;
      if (!valid.length) return null;
    }
    const hasPeriod = (r) => { const sp = r.shippingDeliveredPeriod || {}; return sp.delivered_time_effect_day_begin != null; };
    const good = valid.filter((r) => {
      const sp = r.shippingDeliveredPeriod || {};
      const rate = sp.delivered_rate != null ? Number(sp.delivered_rate) : null;
      const dEnd = sp.delivered_time_effect_day_end != null ? Number(sp.delivered_time_effect_day_end) : null;
      return rate != null && dEnd != null && rate >= 95 && dEnd <= 20;
    });
    let pool = good.length ? good : valid.filter(hasPeriod);
    if (!pool.length) pool = valid;
    pool.sort((a, b) => Number(a.amount) - Number(b.amount));
    const c = pool[0];
    const sp = c.shippingDeliveredPeriod || {};
    const hasTime = sp.delivered_time_effect_day_begin != null;
    let note = '';
    let day_from = hasTime ? Number(sp.delivered_time_effect_day_begin) : null;
    let day_to = hasTime ? Number(sp.delivered_time_effect_day_end) : null;
    let rate = hasTime && sp.delivered_rate != null ? Number(sp.delivered_rate) : null;
    if (!hasTime) {
      const withRate = valid.find(hasPeriod);
      if (withRate) {
        const wsp = withRate.shippingDeliveredPeriod;
        note = c.name + ' ' + Number(c.amount) + '元 最低但未给妥投时效；可选用 ' + withRate.name + ' ' + Number(withRate.amount) + '元（' + wsp.delivered_time_effect_day_begin + '~' + wsp.delivered_time_effect_day_end + '天/' + wsp.delivered_rate + '%）';
      }
    }
    return { channel: c.name, amount: Number(c.amount), day_from, day_to, rate, note, raw: c };
  }

  // 精简字段（存库用）：id/name/amount/时效/妥投率/货物类型/偏远费/运费公式
  _brief(c) {
    const sp = c.shippingDeliveredPeriod || {};
    return {
      id: c.id != null ? c.id : (c.charge_id != null ? c.charge_id : null),
      name: c.name,
      amount: Number(c.amount),
      day_from: sp.delivered_time_effect_day_begin != null ? Number(sp.delivered_time_effect_day_begin) : (c.day_from != null ? Number(c.day_from) : null),
      day_to: sp.delivered_time_effect_day_end != null ? Number(sp.delivered_time_effect_day_end) : (c.day_to != null ? Number(c.day_to) : null),
      rate: sp.delivered_rate != null ? Number(sp.delivered_rate) : null,
      transport_type_text: c.transport_type_text || '',
      remote_area_surcharge: c.remote_area_surcharge != null ? String(c.remote_area_surcharge) : '0',
      freight_formula: c.freight_formula || '',
    };
  }

  // 物流商偏好（用于"各国优选"存档）：云途/递四方全选；燕文/顺丰国际仅保留"专线"
  _provPref(r) {
    const n = r.name || '';
    if (/云途/.test(n)) return true;
    if (/递四方/.test(n)) return true;
    if (/燕文/.test(n)) return /专线/.test(n);
    if (/顺丰国际/.test(n)) return /专线/.test(n);
    return false;
  }

  // 选前 N 优渠道（按 selectChannel 同一规则排序），返回精简字段数组，最多 n 个。
  // preferProviders=true 时，先按物流商偏好过滤（云途/递四方全选，燕文/顺丰仅专线）。
  selectTopN(channels, { country, n = 1, preferProviders = false } = {}) {
    const onlyYuntu = String(country).toUpperCase() === 'MX';
    let valid = (channels || []).filter((r) => Number(r.amount) > 0 && Number(r.amount) >= 5 && !/送货上门|蜂鸟发仓默认物流/i.test(r.name || ''));
    if (onlyYuntu) {
      const yun = valid.filter((r) => /云途/.test(r.name || ''));
      const yunSel = yun.filter((r) => /精选/.test(r.name || ''));
      valid = yunSel.length ? yunSel : yun;
      if (!valid.length) return [];
    }
    if (preferProviders) valid = valid.filter((r) => this._provPref(r));
    const hasPeriod = (r) => (r.shippingDeliveredPeriod || {}).delivered_time_effect_day_begin != null;
    const good = valid.filter((r) => {
      const sp = r.shippingDeliveredPeriod || {};
      const rate = sp.delivered_rate != null ? Number(sp.delivered_rate) : null;
      const dEnd = sp.delivered_time_effect_day_end != null ? Number(sp.delivered_time_effect_day_end) : null;
      return rate != null && dEnd != null && rate >= 95 && dEnd <= 20;
    });
    let pool = good.length ? good : valid.filter(hasPeriod);
    if (!pool.length) pool = valid;
    pool.sort((a, b) => Number(a.amount) - Number(b.amount));
    return pool.slice(0, n).map((c) => this._brief(c));
  }
}
module.exports = { ShippingService };
