'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output', 'view-all.html');

const items = [
  { label: '商品 10730 · 女士皮革双肩包 · 面1', before: 'input/10730/面1.clean.jpg', after: 'edited/10730/面1.clean.jpg' },
  { label: '商品 12563 · 马桶装饰两件套 · 面1', before: 'input/12563/面1.clean.jpg', after: 'edited/12563/面1.clean.jpg' },
  { label: '商品 12563 · 马桶装饰两件套 · 面2', before: 'input/12563/面2.clean.jpg', after: 'edited/12563/面2.clean.jpg' },
  { label: '商品 12101 · 皮革半圆卡包 · 面1', before: 'input/12101/面1.clean.jpg', after: 'edited/12101/面1.clean.jpg' },
  { label: '商品 12101 · 皮革半圆卡包 · 面2', before: 'input/12101/面2.clean.jpg', after: 'edited/12101/面2.clean.jpg' },
];

function b64(p) {
  const abs = path.join(root, p);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

const cards = items.map((it) => {
  const b = b64(it.before), a = b64(it.after);
  return `<div class="pair">
  <div class="card"><h2>${it.label} · 修改前</h2>${b ? `<img src="${b}"/>` : '<p style="color:#c00">缺图</p>'}<div class="cap">${it.before}</div></div>
  <div class="card after"><h2>${it.label} · 修改后</h2>${a ? `<img src="${a}"/>` : '<p style="color:#c00">缺图</p>'}<div class="cap">${it.after}</div></div>
</div>`;
}).join('\n');

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>design-area:generate 前后对比总览</title><style>
body{font-family:"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;background:#f2f3f5;margin:0;padding:24px;color:#0f1111}
h1{font-size:20px;margin:0 0 4px}.sub{color:#565959;font-size:13px;margin-bottom:16px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}
.card{background:#fff;border:1px solid #e3e6e6;border-radius:12px;padding:12px}
.card.after{border-color:#e8590c}
.card h2{font-size:14px;margin:0 0 10px;text-align:center;color:#565959}
.card img{width:100%;display:block;border-radius:8px}
.cap{font-size:11px;color:#888;text-align:center;margin-top:8px;word-break:break-all}
@media(max-width:700px){.pair{grid-template-columns:1fr}}
</style></head><body>
<h1>🖼️ design-area:generate 前后对比（总览）</h1>
<div class="sub">基于智谱 AI 生图 + 去水印 + glm-4v 排版 + sharp 叠加 · 共 ${items.length} 组</div>
${cards}
</body></html>`;

fs.writeFileSync(out, html, 'utf8');
console.log('written: ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
