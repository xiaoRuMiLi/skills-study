'use strict';
/**
 * DesignAreaCommand — design-area:generate（给商品图加"定制区"文字标记，支持 AI 生成 + 图片理解）。
 * ① 先抓空白商品详情（必做）
 * ② 图片来源：--image 指定 → 用户图；否则若配了 ZHIPU_API_KEY → 用智谱文生图（紧扣商品/尺寸/无文字无版权）；否则读 input/
 * ③ 图片理解（智谱 glm-4v）→ 给出文字排版方案（字体/颜色/位置/大小）；失败则自动
 * ④ 叠加定制区文字 → 保存 edited/<商品ID>/
 */
const fs = require('fs');
const path = require('path');
const { ZhipuService } = require('../../Services/ZhipuService');
const { removeCornerWatermark, cropBottomMargin } = require('../../../tools/watermark');

const FONT_MAP = {
  script: 'Segoe Script, Brush Script MT, cursive',
  bold: 'Arial Black, Impact, sans-serif',
  elegant: 'Georgia, \'Times New Roman\', serif',
  modern: 'Arial, Helvetica, sans-serif',
  comic: 'Comic Sans MS, cursive',
};

function mapFont(k) { return FONT_MAP[String(k || '').toLowerCase()] || null; }
function parseScheme(text) {
  try {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (m) {
      const o = JSON.parse(m[0]);
      const font = mapFont(o.font) || (typeof o.font === 'string' && o.font.includes(' ') ? o.font : null);
      return {
        textColor: o.color || o.textColor || 'auto',
        posV: o.posV || 'middle',
        boxW: o.boxW != null ? Number(o.boxW) : undefined,
        scale: o.scale != null ? Number(o.scale) : undefined,
        box: o.box !== undefined ? o.box : undefined,
        font: font || undefined,
      };
    }
  } catch (e) { /* ignore */ }
  return null;
}

class DesignAreaCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'design-area:generate';
    this.description = '给商品图加定制区文字标记(支持智谱文生图+图片理解)';
    this.usage = '--product-id <id> [--image 源图] [--ai] [--text "主|副"] [--posV/--boxW/--scale/--text-color/--box/--font]';
  }
  async handle(opts) {
    const config = this.app.make('config');
    const product = this.app.make('product');
    const zhipu = this.app.make('zhipu');
    const { mark } = require('../../Services/DesignAreaService');
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

    // ② 图片来源
    let sources = []; // [{path, url}]
    if (opts.image) {
      sources = [{ path: opts.image, url: null }];
    } else if (hasKey) {
      // 智谱文生图：按印刷面数生成（避免过多，最多2张）
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
          const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
          fs.writeFileSync(p, buf);
          // 必须：去掉"AI生成"水印。
          // 首选：生成时提示词已预留底部白边 → 直接裁掉底部白边（水印在里面）。失败则回退克隆补丁。
          try { const c = await cropBottomMargin(p, cleanPath, 0.12); sources.push({ path: cleanPath, url: img.url }); console.log('      🚫 已切掉底部白边(水印) → ' + path.basename(cleanPath) + '（丢 ' + c.dropped + 'px）'); }
          catch (e) {
            try { await removeCornerWatermark(p, cleanPath); sources.push({ path: cleanPath, url: img.url }); console.log('      🚫 已用克隆补丁去水印 → ' + path.basename(cleanPath)); }
            catch (e2) { sources.push({ path: p, url: img.url }); console.log('      ⚠️ 去水印失败(用原图): ' + e2.message); }
          }
          console.log('  ✅ 已生成 → ' + (sources[sources.length - 1].path));
        } else { console.log('  ⚠️ AI 未返回图片 url'); }
      }
    }
    if (!sources.length && fs.existsSync(config.inputDir)) {
      sources = fs.readdirSync(config.inputDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => ({ path: path.join(config.inputDir, f), url: null }));
    }
    if (!sources.length) { console.log('未找到源图。用 --image，或配置 ZHIPU_API_KEY 自动生成，或放 input/。'); return; }

    // ③ 图片理解 → 文字方案（再次覆盖：手动参数优先）
    const manual = {};
    for (const k of ['posV', 'boxW', 'scale', 'textColor', 'box', 'font']) if (opts[k] != null) manual[k] = opts[k];
    const outDir = path.join(config.editedDir, String(id));
    const entries = [];

    console.log('========== design-area:generate ==========');
    console.log('商品 ' + id + ' ' + (name || '') + ' | 印刷面 ' + faces.length + ' | 源图 ' + sources.length + ' 张');
    for (const src of sources) {
      let scheme = { textColor: 'auto', box: 'none' };
      const understandUrl = src.url || (src.path ? 'data:image/jpeg;base64,' + fs.readFileSync(src.path).toString('base64') : null);
      if (hasKey && understandUrl) {
        try {
          const txt = await zhipu.understandImage({
            imageUrl: understandUrl,
            instruction: '分析这张商品图，为"可定制区域"文字排版给出方案。只输出JSON：{"font":"script|bold|elegant|modern|comic","color":"#十六进制颜色(与实际背景对比清晰醒目)","posV":"top|middle|bottom","boxW":0到1数字,"box":"none或dashed","scale":0.5到1.2}。不要其他文字。',
          });
          const ai = parseScheme(txt);
          if (ai) scheme = ai;
          console.log('  🧠 图片理解方案: ' + JSON.stringify(scheme));
        } catch (e) { console.log('  ⚠️ 图片理解失败(回退自动): ' + e.message); }
      }
      // 手动参数覆盖
      Object.assign(scheme, manual);
      const base = path.basename(src.path, path.extname(src.path));
      try {
        const res = await mark(src.path, { productId: id, productName: name, mainText, subText, outDir, baseName: base, ...scheme });
        entries.push({ before: src.path, after: res.file, label: base + ' · ' + (res.dark ? '深底浅字' : '浅底深字') });
        console.log('  ✅ ' + base + ' → ' + res.file);
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

    // ④ 前后对比
    if (entries.length) {
      const cmp = renderCompare(entries, { productId: id, productName: name, htmlDir: config.outputDir });
      console.log('\n📂 已保存到: ' + outDir);
      console.log('🖼️ 前后对比: ' + cmp + '\n   → http://127.0.0.1:8098/design-area-compare.html');
    }
  }
}
module.exports = { DesignAreaCommand };
