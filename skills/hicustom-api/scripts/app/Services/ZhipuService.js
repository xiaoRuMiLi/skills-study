'use strict';
/**
 * ZhipuService — 智谱 AI（GLM）封装：文生图 + 图片理解。
 * 依赖：config.zhipuApiKey（.env 的 ZHIPU_API_KEY）。
 * 端点：
 *   文生图: POST /api/paas/v4/images/generations  (model: glm-image)
 *   图片理解: POST /api/paas/v4/chat/completions    (model: glm-4v，多模态)
 */
const BASE = 'https://open.bigmodel.cn/api/paas/v4';

class ZhipuService {
  constructor(config) { this.key = config.zhipuApiKey || ''; }
  _auth() { return { 'Authorization': 'Bearer ' + this.key, 'Content-Type': 'application/json' }; }
  _hasKey() { return !!this.key; }

  // 文生图。size: "1024x1024" | "720x1280" | "1280x720" | "768x1344" | "1344x768" 等
  async generateImage({ prompt, size = '1024x1024' }) {
    if (!this._hasKey()) throw new Error('未配置 ZHIPU_API_KEY（.env）。');
    const r = await fetch(BASE + '/images/generations', { method: 'POST', headers: this._auth(), body: JSON.stringify({ model: 'glm-image', prompt, size }) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('智谱文生图失败: ' + (j.error && j.error.message || JSON.stringify(j).slice(0, 200)));
    return j.data && j.data[0] ? j.data[0] : null; // { url / b64_json }
  }

  // 图片理解（多模态）：给定图片 url/base64 + 指令 → 返回文本
  async understandImage({ imageUrl, instruction }) {
    if (!this._hasKey()) throw new Error('未配置 ZHIPU_API_KEY（.env）。');
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST', headers: this._auth(),
      body: JSON.stringify({
        model: 'glm-4v',
        messages: [{ role: 'user', content: [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: imageUrl } },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('智谱图片理解失败: ' + (j.error && j.error.message || JSON.stringify(j).slice(0, 200)));
    return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  }

  // 智谱支持的尺寸（w/h）。按宽高比挑最接近的一个。
  static get SIZES() { return ['1024x1024', '1344x768', '768x1344', '1280x720', '720x1280', '1152x896', '896x1152']; }
  static pickSize(w, h) {
    const a = (w || 1) / (h || 1);
    let best = '1024x1024', bestD = Infinity;
    for (const s of ZhipuService.SIZES) {
      const [sw, sh] = s.split('x').map(Number);
      const d = Math.abs(Math.log(a) - Math.log(sw / sh)); // 比率对数距离
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // 根据商品信息构造文生图提示词：生成【平面印花图案】本身（非商品实物），并带上商品属性与画布比例
  static buildImagePrompt(product) {
    const d = product || {};
    const pd = d.product_description || {};
    const style = (pd.design_style && pd.design_style.recommend_style) || '';
    const theme = (pd.design_style && pd.design_style.theme_element) || '';
    const mat = (pd.product_material && (pd.product_material.cn_name || pd.product_material.en_name)) || '';
    const tech = pd.product_technology || '';
    const colors = (d.colors || []).map((c) => c.cn_name || c.name).filter(Boolean).join('/');
    const sizes = (d.sizes || []).map((s) => s.name).filter(Boolean).join('/');
    const attrs = (d.product_attr || []).map((a) => {
      const k = a.name || a.cn_name || ''; const v = a.value || a.attr_value || a.field_value || '';
      return k ? (k + ':' + v) : '';
    }).filter(Boolean).join('；');
    const feats = (pd.product_features || []).map((x) => x.value).filter(Boolean).join('；').slice(0, 90);
    const desc = (pd.detail_info_desc || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
    const f = (pd.print_areas && pd.print_areas[0]) || { width: 1024, height: 1024 };
    const orient = f.width >= f.height ? '横向' : '纵向';
    const margin = 12; // 底部留白%，用于后期裁掉 AI 水印
    return `生成一幅【满幅平铺的印花图案设计稿】——纯平面设计，仅用于印到面料/材质表面（印花布/印图底稿）。
⚠️ 这**不是商品照片/效果图**；图中**严禁出现任何实物或其轮廓**（帽子、衣服、杯子、桌布/地毯、桌子……通通不要），不要 3D、不要场景、不要投影/阴影。整张图必须是一层**无缝平铺、四边铺满**的花纹，画面里**没有物体边缘**。
- 承载与工艺：图案印在 ${mat || '面料'} 上${tech ? '（' + tech + '）' : ''}。
- 风格：${style || '优雅复古'}；图案元素：${theme || '原创花卉/几何纹理'}。
- 配色：**明快、层次丰富、色彩协调**；**不要黑白/单色，避免大面积纯黑背景**（图案为主体，浅色/彩色底更佳）。
- 氛围关键词（仅作风格暗示，**勿画成实物或场景**）：${feats || '原创通用'}。
- 画布比例：**${orient}**，宽:高 ≈ ${f.width}:${f.height}（≈${(f.width / f.height).toFixed(3)}），按此比例满幅铺开。
要求：图案内绝不能出现任何文字、字母、水印或 logo（**含极小文字**）；不要出现**卡片/票据/标签/条带/边框/纹理带**等元素；不能出现知名品牌/商标/受版权保护的卡通、人物、图案；全部为原创通用元素。请在图片最下方留出约 ${margin}% 高的**纯白色**留白边（白边内不要画任何内容/图案），主体图案只占上方约 88% 区域。`;
  }
}

module.exports = { ZhipuService };
