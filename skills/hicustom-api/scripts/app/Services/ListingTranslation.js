'use strict';
const { ZhipuClient } = require('./ZhipuClient');
/**
 * ListingTranslation — 把上架文案(英文)翻译成中文(仅审阅用，不改 record/xlsm)。
 * 走统一的 ZhipuClient，模型名/解析逻辑集中一处。
 */
async function translateRecord(record, zc) {
  const client = zc || new ZhipuClient(global.__hicustom_config || {});
  const sys = 'You are a professional translator. Translate the following Amazon UK listing from English into Simplified Chinese. Keep meaning and tone natural, do NOT add or remove content. Return ONLY JSON with keys: item_name_zh, bullet_points_zh, product_description_zh, generic_keyword_zh.';
  const payload = { item_name: record.item_name || '', bullet_points: record.bullet_point || [], product_description: record.product_description || '', generic_keyword: record.generic_keyword || '' };
  const obj = await client.chatJSON(sys, 'Translate to Chinese: ' + JSON.stringify(payload), { temperature: 0.3 });
  return {
    item_name_zh: obj.item_name_zh || obj.item_name || '',
    bullet_points_zh: Array.isArray(obj.bullet_points_zh) ? obj.bullet_points_zh : (obj.bullet_points || []),
    product_description_zh: obj.product_description_zh || obj.product_description || '',
    generic_keyword_zh: obj.generic_keyword_zh || obj.generic_keyword || '',
  };
}
module.exports = { translateRecord };
