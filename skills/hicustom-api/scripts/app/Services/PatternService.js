'use strict';
/**
 * PatternService — 图案生成（AI 文生图）：按「空白产品」信息合成提示词 → 生成图案 → 去水印 → 存 input/<id>/。
 * 默认提示词用 ZhipuService.buildImagePrompt（禁文字/logo/版权 + 底部留白），调用方可覆盖（可改）。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const { ZhipuService } = require('./ZhipuService');
const { cropBottomMargin, removeCornerWatermark } = require('../../tools/watermark');

class PatternService {
  constructor(config, product, zhipu) { this.config = config; this.product = product; this.zhipu = zhipu; }

  /** 默认提示词（由商品信息合成，供页面预填、可改） */
  defaultPrompt(d) { return ZhipuService.buildImagePrompt(d); }

  async generate({ productId, prompt, log }) {
    const r = await this.product.detail(productId);
    if (r.status >= 400 || r.code !== 200) throw new Error('抓详情失败 HTTP ' + r.status + ' ' + (r.msg || ''));
    const d = r.data || {};
    const pd = d.product_description || {};
    const f = (pd.print_areas && pd.print_areas[0]) || { width: 1024, height: 1024 };
    const size = ZhipuService.pickSize(f.width, f.height);
    const usePrompt = (prompt && String(prompt).trim()) ? String(prompt) : this.defaultPrompt(d);
    if (log) log('生成中… 尺寸 ' + size);
    const img = await this.zhipu.generateImage({ prompt: usePrompt, size });
    if (!img || !img.url) throw new Error('AI 未返回图片 url');
    const dir = path.join(this.config.inputDir, String(productId));
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const raw = path.join(dir, 'pattern-' + ts + '.jpg');
    fs.writeFileSync(raw, Buffer.from(await (await fetch(img.url)).arrayBuffer()));
    if (log) log('已下载，去水印…');
    const clean = raw.replace(/\.jpg$/i, '.clean.jpg');
    let base = clean;
    try { await cropBottomMargin(raw, clean, 0.12); }
    catch (e) {
      try { await removeCornerWatermark(raw, clean); }
      catch (e2) { base = raw; }
    }
    // 多边去白边（模型有时把留白放上/左/右）：把四周的纯白/近白边裁掉
    try {
      const trimmed = raw.replace(/\.jpg$/i, '.trim.jpg');
      await sharp(base).trim({ threshold: 12 }).toFile(trimmed);
      const tm = await sharp(trimmed).metadata();
      const bm = await sharp(base).metadata();
      if (tm.width && tm.height && tm.width * tm.height > bm.width * bm.height * 0.5) base = trimmed;
    } catch (e) { /* 保持 base */ }
    // 贴合印刷区宽高比（居中裁切）→ 后续 listing:generate 的 cover 不再裁
    try {
      const m = await sharp(base).metadata();
      const target = f.width / f.height;
      let w = m.width, h = m.height;
      if (w / h > target) w = Math.round(h * target); else h = Math.round(w / target);
      const left = Math.max(0, Math.round((m.width - w) / 2)), top = Math.max(0, Math.round((m.height - h) / 2));
      const fitFile = raw.replace(/\.jpg$/i, '.fit.jpg');
      await sharp(base).extract({ left, top, width: w, height: h }).jpeg({ quality: 92 }).toFile(fitFile);
      if (log) log('已贴合印刷区比例 → ' + w + '×' + h);
      return { file: fitFile, raw, prompt: usePrompt, size, ratio: Number(target.toFixed(3)), dims: w + 'x' + h };
    } catch (e) {
      return { file: base, raw, prompt: usePrompt, size };
    }
  }
}

module.exports = { PatternService };
