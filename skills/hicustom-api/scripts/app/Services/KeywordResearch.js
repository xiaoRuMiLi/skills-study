'use strict';
/**
 * KeywordResearch — 关键词引擎（大模型主导，不用正则机械匹配）。
 * 流程：
 *   1) LLM 从商品名/别名理解品类 → 提取 1~3 个核心搜索词
 *   2) 对核心词调 Google 联想词接口(googleSuggest) → 真实搜索词（频率信号；零亚马逊抓取，无账号风险）
 *   3) LLM 综合：理解商品 + 核心词 + 联想词 → 选出高转化关键词（去重、多表达、去商标/离题）
 * 产出：{ keywords:[...], coreTerms:[...], freq, source }，供 listing 流程用。
 */

class KeywordResearch {
  constructor(zhipuClient) { this.zc = zhipuClient; }

  // Google 联想词（零亚马逊抓取，无账号风控）
  async googleSuggest(prefix) {
    const u = 'https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(prefix);
    try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); const j = await r.json(); return (Array.isArray(j) && j[1]) ? j[1].filter(Boolean) : []; }
    catch (e) { return []; }
  }

  // LLM 理解商品 → 提取核心搜索词（优先多词短语）
  async extractCoreTerms({ enName, cnName, alias }) {
    const sys = 'You are an Amazon UK search term expert. Given a product name, understand what it is and output 1-3 core search phrases that buyers would type to find THIS product. Prefer MULTI-WORD phrases (2+ words). Avoid generic single words alone (e.g. "cap", "hat") unless clearly the product term. Output ONLY a JSON array of strings.';
    const user = "Product: " + (enName || cnName) + (alias ? ' | Alias: ' + alias : '') + '. Return JSON array of 1-3 core search phrases (multi-word preferred).';
    try { const a = await this.zc.chatJSON(sys, user, { temperature: 0.2 }); const arr = Array.isArray(a) ? a : (a.keywords || a.terms || []); return arr.map((s) => String(s).trim()).filter((s) => s && s.split(' ').length >= 1).slice(0, 3); } catch (e) { return [(enName || cnName || '').toLowerCase()]; }
  }

  async research({ enName, cnName, alias, material, size, color, disableLLM }) {
    // 1) 核心词
    let coreTerms;
    if (!disableLLM && this.zc && this.zc.key) coreTerms = await this.extractCoreTerms({ enName, cnName, alias });
    else coreTerms = [(enName || cnName || '').toLowerCase()].filter(Boolean);
    if (!coreTerms.length) coreTerms = ['product'];
    // 2) 联想词（每个核心词，Google；网络不通返回空也不影响）
    const freq = {}; const source = {};
    for (const term of coreTerms) {
      const suggs = await this.googleSuggest(term);
      source[term] = suggs;
      suggs.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
    }
    // 3) LLM 直接生成关键词（主，不依赖联想词；联想词仅作参考）
    const productFacts = 'Name: ' + (enName || cnName || '') + (alias ? ' | Alias: ' + alias : '') + (material ? ' | Material: ' + material : '') + (size ? ' | Size: ' + size : '') + (color ? ' | Color: ' + color : '');
    let keywords = [];
    if (!disableLLM && this.zc && this.zc.key) {
      const sys = 'You are an Amazon UK listing keyword expert. Given a product, generate 20-30 of the BEST high-conversion Amazon UK search keyword PHRASES for it (each 1-4 words). Requirements: deduplicate; include DIFFERENT expressions of the product term (e.g. "baseball cap", "black cap", "cap for men"); include buyer-intent and attribute phrases; DO NOT include brand/trademark names or unrelated words; output ONLY a JSON array of strings.';
      const sugg = coreTerms.flatMap((t) => source[t] || []).slice(0, 30);
      const user = 'Product facts: ' + productFacts + (sugg.length ? '\nReference suggestions (optional): ' + sugg.join(', ') : '') + '\nReturn ONLY a JSON array of 20-30 keyword phrases.';
      try { const arr = await this.zc.chatJSON(sys, user, { temperature: 0.3 }); keywords = Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 30) : []; }
      catch (e) { keywords = []; }
    }
    if (!keywords.length) keywords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 25);
    // 4) 后置过滤：去商标/明显离题词
    const BAD = /nike|adidas|puma|reebok|under ?armour|champion|capybara|omega|vitamin|capsule|supplement|asics|new ?balance|carhartt|new ?era|red ?sox|boston|nyc|capri ?sun|\bcapo\b|yankees|dodgers|marlboro/i;
    keywords = keywords.filter((k) => !BAD.test(k));
    return { keywords, coreTerms, freq, source };
  }
}
module.exports = { KeywordResearch };
