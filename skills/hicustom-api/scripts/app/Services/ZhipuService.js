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

  // 根据印刷区宽高比挑一个智谱支持的尺寸
  static pickSize(w, h) {
    const a = (w || 1) / (h || 1);
    if (a > 1.15) return '1344x768';   // 横
    if (a < 0.87) return '768x1344';   // 竖
    return '1024x1024';                 // 方
  }

  // 根据商品信息构造文生图提示词：生成【平面印花图案】本身（非商品实物）
  static buildImagePrompt(product) {
    const d = product || {};
    const pd = d.product_description || {};
    const style = (pd.design_style && pd.design_style.recommend_style) || '';
    const theme = (pd.design_style && pd.design_style.theme_element) || '';
    const mat = (pd.product_material && pd.product_material.cn_name) || '';
    let desc = (pd.detail_info_desc || '').replace(/\n/g, ' ').slice(0, 100);
    const margin = Math.round((1 - 0.88) * 100); // 底部留白约12%（用于后期裁掉水印）
    // ⚠️ 刻意不提商品名/桌布/布料等实物词，只描述图案主题风格，让模型输出"平铺印花设计"
    return `生成一幅【满幅平铺的印花图案设计稿】（纯平面设计图，只用来印花到面料上）。这不是商品实物照！不要在图中画出任何布料、织物、桌布、被子、衣服、桌子或实体物品，不要 3D、不要场景、不要阴影投在产品上——整张图就是一层平铺的花纹设计。
- 主题风格：${style || '优雅复古'}；图案元素：${theme || '原创花卉/几何纹理'}；质感参考：${mat || ''}。
- 花色协调、层次丰富、满幅可重复，适合作为整幅印花底图。${desc}
要求：图案内绝不能出现任何文字、字母、水印或 logo；不能出现知名品牌/商标/受版权保护的卡通、人物、图案；全部为原创通用元素。请在图片最下方留出约 ${margin}% 高的纯白色留白边（白边内不要画任何内容/图案），主体图案只占上方约 88% 区域。`;
  }
}

module.exports = { ZhipuService };
