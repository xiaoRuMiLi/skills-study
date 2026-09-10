'use strict';
/**
 * AiAssistService — 页面「唤起 AI 协作」的统一网关。
 *
 * 设计：一个 `type → handler` 的注册表（dispatch）。页面把「意图」发过来，
 * 网关把意图翻译成一次 LLM 调用，返回结构化结果。新增协作场景 = 加一个 case。
 *
 * 今天：走本机 LLM（ZhipuClient / glm-4），自包含、可靠。
 * 将来：要把某些 type 转给 OpenClaw agent（带 skill/记忆），
 *       只需替换本类的 `dispatch` 实现，**对外接口 / 页面代码不变**。
 *
 * 已注册：
 *   pattern.prompt.rewrite  用商品信息重写一版「明显不一样」的文生图提示词
 *   text.ask                通用问答（页面任意位置可唤起）
 */
const { ZhipuService } = require('./ZhipuService');

// 「换一版」可选风格/题材方向池（随机挑，保证每次点出来的方案不一样）
const ANGLES = [
  '复古植物花卉（botanical vintage）',
  '极简几何线条（minimal geometric line art）',
  '水彩晕染（soft watercolour wash）',
  '波普艺术撞色（pop-art bold colour-block）',
  '东方水墨留白（Chinese ink-wash）',
  '热带丛林茂叶（tropical jungle foliage）',
  '民族风几何图腾（tribal geometric）',
  '印象派笔触（impressionist brushwork）',
  '现代抽象涂鸦（modern abstract graffiti）',
  '超现实奇幻拼贴（surreal collage）',
  '装饰艺术 Art Deco 对称纹样',
  '和风浮世绘元素（ukiyo-e motifs）',
];

class AiAssistService {
  constructor(app) { this.app = app; }            // app = 依赖注入容器
  get zc() { return this.app.make('zhipuClient'); }

  // 取商品事实（拿不到就返回 null，提示词里标注缺省）
  async _productFacts(productId) {
    try {
      const product = this.app.make('product');
      const r = await product.detail(productId);
      if (r.status >= 400 || r.code !== 200) return null;
      const d = r.data || {}; const pd = d.product_description || {};
      return {
        cnName: d.cn_name || '', enName: d.en_name || '',
        material: (pd.product_material && (pd.product_material.cn_name || pd.product_material.en_name)) || '',
        tech: pd.product_technology || '',
        style: (pd.design_style && pd.design_style.recommend_style) || '',
        theme: (pd.design_style && pd.design_style.theme_element) || '',
        colors: (d.colors || []).map((c) => c.cn_name || c.name).filter(Boolean).join('/'),
        printArea: (pd.print_areas && pd.print_areas[0]) || null,
        defaultPrompt: ZhipuService.buildImagePrompt(d),
      };
    } catch (e) { return null; }
  }

  // —— 统一入口：type → handler ——
  async dispatch(type, payload, log) {
    switch (type) {
      case 'pattern.prompt.rewrite': return this.rewritePatternPrompt(payload || {}, log);
      case 'pattern.prompt.fix': return this.fixPromptByError(payload || {}, log);
      case 'stamp.layout': return this.stampLayout(payload || {}, log);
      case 'text.rewrite': return this.rewriteText(payload || {}, log);
      case 'text.ask': return this.ask(payload || {}, log);
      default: throw new Error('未知的 AI 任务类型: ' + type);
    }
  }

