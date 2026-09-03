'use strict';
// @ts-nocheck
/**
 * sellers — 店铺/市场信息：getMarketplaceParticipations。
 */
module.exports = function createSellersModule(ctx) {
  const { callOp, format } = ctx;
  const { hr, num } = format;

  async function participations() {
    hr('店铺市场参与 (getMarketplaceParticipations)');
    const r = await callOp('getMarketplaceParticipations');
    const payload = ctx.unwrap(r.data);
    // 生产：payload 即 MarketplaceParticipationList（== 数组）；兼容旧结构(对象含 MarketplaceParticipations)
    const list = Array.isArray(payload) ? payload : (payload.MarketplaceParticipations || []);
    console.log('参与的 marketplace: ' + list.length);
    for (const p of list) {
      const m = p.marketplace || {};
      const part = p.participation || {};
      console.log('  - ' + (m.Name || m.name || '?') + '  [' + (m.Id || m.id || '?') + ']  ' + (m.CountryCode || '') + '  store=' + (p.storeName || '?'));
      console.log('      参与: ' + (part.isParticipating ? '✅参与中' : '❌未参与') + ' | 挂起listing: ' + (part.hasSuspendedListings || false));
    }
  }

  return {
    name: 'sellers',
    title: '店铺',
    describe: '店铺/市场信息',
    commands: {
      participations: { usage: '', run: participations },
    },
  };
};
