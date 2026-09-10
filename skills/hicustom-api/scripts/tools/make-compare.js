'use strict';
// 生成 design-area 前后对比 HTML（base64 内嵌，自包含）
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api';
const before = path.join(ROOT, 'input', 'car.jpeg');
const after = path.join(ROOT, 'edited', '12563', 'car.jpg');
const b64 = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>design-area 前后对比</title><style>
body{font-family:"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;background:#f2f3f5;margin:0;padding:24px;color:#0f1111}
h1{font-size:20px;margin:0 0 4px}.sub{color:#565959;font-size:13px;margin-bottom:16px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.card{background:#fff;border:1px solid #e3e6e6;border-radius:12px;padding:12px}
.card h2{font-size:15px;margin:0 0 10px;text-align:center;color:#565959}
.card img{width:100%;display:block;border-radius:8px}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#e3f2fd;color:#1976d2;font-size:12px;margin-left:6px}
@media(max-width:700px){.cols{grid-template-columns:1fr}}
</style></head><body>
<h1>🖼️ design-area:generate 前后对比</h1>
<div class="sub">产品 12563 马桶装饰两件套 · 源图 input/car.jpeg</div>
<div class="cols">
  <div class="card"><h2>编辑前（原图）</h2><img src="${b64(before)}" alt="before"/></div>
  <div class="card"><h2>编辑后 <span class="badge">YOUR DESIGN HERE</span></h2><img src="${b64(after)}" alt="after"/></div>
</div>
</body></html>`;
const out = path.join(ROOT, 'output', 'design-area-compare.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成: ' + out);
