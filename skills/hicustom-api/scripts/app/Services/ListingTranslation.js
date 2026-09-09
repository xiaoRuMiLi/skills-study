'use strict';
/**
 * ListingTranslation — 把上架文案(英文)翻译成中文(仅审阅用，不改 record/xlsm)。
 * 用智谱 glm-4 文本翻译，返回结构化中文。JSON 解析剥离代码围栏。
 */
async function translateRecord(record) {
  const sys = 'You are a professional translator. Translate the following Amazon UK listing from English into Simplified Chinese. Keep meaning and tone natural, do NOT add or remove content. Return ONLY JSON.';
  const payload = { item_name: record.item_name || '', bullet_points: record.bullet_point || [], product_description: record.product_description || '', generic_keyword: record.generic_keyword || '' };
  const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + (process.env.ZHIPU_API_KEY || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'glm-4', temperature: 0.3, messages: [{ role: 'system', content: sys }, { role: 'user', content: 'Translate to Chinese: ' + JSON.stringify(payload) }] }),
  });
  const j = await r.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  const m = text.match(/\{[\s\S]*\}/);
  const obj = JSON.parse(m ? m[0] : text);
  return {
    item_name_zh: obj.item_name_zh || obj.item_name || '',
    bullet_points_zh: Array.isArray(obj.bullet_points_zh) ? obj.bullet_points_zh : (obj.bullet_points || []),
    product_description_zh: obj.product_description_zh || obj.product_description || '',
    generic_keyword_zh: obj.generic_keyword_zh || obj.generic_keyword || '',
  };
}
module.exports = { translateRecord };
