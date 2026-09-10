'use strict';
/**
 * StampCommand — stamp（给图案叠加 N 行文字，本地、零 API）。
 *
 * 用法（位置参数，省略/填 "-" 取 config/stamp.json 默认）：
 *   node scripts/stamp.js <图案文件路径> \
 *     第一行内容 第一行颜色 第一行字体 第一行粗细 第一行位置 \
 *     第二行内容 第二行颜色 第二行字体 第二行粗细 第二行位置
 *
 * 图案文件路径（必选）：传文件=处理该文件；传文件夹=处理夹内所有图片，
 *   并跳过已带 out.suffix（默认 _add_text）的文件（幂等）。
 * 输出：图案文件同目录，<原名>_add_text.jpg；并生成前后对比 HTML（8098）。
 * 可选具名：--config <文件> --out <文件/目录> --no-compare --no-bg
 *          --l1-size --l2-size（字号，占比 0~1 或像素）--compare-name <文件名>
 *          --preset <名字>（套用 config/stamp.json 的预设；`--preset` 单用=列出）
 *          --width-ratio / --height-ratio（文字块占图案宽/高比，0.1~1）
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../../../core/Config');
const { stamp } = require('../../Services/TextStampService');
const { render: renderCompare } = require('../../Support/CompareRenderer');

const IMG_RE = /\.(png|jpe?g|webp)$/i;
const NONE = (v) => v == null || v === '' || v === '-';

function mapPos(v, alias) {
  if (NONE(v)) return undefined;
  const key = String(v).trim();
  if (alias && alias[key]) return alias[key];
  const lower = key.toLowerCase();
  if (alias && alias[lower]) return alias[lower];
  return lower;
}

function normAlign(v) {
  const k = String(v == null ? '' : v).toLowerCase().trim();
  if (['left', 'center', 'right'].includes(k)) return k;
  if (k === '左' || v === '左') return 'left';
  if (k === '右' || v === '右') return 'right';
  if (['中', '居中', '中间'].includes(k) || v === '居中') return 'center';
  return 'center';
}

function mapWeight(v, alias) {
  if (NONE(v)) return undefined;
  const key = String(v).trim();
  if (/^\d+$/.test(key)) return parseInt(key, 10);
  if (alias && alias[key] != null) return alias[key];
  const lower = key.toLowerCase();
  if (alias && alias[lower] != null) return alias[lower];
  return key;
}

class StampCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'stamp';
    this.description = '给图案叠加文字(本地,配置驱动,N行)';
    this.usage = '<图案文件路径> [第1行 文字 颜色 字体 粗细 位置] [第2行 ...]';
  }

  _loadConfig(opts) {
    let cfgPath = path.join(ROOT, 'config', 'stamp.json');
    if (opts.config) cfgPath = path.isAbsolute(opts.config) ? opts.config : path.join(ROOT, opts.config);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return { cfg, cfgPath };
  }

  _buildLines(cfg, preset, pos) {
    // pos: [_pattern, l1t,l1c,l1f,l1w,l1p, l2t,l2c,l2f,l2w,l2p]
    const srcLines = (preset && Array.isArray(preset.lines)) ? preset.lines : cfg.lines;
    const base = Array.isArray(srcLines) ? srcLines.map((l) => Object.assign({}, l, { outline: Object.assign({}, l.outline) })) : [];
    const posAlias = cfg.posAlias || {};
    const weightAlias = cfg.weightAlias || {};
    // 每个 CLI 行：内容[0] 颜色[1] 字体[2] 粗细[3] 位置[4]
    for (let i = 0; i < 2; i++) {
      const off = 1 + i * 5;
      const [t, c, f, w, p] = [pos[off], pos[off + 1], pos[off + 2], pos[off + 3], pos[off + 4]];
      if (NONE(t) && NONE(c) && NONE(f) && NONE(w) && NONE(p)) continue; // 整行没给 → 用配置
      const ln = base[i] || { size: 'auto' };
      if (!NONE(t)) ln.text = t;
      if (!NONE(c)) ln.color = c;
      if (!NONE(f)) ln.font = f;
      const wt = mapWeight(w, weightAlias);
      if (wt !== undefined) ln.weight = wt;
      const pv = mapPos(p, posAlias);
      if (pv !== undefined) ln.posV = pv;
      base[i] = ln;
    }
    return base;
  }

  _listTargets(patternPath, cfg) {
    const suffix = (cfg.out && cfg.out.suffix) || '_add_text';
    const st = fs.statSync(patternPath);
    if (st.isDirectory()) {
      return fs.readdirSync(patternPath)
        .filter((f) => IMG_RE.test(f))
        .filter((f) => !(cfg.out && cfg.out.skipIfHasSuffix && f.replace(/\.[^.]+$/, '').endsWith(suffix)))
        .map((f) => path.join(patternPath, f));
    }
    return [patternPath];
  }

  async handle(opts) {
    let cfg, cfgPath;
    try { ({ cfg, cfgPath } = this._loadConfig(opts)); }
    catch (e) { console.log('❌ 读取配置失败: ' + e.message); process.exitCode = 1; return; }

    // 预设：--preset（单用=列出可用预设）
    const presets = cfg.presets || {};
    let preset = null;
    if (opts.preset === true) {
      console.log('可用预设: ' + (Object.keys(presets).join(', ') || '(无)'));
      for (const [k, v] of Object.entries(presets)) console.log('  • ' + k + ' — ' + (v.desc || ''));
      return;
    }
    if (opts.preset) {
      preset = presets[opts.preset];
      if (!preset) { console.log('❌ 未知预设: ' + opts.preset + '。可用: ' + (Object.keys(presets).join(', ') || '(无)')); process.exitCode = 1; return; }
    }

    const pos = opts._ || [];
    const patternPath = pos[0];
    if (NONE(patternPath)) {
      console.log('用法: node scripts/stamp.js <图案文件路径> [第1行 文字 颜色 字体 粗细 位置] [第2行 ...] [--preset 名字]');
      console.log('  示例: node scripts/stamp.js input/12661/面1.clean.jpg "YOUR DESIGN HERE" "#FFE873" bold 800 居中 "Any Color Text Logo Photo" "#8FD3FF" bold 800 居中');
      console.log('  预设: node scripts/stamp.js input/12661/面1.clean.jpg --preset sample   （--preset 单用可列出全部）');
      return;
    }
    if (!fs.existsSync(patternPath)) { console.log('❌ 图案文件/文件夹不存在: ' + patternPath); process.exitCode = 1; return; }

    const lines = this._buildLines(cfg, preset, pos);

    // 具名覆盖：字号 / 水平对齐
    if (!NONE(opts.l1Size)) lines[0] && (lines[0].size = opts.l1Size);
    if (!NONE(opts.l2Size)) lines[1] && (lines[1].size = opts.l2Size);
    if (!NONE(opts.l1Align)) lines[0] && (lines[0].align = normAlign(opts.l1Align));
    if (!NONE(opts.l2Align)) lines[1] && (lines[1].align = normAlign(opts.l2Align));

    // 具名覆盖：文字块占图案宽/高比例（配置 < 预设 < CLI）
    const blockCfg = Object.assign({}, cfg.block || {}, (preset && preset.block) || {});
    if (!NONE(opts.widthRatio)) blockCfg.widthRatio = Number(opts.widthRatio);
    if (!NONE(opts.heightRatio)) blockCfg.heightRatio = Number(opts.heightRatio);
    if (!NONE(opts.safeMargin)) blockCfg.safeMargin = Number(opts.safeMargin);

    const bg = Object.assign({}, cfg.background || {}, (preset && preset.background) || {});
    if (opts.noBg || opts.bg === 'off') bg.enabled = false;

    const out = cfg.out || {};
    const suffix = out.suffix || '_add_text';
    const fmt = (out.format || 'jpeg').toLowerCase();
    const ext = fmt === 'png' ? '.png' : '.jpg';

    let targets;
    try { targets = this._listTargets(patternPath, cfg); }
    catch (e) { console.log('❌ 解析路径失败: ' + e.message); process.exitCode = 1; return; }

    console.log('========== stamp ==========');
    console.log('配置: ' + path.relative(ROOT, cfgPath) + (opts.preset ? ' | 预设: ' + opts.preset : ''));
    console.log('目标: ' + patternPath + ' | 待处理 ' + targets.length + ' 张');
    console.log('文字块: 宽 ' + Math.round((blockCfg.widthRatio || 0.7) * 100) + '% × 高 ' + Math.round((blockCfg.heightRatio || 0.9) * 100) + '% | 位置 ' + (blockCfg.vAlign || 'middle'));
    console.log('文字行:');
    for (const l of lines) {
      if (l && String(l.text || '').trim() !== '') {
        console.log('  • "' + l.text + '" 颜色=' + (l.color || '(默认)') + ' 字体=' + (l.font || '(默认)') + ' 粗细=' + (l.weight != null ? l.weight : '(默认)') + ' 位置=' + (l.posV || 'middle') + (l.align && l.align !== 'center' ? ' 对齐=' + l.align : ''));
      }
    }
    if (!targets.length) { console.log('（没有需要处理的图片）'); return; }

    const entries = [];
    for (const src of targets) {
      const dir = path.dirname(src);
      const baseName = path.basename(src, path.extname(src));
      let outFile;
      if (!NONE(opts.out)) {
        const isDir = /[\\/]$/.test(opts.out) || fs.existsSync(opts.out) && fs.statSync(opts.out).isDirectory();
        outFile = isDir ? path.join(opts.out, baseName + suffix + ext) : opts.out;
      } else {
        outFile = path.join(dir, baseName + suffix + ext);
      }
      try {
        const res = await stamp(src, {
          lines, block: blockCfg, background: bg,
          fonts: cfg.fonts, outFile, format: fmt, quality: out.quality,
        });
        const sz = res.lines.map((x) => x.fontSize).join('/');
        console.log('  ✅ ' + path.basename(src) + ' → ' + path.relative(ROOT, res.file) + '  (字号 ' + sz + ', ' + (res.dark ? '深底' : '浅底') + ')');
        entries.push({
          before: src, after: res.file,
          label: baseName + ' · ' + (res.dark ? '深底浅字' : '浅底深字'),
        });
      } catch (e) {
        console.log('  ❌ ' + path.basename(src) + ': ' + e.message);
      }
    }

    if (entries.length && !opts.noCompare && out.compare !== false) {
      try {
        const html = renderCompare(entries, {
          htmlDir: this.app.make('config').pagesDir,
          title: '🖼️ stamp 前后对比',
          badge: '叠加文字',
          fileName: opts.compareName || 'stamp-compare.html',
        });
        console.log('\n📂 输出完成 | 前后对比: ' + path.relative(ROOT, html) + '\n   → http://127.0.0.1:8098/' + path.basename(html));
      } catch (e) { console.log('  ⚠️ 对比页生成失败: ' + e.message); }
    }
  }
}

module.exports = { StampCommand };
