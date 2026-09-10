'use strict';
/**
 * TypeSetting — 排版「样稿」挑选（design-area 流程用）。
 *
 * 样稿图片放在 `type-setting-images/`（config.typeSettingDir，env HICUSTOM_TYPE_SETTING_DIR 可改），
 * 用**商品名/类别**给文件命名（如 `衬衫.jpg`、`网球拍.jpg`）。
 *
 * 规则：
 *  - 指定名字（如 "网球拍"）→ 先精确名匹配，再包含，再字符模糊；命中即用。
 *  - 指定 "样稿"/"auto"/未给具体名 → 按**商品名**与样稿文件名的字符重合度自动选最契合的。
 *  - 都没命中 → 返回 null，由调用方回退（空白产品主图）。
 */
const fs = require('fs');
const path = require('path');

const IMG = /\.(png|jpe?g|webp)$/i;
const AUTO = ['auto', '样稿', '默认', 'default'];
const baseName = (f) => path.basename(f, path.extname(f));
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s_\-\u3000()（）[\]]/g, '');

function listSamples(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => IMG.test(f));
}

/** 字符重合度：共同（去重）字符数 / 候选名长度。短候选被长商品名包含时得分高。 */
function sim(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  const setB = new Set(b);
  let common = 0; const seen = new Set();
  for (const ch of a) if (setB.has(ch) && !seen.has(ch)) { common++; seen.add(ch); }
  return common / b.length;
}

/**
 * 选样稿。
 * @param {string} dir 样稿目录
 * @param {object} o { name, productName }
 * @returns {{file:string|null, reason:string, candidates?:Array}}
 */
function pickSample(dir, o = {}) {
  const files = listSamples(dir);
  if (!files.length) return { file: null, reason: '样稿目录为空或不存在: ' + dir };
  const raw = o.name == null ? '' : String(o.name).trim();
  const auto = !raw || AUTO.includes(raw.toLowerCase());

  if (!auto) {
    const n = norm(raw);
    let best = null;
    for (const f of files) {
      const b = norm(baseName(f));
      let score = sim(raw, baseName(f)) * 100;
      if (b === n) score = 1000;
      else if (b.includes(n) || n.includes(b)) score = 500 + score;
      if (!best || score > best.score) best = { file: f, score };
    }
    if (best && best.score >= 50) return { file: path.join(dir, best.file), reason: '按指定名「' + raw + '」匹配 → ' + best.file };
    return { file: null, reason: '未找到与「' + raw + '」匹配的样稿（候选: ' + files.join(', ') + '）' };
  }

  // auto：按商品名自动选最契合（需达到契合度阈值，避免弱匹配）
  const minScore = o.minScore == null ? 0.4 : Number(o.minScore);
  const ranked = files.map((f) => ({ file: f, score: sim(o.productName || '', baseName(f)) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= minScore) return { file: path.join(dir, best.file), reason: '按商品名「' + (o.productName || '') + '」自动匹配 → ' + best.file + '（契合度 ' + best.score.toFixed(2) + '）', candidates: ranked };
  return { file: null, reason: '无与商品名「' + (o.productName || '') + '」契合(≥' + minScore + ')的样稿，回退空白产品主图', candidates: ranked };
}

module.exports = { listSamples, pickSample, sim };
