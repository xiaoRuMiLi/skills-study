'use strict';
/**
 * PricingService — 定价服务（配置驱动 + 汇率1天缓存）。
 * 配置：config/pricing.json（国别：佣金/退款率/VAT/汇损/平台成本/数字税/精度/汇率/汇率更新时间）。
 * 汇率：实时取 ECB(Frankfurter) 中间价(取小)，写入 config 并记录 rate_updated_at；
 *      距上次更新 <24小时 则复用缓存，避免重复拉取。
 */
const fs = require('fs');
const path = require('path');
const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config', 'pricing.json');

const floorRate = (rate, prec) => Math.floor(rate * Math.pow(10, prec)) / Math.pow(10, prec);
const now = () => new Date().toUTCString();
async function fetchRateAll() {
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=CNY&symbols=GBP,USD,EUR,CAD,MXN', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    if (j && j.rates && j.rates.GBP) return { rates: Object.fromEntries(Object.entries(j.rates).map(([k, v]) => [k, 1 / v])), source: 'ECB(Frankfurter,央行中间价)', date: j.date || '' };
  } catch (e) { /* fallback */ }
  const r = await fetch('https://open.er-api.com/v6/latest/CNY');
  const j = await r.json();
  const out = {}; for (const c of ['GBP', 'USD', 'EUR', 'CAD', 'MXN']) if (j.rates && j.rates[c]) out[c] = 1 / j.rates[c];
  return { rates: out, source: 'open.er-api(免费聚合)', date: j.time_last_update_utc || '' };
}
function loadCfg() {
  if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return { profit_rate: 0.30, rate_source: 'ECB(Frankfurter,央行中间价)', rate_updated_at: '', countries: {} };
}
function saveCfg(cfg) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8'); }

class PricingService {
  constructor() { this.cfg = loadCfg(); }

  // 汇率新鲜度：任一国家汇率 >24h 或为空 → 需要刷新
  ensureFreshRates({ force = false } = {}) {
    const cs = this.cfg.countries || {};
    const stale = force || !this.cfg.rate_updated_at || !Object.keys(cs).length ||
      Object.values(cs).some((c) => !c.rate || !c.rate_updated_at || (Date.now() - Date.parse(c.rate_updated_at)) > 24 * 3600 * 1000);
    if (!stale) return { fresh: true, source: this.cfg.rate_source };
    return fetchRateAll().then(({ rates, source, date }) => {
      for (const cc of Object.keys(cs)) {
        const c = cs[cc];
        const v = rates[c.currency];
        if (v) { c.rate = floorRate(v, c.precision); c.rate_updated_at = now(); }
      }
      this.cfg.rate_source = source; this.cfg.rate_updated_at = now();
      saveCfg(this.cfg);
      return { fresh: false, source };
    });
  }

  // 单国定价
  async computePrice({ country, procurement, shipping = 0, force = false }) {
    const cc = String(country).toUpperCase();
    const c = (this.cfg.countries || {})[cc];
    if (!c) throw new Error('未知国家 ' + cc);
    await this.ensureFreshRates({ force });
    const pr = this.cfg.profit_rate != null ? this.cfg.profit_rate : 0.30;
    const denom = 1 - pr - c.platform_cost;
    if (denom <= 0) throw new Error('分母≤0: 利润率+平台成本 必须<100%');
    const baseLocal = (Number(procurement || 0) + Number(shipping || 0)) / c.rate;
    const price = baseLocal / denom;
    return { country: cc, currency: c.currency, symbol: c.symbol, price: Math.round(price * 100) / 100, rate: c.rate, baseLocal: Math.round(baseLocal * 100) / 100, denominator: denom, profitRate: pr, platformCost: c.platform_cost, source: this.cfg.rate_source, date: this.cfg.rate_updated_at, procurement: Number(procurement || 0), shipping: Number(shipping || 0), country_precision: c.precision };
  }

  // 多国回填：一次算 8 国 → 返回 {cc: priceInfo}
  async backfill({ repo, ids, force = false } = {}) {
    if (!repo) throw new Error('need repo');
    const products = ids && ids.length ? repo.products().filter((p) => ids.map(String).includes(String(p.id))) : repo.products();
    const pricing = {};
    let count = 0;
    for (const p of products) {
      const procurement = Number(p.minPrice) || 0;
      const per = {};
      for (const cc of Object.keys(this.cfg.countries || {})) {
        const shipping = Number((p.specs && p.specs[0] && p.specs[0].shipping && p.specs[0].shipping[cc])) || 0;
        try { per[cc] = await this.computePrice({ country: cc, procurement, shipping, force }); } catch (e) { /* skip */ }
      }
      if (Object.keys(per).length) { repo.setDetailPricing(String(p.id), per); count++; }
      pricing[p.id] = per;
    }
    return { count, pricing };
  }
}
module.exports = { PricingService };
