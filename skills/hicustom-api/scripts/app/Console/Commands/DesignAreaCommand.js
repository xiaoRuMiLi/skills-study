'use strict';
/**
 * DesignAreaCommand — design-area:generate（给商品图加"定制区"文字标记）。
 * ① 抓空白商品详情（必做）
 * ② 排版来源（**客户未指定排版时**）：解析「空白产品详情**主图**」上的占位文字相对图案的布局
 *    （优先 agent 自带图片理解；否则 glm-4v），产出**同款排版**；输出 JSON 适配 stamp 用法。
 *    配色由**本地工具** ContrastColor 计算（不交给模型）。
 * ③ 图片来源：--image 指定 → 用户图；否则配了 ZHIPU_API_KEY → 智谱文生图；否则读 input/
 * ④ 用 **stamp（TextStampService）** 叠字（默认：无描边、纯透明底）→ 保存 edited/<商品ID>/
 *
 * 说明：文字合成步骤统一走 stamp 引擎；日志打印等价 stamp 命令行便于复现。
 */
const fs = require('fs');
const path = require('path');
const { ZhipuService } = require('../../Services/ZhipuService');
const { removeCornerWatermark, cropBottomMargin } = require('../../../tools/watermark');
const { stamp } = require('../../Services/TextStampService');
const { pickDistinctColors } = require('../../Support/ContrastColor');

const FONT_KEYS = ['modern', 'bold', 'elegant', 'script', 'comic'];
const POS_CN = { middle: '居中', top: '偏上', bottom: '偏下' };

// 让模型解析「空白产品主图」里占位文字相对图案的排版（同款），只出结构、不出颜色。
const UNDERSTAND_INSTRUCTION =
  '这是一张**排版参考图**（空白产品效果图，或客户提供的排版样稿）。请提取图上文字**相对图案的排版方式**——' +
  '包括**垂直位置 posV** 与**水平位置 posH**。只输出 JSON（不要任何其他文字）：\n' +
  '{"titleLines":<主标题占几行:整数>,' +
  '"title":{"font":"script|bold|elegant|modern|comic","weight":100-900,"posV":"top|middle|bottom","posH":"left|center|right","letterSpacing":0-0.3,"widthRatio":0.1-1},' +
  '"sub":{"font":"script|bold|elegant|modern|comic","weight":100-900,"posV":"top|middle|bottom","posH":"left|center|right","letterSpacing":0-0.3,"widthRatio":0.1-1},' +
  '"block":{"widthRatio":0.1-1,"heightRatio":0.1-1}}\n' +
  'titleLines = 主标题视觉上被拆成几行（如 YOUR/DESIGN/HERE 三行就填 3）。posV/posH = 文字落在图案的哪个方位（如**左上角 = top + left**）。**不要输出颜色**（配色由本地工具计算）。';

function normFont(v) { if (!v) return undefined; const k = String(v).toLowerCase().trim(); return FONT_KEYS.includes(k) ? k : undefined; }
function normPos(v) { return ['middle', 'top', 'bottom'].includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : undefined; }
function normAlign(v) {
  const k = String(v == null ? '' : v).toLowerCase().trim();
  if (['left', 'center', 'right'].includes(k)) return k;
  if (v === '左' || k === '左') return 'left';
  if (v === '右' || k === '右') return 'right';
  if (['中', '居中', '中间'].includes(k) || v === '居中') return 'center';
  return undefined;
}
function num(v) { return (v != null && !isNaN(Number(v))) ? Number(v) : undefined; }