  /**
   * 用商品信息重写一版「明显不一样」的文生图提示词。
   * payload: { productId?, base?, angle? }  —— base 传上一版（保证与之不同）；angle 可指定方向。
   */
  async rewritePatternPrompt({ productId, base, angle } = {}, log) {
    const facts = productId ? await this._productFacts(productId) : null;
    const a = angle || ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const pa = (facts && facts.printArea) || { width: 1024, height: 1024 };
    const orient = pa.width >= pa.height ? '横向' : '纵向';
    const basePrompt = (base && String(base).trim()) || (facts && facts.defaultPrompt) || '';

    const sys = [
      '你是按需定制（POD）印花图案的「文生图提示词」专家。',
      '我会给你商品信息、上一版提示词、以及本次想要的风格方向。',
      '请写出一版**明显不同于上一版**的新提示词：换风格/题材/构图/配色倾向，但**必须保留**下面全部硬约束：',
      '1) 生成的是【满幅平铺的印花图案设计稿】，不是商品实物/照片；图中**严禁出现任何实物或其轮廓**（衣服/杯子/桌布/包/帽…），不要 3D、不要场景、不要阴影；',
      '2) 禁止任何文字、字母、数字、水印、logo（含极小文字）；',
      '3) 禁止品牌/商标/受版权保护的卡通、名人、图案；全部原创；',
      '4) 配色明快、层次丰富；不要黑白/单色，避免大面积纯黑背景；',
      '5) 画布按印刷区比例满幅铺开；',
      '6) 图片最下方留约 12% 高的**纯白色**留白边（白边内不画任何内容）。',
      '输出要求：**只输出新的提示词正文**（中文，整段、与上一版结构相近），不要解释、不要分点、不要用引号包裹。',
    ].join('\n');

    const user = '【商品信息】\n' + (facts ? (
      '名称: ' + (facts.cnName || facts.enName || '') + ' / ' + (facts.enName || '') + '\n' +
      '材质: ' + (facts.material || '') + (facts.tech ? '（' + facts.tech + '）' : '') + '\n' +
      '推荐风格: ' + (facts.style || '') + '；元素: ' + (facts.theme || '') + '\n' +
      '颜色: ' + (facts.colors || '') + '\n'
    ) : '(未取到商品信息)\n') +
      '【画布】' + orient + '，宽:高 ≈ ' + pa.width + ':' + pa.height + '\n' +
      '【本次风格方向】' + a + '\n' +
      '【上一版提示词】\n' + basePrompt + '\n\n' +
      '请输出一版与上一版明显不同的新提示词正文。';

    if (log) log('AI 重写提示词中…（方向：' + a + '）');
    const prompt = (await this.zc.chat(sys, user, { temperature: 0.9 })).trim();
    return { prompt, angle: a };
  }

  /**
   * 解析「排版样稿 / 空白产品主图」的文字排版（glm-4v）→ 适配 stamp 的排版结构。
   * payload: { productId, sample? }  sample: 样稿名 | 'auto' | 省略（=用空白产品主图）
   * 返回 { layout:{titleLines,title,sub,block}, source }
   */
  async stampLayout({ productId, sample, sampleUrl } = {}, log) {
    const path = require('path');
    const { pickSample } = require('../Support/TypeSetting');
    const { UNDERSTAND_INSTRUCTION, parseLayout, toDataUrl } = require('../Console/Commands/DesignAreaCommand');
    if (!productId) throw new Error('缺少 productId');
    const config = this.app.make('config');
    const product = this.app.make('product');
    const zhipu = this.app.make('zhipu');
    const r = await product.detail(productId);
    if (r.status >= 400 || r.code !== 200) throw new Error('抓详情失败 HTTP ' + r.status);
    const d = r.data || {};
    const name = d.cn_name || '';
    const rinfo = (d.renderings_info && d.renderings_info[0] && (d.renderings_info[0].renderings || [])) || [];
    const mainImgUrl = rinfo[0] || d.image || '';

    let imgUrl = null, source = '';
    if (sampleUrl) { imgUrl = sampleUrl; source = '指定样稿'; }
    else if (sample != null && sample !== false && sample !== '') {
      const sampleName = (sample === true || sample === 'auto') ? 'auto' : String(sample);
      const pick = pickSample(config.typeSettingDir, { name: sampleName, productName: name });
      if (pick.file) { imgUrl = toDataUrl(pick.file); source = '样稿 ' + path.basename(pick.file); }
    }
    if (!imgUrl) { imgUrl = mainImgUrl; source = '空白产品主图'; }
    if (!imgUrl) throw new Error('无可用排版参考图（样稿/主图都没有）');

    if (log) log('AI 解析排版中…（' + source + '）');
    const txt = await zhipu.understandImage({ imageUrl: imgUrl, instruction: UNDERSTAND_INSTRUCTION });
    const layout = parseLayout(txt);
    if (!layout) throw new Error('排版解析失败（模型未返回合法 JSON）');
    return { layout, source };
  }

