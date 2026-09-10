'use strict';
/**
 * StampStudioService — 网页「叠字工作台」后端。
 *   渲染：TextStampService（本地 sharp，零 API）
 *   配色：ContrastColor（本地）
 *   源图：URL(/input/…、/patterns/…、/edited/…、/<id>/…) 或绝对路径 → 物理路径
 * 预览图写 output/_stamp_preview/<内容哈希>.jpg（幂等）；保存另存 edited/<id>/。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { stamp } = require('./TextStampService');
const { pickDistinctColors } = require('../Support/ContrastColor');

const SKILL_ROOT = path.join(__dirname, '..', '..', '..');

class StampStudioService {
  constructor(config) { this.config = config; }

  _stampCfg() {
    try { return JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, 'config', 'stamp.json'), 'utf8')); }
    catch (e) { return {}; }
  }

  getConfig() {
    const cfg = this._stampCfg();
    return {
      defaults: { lines: cfg.lines || [], block: cfg.block || {}, background: cfg.background || {} },
      presets: cfg.presets || {}, fonts: cfg.fonts || {},
      posAlias: cfg.posAlias || {}, weightAlias: cfg.weightAlias || {}, out: cfg.out || {},
    };
  }

  /** URL 或绝对路径 → 物理文件路径（找不到返回 null） */
  resolveSrc(src) {
    if (!src) return null;
    const s = String(src).split('?')[0];
    try { if (path.isAbsolute(s) && fs.existsSync(s) && fs.statSync(s).isFile()) return s; } catch (e) { /* ignore */ }
    let rel = s.replace(/^\/+/, '');
    try { rel = decodeURIComponent(rel); } catch (e) { /* 用原样 */ }
    for (const b of [SKILL_ROOT, this.config.outputDir, this.config.inputDir, this.config.editedDir]) {
      if (!b) continue;
      const f = path.join(b, rel);
      try { if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; } catch (e) { /* ignore */ }
    }
    return null;
  }

  _params({ lines, block, background }) {
    const cfg = this._stampCfg();
    const useLines = (Array.isArray(lines) && lines.length) ? lines : (cfg.lines || []);
    const useBlock = Object.assign(
      { widthRatio: 0.7, heightRatio: 0.9, vAlign: 'middle', nudgeUp: 0, lineGap: 0.35, rowGap: 0.12, safeMargin: 0.045 },
      cfg.block || {}, block || {});
    const useBg = Object.assign({ enabled: false }, cfg.background || {}, background || {});
    return { cfg, useLines, useBlock, useBg };
  }

  /** 渲染预览。save=true 另存 edited/<id>/<name>.jpg 并归档原稿。 */
  async render({ id, src, lines, block, background, name, save }) {
    const file = this.resolveSrc(src);
    if (!file) throw new Error('找不到源图: ' + (src || '(空)'));
    const { cfg, useLines, useBlock, useBg } = this._params({ lines, block, background });
    const sig = crypto.createHash('sha1')
      .update(JSON.stringify({ file, useLines, useBlock, useBg, m: fs.statSync(file).mtimeMs }))
      .digest('hex').slice(0, 16);
    const prevDir = path.join(this.config.outputDir, '_stamp_preview');
    fs.mkdirSync(prevDir, { recursive: true });
    const prevFile = path.join(prevDir, sig + '.jpg');
    const res = await stamp(file, {
      lines: useLines, block: useBlock, background: useBg,
      fonts: cfg.fonts || {}, outFile: prevFile, format: 'jpeg', quality: 92,
    });

    let saved = null;
    if (save) {
      const pid = String(id || 'misc');
      const dir = path.join(this.config.editedDir, pid);
      fs.mkdirSync(dir, { recursive: true });
      // 命名规则同 stamp/design-area：成品 = 与「源图」同名 + out.suffix（默认 _add_text）→ edited/<id>/
      const suffix = (cfg.out && cfg.out.suffix) || '_add_text';
      const fn = path.basename(file, path.extname(file)) + suffix + '.jpg';
      const dest = path.join(dir, fn);
      fs.copyFileSync(prevFile, dest);
      saved = { file: dest, url: '/edited/' + encodeURIComponent(pid) + '/' + encodeURIComponent(fn), name: fn };
      try {
        const { archiveOriginal } = require('../Support/OriginalArchive');
        archiveOriginal({ productId: pid, outputDir: this.config.outputDir, items: [
          { src: file, name: '设计原稿' },
          { src: dest, name: '设计原稿', suffix: '_加文字' },
        ] });
      } catch (e) { /* 归档失败不影响出图 */ }
    }
    return { url: '/_stamp_preview/' + sig + '.jpg', file: prevFile, saved, meta: { W: res.W, H: res.H, dark: res.dark, lines: res.lines } };
  }

  /** 自动配色（本地，不用模型）。n=取几种色。 */
  async colors({ src, n }) {
    const file = this.resolveSrc(src);
    if (!file) throw new Error('找不到源图: ' + (src || '(空)'));
    try {
      const r = await pickDistinctColors(file, Math.max(1, Math.min(6, Number(n) || 2)), {});
      return { colors: r.colors || [] };
    } catch (e) { return { colors: [] }; }
  }
}

module.exports = { StampStudioService };