function parseLayout(txt) {
  try {
    const m = String(txt || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    const one = (x) => x ? ({ font: normFont(x.font), weight: num(x.weight), posV: normPos(x.posV), align: normAlign(x.posH != null ? x.posH : x.align), letterSpacing: num(x.letterSpacing), widthRatio: num(x.widthRatio) }) : undefined;
    return {
      titleLines: (num(o.titleLines) && num(o.titleLines) >= 1) ? Math.round(num(o.titleLines)) : 1,
      title: one(o.title), sub: one(o.sub),
      block: o.block ? { widthRatio: num(o.block.widthRatio), heightRatio: num(o.block.heightRatio) } : undefined,
    };
  } catch (e) { return null; }
}

function toDataUrl(file) {
  const ext = (path.extname(file) || '.jpg').slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
}

function stampCmd(file, lines, block) {
  const parts = ['node scripts/stamp.js', '"' + file + '"'];
  for (const l of lines) parts.push('"' + l.text + '"', '"' + l.color + '"', l.font, String(l.weight), POS_CN[l.posV] || '居中');
  lines.forEach((l, i) => { if (l.align && l.align !== 'center') parts.push('--l' + (i + 1) + '-align', l.align); });
  parts.push('--width-ratio', String(block.widthRatio || 0.7), '--height-ratio', String(block.heightRatio || 0.9), '--no-bg');
  return parts.join(' ');
}

class DesignAreaCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'design-area:generate';
    this.description = '给商品图加定制区文字标记(主图解析排版 + 文生图 → stamp 叠字)';
    this.usage = '--product-id <id> [--image 源图] [--sample 样稿名|auto] [--text "主|副"] [--posV/--boxW/--scale/--text-color/--font]';
  }

  async handle(opts) {
    const config = this.app.make('config');
    const product = this.app.make('product');
    const zhipu = this.app.make('zhipu');
    const { render: renderCompare } = require('../../Support/CompareRenderer');
    const hasKey = zhipu._hasKey && zhipu._hasKey();

    const id = opts.productId;
    if (!id) { console.log('需要 --product-id <空白产品id>。'); return; }

    // ① 空白商品信息（必做）
    let r;
    try { r = await product.detail(id); } catch (e) { console.log('❌ 抓详情失败: ' + e.message); process.exitCode = 1; return; }
    if (r.status >= 400 || r.code !== 200) { console.log('❌ 详情失败: HTTP ' + r.status + ' msg=' + (r.msg || '')); return; }
    const d = r.data || {};
    const name = d.cn_name || '';
    const faces = (d.product_description && d.product_description.print_areas) || [];
    const [mainText, subText] = String(opts.text || 'YOUR DESIGN HERE|Any Color Text Logo Photo').split('|');

    // ①.5 排版来源：优先「样稿」（type-setting-images/）；未指定才用「空白产品主图」
    const { pickSample } = require('../../Support/TypeSetting');
    const rinfo = (d.renderings_info && d.renderings_info[0] && (d.renderings_info[0].renderings || [])) || [];
    const mainImgUrl = rinfo[0] || d.image || '';
    let layoutImgUrl = null;
    let layoutSource = '';
    if (opts.sample != null) {
      const sampleName = (opts.sample === true) ? 'auto' : opts.sample;
      const pick = pickSample(config.typeSettingDir, { name: sampleName, productName: name });
      console.log('📐 排版样稿: ' + pick.reason);
      if (pick.file) { layoutImgUrl = toDataUrl(pick.file); layoutSource = '样稿 ' + path.basename(pick.file); }
      else { console.log('   ↳ 未匹配到样稿，回退用空白产品主图'); }
    }
    if (!layoutImgUrl) {
      layoutImgUrl = mainImgUrl; layoutSource = '空白产品主图';
      if (!mainImgUrl) console.log('⚠️ 该产品无主图 renderings，且无样稿 → 将回退默认排版。');
    }
    let layout = null;
    if (hasKey && layoutImgUrl) {
      try {
        const txt = await zhipu.understandImage({ imageUrl: layoutImgUrl, instruction: UNDERSTAND_INSTRUCTION });
        layout = parseLayout(txt);
        if (layout) console.log('🧠 排版解析(' + layoutSource + '): ' + JSON.stringify(layout));
      } catch (e) { console.log('⚠️ 排版解析失败(回退默认): ' + e.message); }
    }

    // ② 图片来源
    let sources = [];
    if (opts.image) {
      sources = [{ path: opts.image, url: null }];
    } else if (hasKey) {
      const genFaces = faces.length ? faces.slice(0, 2) : [{ id: 1, width: 1024, height: 1024 }];
      const aiDir = path.join(config.inputDir, String(id));
      fs.mkdirSync(aiDir, { recursive: true });
      for (let i = 0; i < genFaces.length; i++) {
        const f = genFaces[i];
        const size = ZhipuService.pickSize(f.width || 1024, f.height || 1024);
        const prompt = ZhipuService.buildImagePrompt(d);
        console.log('🤖 智谱文生图(第' + (i + 1) + '张, ' + size + ')...');
        const img = await zhipu.generateImage({ prompt, size });
        if (img && img.url) {
          const p = path.join(aiDir, '面' + (f.id || (i + 1)) + '.jpg');
          const cleanPath = p.replace(/\.jpg$/, '.clean.jpg');
          fs.writeFileSync(p, Buffer.from(await (await fetch(img.url)).arrayBuffer()));
          try { const c = await cropBottomMargin(p, cleanPath, 0.12); sources.push({ path: cleanPath, url: img.url }); console.log('      🚫 已切掉底部白边(水印) → ' + path.basename(cleanPath) + '（丢 ' + c.dropped + 'px）'); }
          catch (e) {
            try { await removeCornerWatermark(p, cleanPath); sources.push({ path: cleanPath, url: img.url }); console.log('      🚫 已用克隆补丁去水印 → ' + path.basename(cleanPath)); }
            catch (e2) { sources.push({ path: p, url: img.url }); console.log('      ⚠️ 去水印失败(用原图): ' + e2.message); }
          }
          console.log('  ✅ 已生成 → ' + sources[sources.length - 1].path);
        } else { console.log('  ⚠️ AI 未返回图片 url'); }
      }
    }
    if (!sources.length && fs.existsSync(config.inputDir)) {
      sources = fs.readdirSync(config.inputDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => ({ path: path.join(config.inputDir, f), url: null }));
    }
    if (!sources.length) { console.log('未找到源图。用 --image，或配置 ZHIPU_API_KEY 自动生成，或放 input/。'); return; }

    const outDir = path.join(config.editedDir, String(id));
    const entries = [];

    console.log('========== design-area:generate ==========');
    console.log('商品 ' + id + ' ' + (name || '') + ' | 印刷面 ' + faces.length + ' | 源图 ' + sources.length + ' 张');
    console.log('文字: "' + mainText + '"' + (subText ? '  /  "' + subText + '"' : '') + '   [排版来源: ' + (layoutSource || '空白产品主图') + ']');
    console.log('合成引擎: stamp（本地，默认无描边 / 纯透明底）');

    // ③ 组装 stamp 的 lines（模型出排版 + 工具出色 + 手动参数最高优先）
    const tl = (layout && layout.title) || {};
    const sb = (layout && layout.sub) || {};
    const titleLines = (layout && layout.titleLines) || 1;
    const texts = [mainText, subText].filter((t) => t != null && String(t).trim() !== '');
    const lines = texts.map((t, i) => {
      if (i === 0) {
        return {
          text: t, color: null, font: tl.font || 'bold', weight: tl.weight || 800, posV: tl.posV || 'middle', align: tl.align || 'center',
          size: titleLines >= 2 ? 'wrap' : 'auto', letterSpacing: tl.letterSpacing != null ? tl.letterSpacing : 0.04,
          outline: { color: '#000000', width: 0 },
        };
      }
      return {
        text: t, color: null, font: sb.font || 'modern', weight: sb.weight || 500, posV: sb.posV || 'middle', align: sb.align || 'center',
        size: 'auto', letterSpacing: sb.letterSpacing != null ? sb.letterSpacing : 0.04,
        outline: { color: '#000000', width: 0 },
      };
    });
    // 主标题为多行堆叠时，把副行并入同一组（紧随其下），避免副行与标题重叠
    if (titleLines >= 2) for (const l of lines) l.posV = 'middle';
    // 手动参数最高优先
    if (opts.font) { lines[0].font = opts.font; if (lines[1]) lines[1].font = opts.font; }
    if (opts.posV) lines[0].posV = opts.posV;
    if (titleLines >= 2 && opts.scale != null) lines[0].size = opts.scale; // 可手动改字号
    const block = {
      // 主标题自身宽度比优先（决定按词堆叠的宽度），其次整体块宽
      widthRatio: tl.widthRatio || (layout && layout.block && layout.block.widthRatio) || 0.7,
      heightRatio: (layout && layout.block && layout.block.heightRatio) || 0.9,
      vAlign: 'middle',
    };
    if (opts.boxW) block.widthRatio = Number(opts.boxW);
    if (opts.scale && titleLines < 2) block.heightRatio = Number(opts.scale);

    for (const src of sources) {
      // 配色：本地工具（不用模型）——两行取互异色
      let colors = [];
      try { colors = (await pickDistinctColors(src.path, 2, {})).colors; } catch (e) { colors = []; }
      const useLines = lines.map((l, i) => Object.assign({}, l, { color: opts.textColor || colors[i] || ['#FFE873', '#9AD8FF'][i] || '#FFE873' }));
      console.log('  🎨 配色(本地工具): ' + useLines.map((l) => l.color).join(' / '));

      const base = path.basename(src.path, path.extname(src.path));
      const outFile = path.join(outDir, base + '.jpg');
      console.log('  ↳ 等价 stamp: ' + stampCmd(src.path, useLines, block));
      try {
        const res = await stamp(src.path, { lines: useLines, block, background: { enabled: false }, outFile, format: 'jpeg', quality: 92 });
        entries.push({ before: src.path, after: res.file, label: base + ' · ' + (res.dark ? '深底' : '浅底') });
        console.log('  ✅ ' + base + ' → ' + res.file + '  (字号 ' + res.lines.map((x) => x.fontSize).join('/') + ')');
      } catch (e) { console.log('  ❌ ' + base + ': ' + e.message); }
    }

    // ④ 归档原稿：加文字前 + 加文字后 都存 output/<id>/原稿/
    try {
      const { archiveOriginal } = require('../../Support/OriginalArchive');
      const items = [];
      for (const src of sources) if (src.path && fs.existsSync(src.path)) items.push({ src: src.path, name: '设计原稿' });
      for (const e of entries) if (e.after && fs.existsSync(e.after)) items.push({ src: e.after, name: '设计原稿', suffix: '_加文字' });
      if (items.length) {
        const arch = archiveOriginal({ productId: id, outputDir: config.outputDir, items });
        console.log('🗂️ 原稿已归档(加文字前+后): ' + arch.dir + (arch.files.length ? ' (' + arch.files.join(', ') + ')' : ''));
      }
    } catch (e) { console.log('  ⚠️ 原稿归档异常: ' + e.message); }

    // ⑤ 前后对比
    if (entries.length) {
      const cmp = renderCompare(entries, { productId: id, productName: name, htmlDir: config.pagesDir });
      console.log('\n📂 已保存到: ' + outDir);
      console.log('🖼️ 前后对比: ' + cmp + '\n   → http://127.0.0.1:8098/design-area-compare.html');
    }
  }
}
module.exports = { DesignAreaCommand };
