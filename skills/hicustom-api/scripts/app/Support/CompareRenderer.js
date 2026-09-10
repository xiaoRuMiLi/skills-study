'use strict';
/**
 * CompareRenderer — 生成"前后对比"页（自包含 base64 内嵌，浏览器直接看）。
 * entries: [{ before, after, label }]
 */
const fs = require('fs');
const path = require('path');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');

function render(entries, opts = {}) {
  const productId = opts.productId || '';
  const productName = opts.productName || '';
  const title = opts.title || '🖼️ design-area:generate 前后对比';
  const badge = opts.badge || '定制区标记';
  const afterH2 = opts.afterLabel || '编辑后';
  const cards = entries.map((e) => `<div class="pair">
    <div class="card"><h2>编辑前（原图）</h2><img src="${b64(e.before)}" alt="before"/><div class="cap">${esc(e.label || '')}</div></div>
    <div class="card after"><h2>${esc(afterH2)} <span class="badge">${esc(badge)}</span></h2><img src="${b64(e.after)}" alt="after"/><div class="cap">${esc(e.label || '')}</div></div>
  </div>`).join('');
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)}</title><style>
body{font-family:"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;background:#f2f3f5;margin:0;padding:24px;color:#0f1111}
h1{font-size:20px;margin:0 0 4px}.sub{color:#565959;font-size:13px;margin-bottom:16px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}
.card{background:#fff;border:1px solid #e3e6e6;border-radius:12px;padding:12px}
.card.after{border-color:#e8590c}
.card h2{font-size:14px;margin:0 0 10px;text-align:center;color:#565959}
.card img{width:100%;display:block;border-radius:8px}
.cap{font-size:12px;color:#888;text-align:center;margin-top:8px}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#e8590c;color:#fff;font-size:12px}
@media(max-width:700px){.pair{grid-template-columns:1fr}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">${esc(productName || '')} ${productId ? '· 商品ID ' + esc(productId) : ''} · 共 ${entries.length} 张 · 给改进意见我来调</div>
${cards || '<div class="sub">无图片</div>'}
</body></html>`;
  const out = path.join(opts.htmlDir || '.', opts.fileName || 'design-area-compare.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return out;
}
module.exports = { render };
