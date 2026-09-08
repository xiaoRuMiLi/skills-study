'use strict';
/**
 * ListingRenderer.js — 可扩展的「产品信息浏览」HTML 渲染器。
 * 设计：JSON-driven + section 组件化。
 *  - SECTIONS 为 section 渲染器注册表；页面 = 按顺序渲染选中的 section。
 *  - 以后加新功能（订单同步/图库管理/多语言）只需：新增一个 section 渲染器 + 在 sections 列表里加它的 key。
 *  - render() 把 profile + customization 渲染成一个自包含的本地 HTML 文件。
 */
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function h(tag, cls, inner) { return '<' + tag + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</' + tag + '>'; }

// 缩略图（可点击放大预览），openFolder 为可选的“打开文件夹”相对路径（走 /open 端点）
function thumb(u, openFolder) {
  const img = '<img class="thumb zoomable" src="' + esc(u) + '" onclick="zoom(this)" title="点击放大预览">';
  const btn = openFolder ? ' <a class="folderbtn" title="打开所在文件夹" href="/open?path=' + encodeURIComponent(openFolder) + '" target="_blank" rel="noopener">📂</a>' : '';
  return '<div class="thumbwrap">' + img + btn + '</div>';
}

// ---- section 渲染器 ----
const SECTIONS = {
  identity(p, c) {
    const i = p.identity;
    return h('h2', 'sec-title', '商品身份') + h('table', 'kv', [
      ['商品ID', i.id], ['SPU', i.spuCode], ['中文名', i.cnName], ['英文名', i.enName],
      ['别名', i.alias], ['工厂', i.factory], ['发布时间', i.releaseTime],
    ].map(([k, v]) => h('tr', '', h('td', 'k', esc(k)) + h('td', 'v', esc(v)))).join(''));
  },

  attributes(p, c) {
    const a = p.attributes;
    let s = h('h2', 'sec-title', '商品属性') + h('table', 'kv', [[
      '生产工艺', a.technology], ['材质', a.materialCn + (a.materialEn ? ' / ' + a.materialEn : '')],
      ['推荐风格', (a.designStyle && a.designStyle.recommendStyle) || ''], ['主题元素', (a.designStyle && a.designStyle.themeElement) || ''],
    ].map(([k, v]) => h('tr', '', h('td', 'k', esc(k)) + h('td', 'v', esc(v)))).join(''));
    if (a.description) s += h('div', 'desc', h('b', '', '产品描述') + '<br>' + esc(a.description).replace(/\n/g, '<br>'));
    if (a.materialExplain && a.materialExplain.length) s += h('div', 'kv', a.materialExplain.map((m) => esc(m.title + '：' + m.value)).join('<br>'));
    if (a.productFeatures && a.productFeatures.length) s += h('div', 'kv', a.productFeatures.map((m) => esc(m.title + ' ' + m.value)).join('<br>'));
    return s;
  },

  designFaces(p, c) {
    const f = p.designFaces || [];
    return h('h2', 'sec-title', '可设计面（印刷区尺寸）') + h('table', '', h('tr', '', h('th', '', '面') + h('th', '', '名称') + h('th', '', '宽(px)') + h('th', '', '高(px)'))
      + f.map((x) => h('tr', '', h('td', '', esc(x.id)) + h('td', '', esc(x.name)) + h('td', '', esc(x.width)) + h('td', '', esc(x.height)))).join(''));
  },

  pricing(p, c) {
    const pr = p.pricing;
    return h('h2', 'sec-title', '售价') + h('table', 'kv', [[
      '最低价(1件)', pr.minPrice], ['默认颜色', pr.defaultColorName], ['默认尺码', pr.defaultSizeName],
      ['季度累级', pr.accumulatedQuarter], ['会员级', pr.membership],
    ].map(([k, v]) => h('tr', '', h('td', 'k', esc(k)) + h('td', 'v', esc(v)))).join(''));
  },

  specs(p, c) {
    const specs = p.specs || [];
    if (!specs.length) return '';
    const cell = (lv, lname) => lv
      ? '<span class="pname">¥' + esc(lv.price) + '</span><br><span class="qty">' + esc(lname) + ' · qty ' + esc(lv.qty_from || 1) + '-' + esc(lv.qty_to || '∞') + '</span>'
      : '<span class="qty">—</span>';
    let rows = '<tr><th>规格</th><th>包装(cm)</th><th>体积(cm³)</th><th>重量(g)</th><th>零售价</th><th>黄金</th><th>铂金</th><th>钻石</th><th>黑钻</th><th>星钻</th></tr>';
    for (const s of specs) {
      const pk = s.package || {};
      rows += '<tr><td class="tk">' + esc([s.colorName, s.sizeName].filter(Boolean).join(' · ') || ('规格' + s.variantId)) + '</td>'
        + '<td>' + esc(pk.L != null ? pk.L + '×' + pk.W + '×' + pk.H : '—') + '</td>'
        + '<td>' + esc(pk.volume != null ? pk.volume : '—') + '</td>'
        + '<td>' + esc(s.weight != null ? s.weight : '—') + '</td>'
        + '<td>' + cell(s.prices && s.prices.retail, '零售') + '</td>'
        + '<td>' + cell(s.prices && s.prices.gold, '黄金') + '</td>'
        + '<td>' + cell(s.prices && s.prices.platinum, '铂金') + '</td>'
        + '<td>' + cell(s.prices && s.prices.diamond, '钻石') + '</td>'
        + '<td>' + cell(s.prices && s.prices.blackDiamond, '黑钻') + '</td>'
        + '<td>' + cell(s.prices && s.prices.starDiamond, '星钻') + '</td></tr>';
    }
    return h('h2', 'sec-title', '规格（颜色·尺码 | 包装 | 重量 | 各档售价）') + '<table class="pricing">' + rows + '</table>';
  },

  variants(p, c) {
    const vs = p.variants || [];
    if (!vs.length) return '';
    return h('h2', 'sec-title', '规格变体（包装/重量）') + h('table', '', h('tr', '', ['id', 'code', 'colorId', 'sizeId', '长cm', '宽cm', '高cm', '体积cm³', '重量g'].map((hd) => h('th', '', hd)).join(''))
      + vs.map((v) => h('tr', '', [v.id, v.code, v.colorId, v.sizeId, v.length, v.width, v.height, v.volume, v.weight].map((x) => h('td', '', esc(x))).join(''))).join(''));
  },

  images(p, c) {
    const im = p.images || {};
    let s = h('h2', 'sec-title', '产品图片（默认效果图 / 细节图）');
    const rs = im.renderings || [];
    for (const r of rs.slice(0, 3)) {
      const urls = (r.renderings || []).slice(0, 6).map((u) => thumb(u));
      if (urls.length) s += h('div', 'imgs', h('div', 'kv', '颜色[' + esc(r.colorName) + ']') + urls.join(''));
    }
    if (im.detailImg && im.detailImg.length) s += h('div', 'kv', '细节图 ' + im.detailImg.length + ' 张');
    return s;
  },

  customization(p, c, opts) {
    const codes = Object.entries(c.galleryCodes || {}).map(([v, code]) => esc('面' + v + '=' + code)).join(' | ');
    const effect = c.effectImages || [];
    let s = h('h2', 'sec-title', '定制化信息（本流程产出）') + h('table', 'kv', [
      ['上传图库编码', codes || '—'], ['合成定制产品码', c.compositeProductCode || '—'], ['效果图数', c.effectImageCount || 0],
    ].map(([k, v]) => h('tr', '', h('td', 'k', esc(k)) + h('td', 'v', esc(v)))).join(''));
    if (opts.dir) s += '<div class="kv"><a class="folderbtn" href="/open?path=' + encodeURIComponent(opts.dir) + '" target="_blank" rel="noopener">📂 打开产品文件夹</a> <span class="qty">（在资源管理器查看本地产物）</span></div>';
    const groups = c.effectImageLocalGroups || [];
    if (groups.length) {
      groups.forEach((g) => {
        s += '<div class="kv">📁 ' + esc(g.name) + '（' + g.files.length + ' 张）</div>';
        s += h('div', 'imgs', (g.files || []).map((f) => thumb(f)).join(''));
      });
    } else {
      const local = c.effectImageLocal || [];
      if (effect.length) s += h('div', 'imgs', effect.slice(0, 12).map((u, i) => thumb(local[i] || u)).join(''));
    }
    return s;
  },

  report(p, c, opts) {
    return h('h2', 'sec-title', '报表') + h('div', 'kv', 'CSV：' + esc(opts.csvFile || '') + (opts.csvFile && opts.htmlDir ? '' : ''));
  },

  links(p, c, opts) {
    const links = opts.links || [];
    if (!links.length) return '';
    return h('div', 'links', links.map((l) =>
      '<a class="linkbtn ' + (l.kind === 'list' ? 'alt' : '') + '" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'
    ).join(''));
  },
};

// section 默认渲染顺序（links 放最前，突出两个入口）
const DEFAULT_ORDER = ['links', 'identity', 'attributes', 'designFaces', 'pricing', 'specs', 'images', 'customization', 'report'];

function render({ profile, customization = {}, options = {}, htmlDir }) {
  const order = options.sections && options.sections.length ? options.sections : DEFAULT_ORDER;
  let body = '';
  for (const key of order) {
    if (SECTIONS[key]) {
      const out = SECTIONS[key](profile, customization, Object.assign({ htmlDir }, options));
      if (out) body += h('section', 'card', out);
    }
  }
  const title = options.title || ((profile.identity && profile.identity.cnName) ? profile.identity.cnName + ' — 产品信息' : '产品信息');
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)}</title>
<style>
body{font-family:"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;background:#f2f3f5;margin:0;padding:24px;color:#0f1111}
.wrap{max-width:1000px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#565959;font-size:13px;margin-bottom:16px}
section.card{background:#fff;border:1px solid #e3e6e6;border-radius:12px;padding:18px;margin-bottom:16px}
.sec-title{font-size:15px;margin:0 0 12px;border-bottom:2px solid #f0f0f0;padding-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;border-bottom:1px solid #eee;padding:6px 8px}
td.k{width:130px;color:#565959}
th{background:#fafafa}
.kv{font-size:13px;color:#333;line-height:1.8;margin:4px 0}
.desc{background:#fafafa;border-left:3px solid #f0c14b;padding:10px 12px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.7;margin-top:8px}
.imgs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.thumb{width:150px;height:150px;object-fit:contain;background:#fff;border:1px solid #eee;border-radius:8px;cursor:zoom-in}
.thumbwrap{position:relative;display:inline-block;text-align:center}
.folderbtn{display:inline-block;background:#eee;color:#333;text-decoration:none;font-size:12px;padding:3px 8px;border-radius:6px;margin-top:4px}
.folderbtn:hover{background:#ddd}
#lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out}
#lb.show{display:flex}
#lb img{max-width:92vw;max-height:92vh;border-radius:8px;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.5)}
#lbcap{position:fixed;top:14px;left:0;right:0;text-align:center;color:#fff;font-size:13px;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.links{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:4px}
.linkbtn{display:inline-block;background:#e8590c;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:22px;font-size:13px;transition:background .15s}
.linkbtn:hover{background:#d94f08}
.linkbtn.alt{background:#007185}
.linkbtn.alt:hover{background:#005f6b}
.pricing{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:6px}
.pricing th{background:#fafafa;border:1px solid #eee;padding:6px 8px;text-align:center;font-size:12px}
.pricing td{border:1px solid #eee;padding:8px;text-align:center;vertical-align:top}
.pricing td.tk{text-align:left;font-weight:600;background:#fffdf9}
.pricing .pname{display:block;font-size:14px;font-weight:700;color:#B12704}
.pricing .qty{display:inline-block;font-size:11px;color:#565959;margin-top:2px}
@media(max-width:700px){.pricing{font-size:11px}}
@media(max-width:700px){.thumb{width:110px;height:110px}}
</style></head><body><div class="wrap">
<h1>📋 ${esc(title)}</h1>
<div class="sub">生成时间 ${esc(options.generatedAt || new Date().toLocaleString())} · 产品画像 JSON 驱动 · 可扩展 section 模板</div>
${body}
</div>
<div id="lb" onclick="closelb()"><img id="lbimg" src="" alt=""><div id="lbcap"></div></div>
<script>
function zoom(el){ const lb=document.getElementById('lb'); if(!lb) return; document.getElementById('lbimg').src=el.src; document.getElementById('lbcap').textContent=el.title||''; lb.classList.add('show'); }
function closelb(){ const lb=document.getElementById('lb'); if(lb) lb.classList.remove('show'); }
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closelb(); });
</script>
</body></html>`;

  if (htmlDir) {
    const file = path.join(htmlDir, options.htmlFile || 'index.html');
    fs.mkdirSync(htmlDir, { recursive: true });
    fs.writeFileSync(file, html, 'utf8');
    return file;
  }
  return html;
}

module.exports = { render, SECTIONS, DEFAULT_ORDER };
