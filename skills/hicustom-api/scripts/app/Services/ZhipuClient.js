'use strict';
/**
 * ZhipuClient — 智谱 AI 统一客户端（单一来源）。
 * 所有 LLM 调用（文案生成/翻译/关键词理解/图片理解）都走这里，避免各文件各自 fetch、各自写模型名、各自读 key。
 * 模型名统一从 config.zhipu 读取（改模型只改 config 一处）。
 * 提供：
 *   chat(sys, user)             → 纯文本
 *   chatJSON(sys, user)         → 自动剥 markdown 围栏 + 解析 JSON（返回对象；解析失败抛错）
 *   chatVision(url, instruction)→ 图片理解
 *   generateImage(prompt, size) → 文生图
 */
const BASE_URL_DEFAULT = 'https://open.bigmodel.cn/api/paas/v4';

class ZhipuClient {
  constructor(config) {
    this.config = config || {};
    this.z = config && config.zhipu ? config.zhipu : {};
    this.base = this.z.baseUrl || BASE_URL_DEFAULT;
    this.textModel = this.z.textModel || 'glm-4-plus';
    this.visionModel = this.z.visionModel || 'glm-4v';
    this.imageModel = this.z.imageModel || 'glm-image';
    this.key = (config && config.zhipuApiKey) || process.env.ZHIPU_API_KEY || '';
    this.temperature = (this.z.temperature != null ? this.z.temperature : 0.7);
  }
  _hasKey() { return !!this.key; }
  _auth() { return { 'Authorization': 'Bearer ' + this.key, 'Content-Type': 'application/json' }; }

  async chat(sys, user, opts) {
    if (!this._hasKey()) throw new Error('未配置 ZHIPU_API_KEY（.env）。');
    const body = { model: this.textModel, temperature: (opts && opts.temperature) != null ? opts.temperature : this.temperature, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] };
    const r = await fetch(this.base + '/chat/completions', { method: 'POST', headers: this._auth(), body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('智谱调用失败: ' + (j.error && j.error.message || JSON.stringify(j).slice(0, 200)));
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }

  // 聊天并解析 JSON：自动剥 markdown 围栏，支持对象/数组
  async chatJSON(sys, user, opts) {
    const text = await this.chat(sys, user, opts);
    let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    const arr = t.match(/\[[\s\S]*\]/); if (arr) { try { return JSON.parse(arr[0]); } catch (e) {} }
    const obj = t.match(/\{[\s\S]*\}/); if (obj) { try { return JSON.parse(obj[0]); } catch (e) {} }
    throw new Error('LLM 未返回合法 JSON: ' + t.slice(0, 80));
  }

  async chatVision(url, instruction) {
    if (!this._hasKey()) throw new Error('未配置 ZHIPU_API_KEY（.env）。');
    const r = await fetch(this.base + '/chat/completions', {
      method: 'POST', headers: this._auth(),
      body: JSON.stringify({ model: this.visionModel, messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url } }] }] }),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('智谱图片理解失败: ' + (j.error && j.error.message || JSON.stringify(j).slice(0, 200)));
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }

  async generateImage({ prompt, size = '1024x1024' }) {
    if (!this._hasKey()) throw new Error('未配置 ZHIPU_API_KEY（.env）。');
    const r = await fetch(this.base + '/images/generations', { method: 'POST', headers: this._auth(), body: JSON.stringify({ model: this.imageModel, prompt, size }) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('智谱文生图失败: ' + (j.error && j.error.message || JSON.stringify(j).slice(0, 200)));
    return j.data && j.data[0] ? j.data[0] : null;
  }

  // 根据印刷区宽高比挑一个智谱支持的尺寸
  static pickSize(w, h) {
    const a = (w || 1) / (h || 1);
    if (a > 1.15) return '1344x768';
    if (a < 0.87) return '768x1344';
    return '1024x1024';
  }
}

module.exports = { ZhipuClient };