  /**
   * 按文生图「报错」改进提示词。payload: { productId?, prompt, error }
   * → { prompt, note }  （note 说明改了什么；若报错与提示词无关则原样返回并说明）
   */
  async fixPromptByError({ productId, prompt, error } = {}, log) {
    const base = String(prompt || '').trim();
    const err = String(error || '').trim();
    const sys = [
      '你在修复一条「AI 文生图」失败的提示词。给你【报错信息】和【当前提示词】。',
      '先判断报错是否与**提示词内容**相关：',
      '- 若相关（如内容/风格/合规导致的失败）：改写提示词以规避该报错，同时**保留原意图与硬约束**（满幅平铺印花、无实物、无文字/logo、底部约 12% 白边、画布比例等）。',
      '- 若无关（如尺寸/参数/网络/额度/服务端）：**原样返回**当前提示词。',
      '只输出 JSON：{"prompt":"<修改后或原样的完整提示词>","note":"<一句话说明改了什么、或为何无需改>"}。不要输出多余内容。',
    ].join('\n');
    const user = '【报错信息】\n' + (err || '(无)') + '\n\n【当前提示词】\n' + base;
    if (log) log('AI 按报错改进提示词中…');
    let j;
    try { j = await this.zc.chatJSON(sys, user, { temperature: 0.4 }); }
    catch (e) { j = { prompt: base, note: 'AI 结果解析失败，已保持原提示词。' }; }
    return { prompt: (j && j.prompt) || base, note: (j && j.note) || '' };
  }

  /**
   * 通用「选区改写」：页面选中一段文字 + 一句要求 → 返回改写后的这段文字。
   * payload: { text, instruction?, context? }  （与业务/字段无关，任何文本都能用）
   */
  async rewriteText({ text, instruction, context } = {}, log) {
    const t = String(text == null ? '' : text);
    if (!t.trim()) throw new Error('没有选中文字');
    const sys = [
      '你是专业的文案改写助手。用户会给你一段文字和一句改写要求。',
      '请**只输出改写后的这段文字本身**：不要解释、不要引号包裹、不要任何前后缀。',
      '默认保持原文语言；除非用户明确要求变长/变短，否则长度量级与原有格式（换行/标点风格）尽量保持一致。',
      '若用户的要求是"改这一段/改写/优化"之类的通用语，就把它改得更通顺、准确、有吸引力。',
    ].join('\n');
    const user = (context ? '【上下文】' + context + '\n' : '')
      + '【改写要求】' + (instruction && String(instruction).trim() ? String(instruction).trim() : '改写得更通顺、更有吸引力') + '\n'
      + '【原文】\n' + t + '\n\n只输出改写后的文字：';
    if (log) log('AI 改写选区中…');
    const out = (await this.zc.chat(sys, user, { temperature: 0.6 })).trim();
    return { text: out, original: t };
  }

  /** 通用问答（页面任意位置可唤起）。payload: { question, context? } */
  async ask({ question, context } = {}, log) {
    const sys = '你是 hicustom 亚马逊 POD 运营助手。用简洁中文回答，必要时给要点。';
    const user = (context ? '【上下文】' + context + '\n' : '') + '【问题】' + (question || '');
    if (log) log('AI 回答中…');
    const text = (await this.zc.chat(sys, user, { temperature: 0.5 })).trim();
    return { text };
  }
}

module.exports = { AiAssistService, ANGLES };
