'use strict';
/**
 * CompareRenderer — 生成"前后对比"页（自包含 base64 内嵌，浏览器直接看）。
 * entries: [{ before, after, label }]
 */
const fs = require('fs');
const path = require('path');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');

/** 同步读图片宽高（不依赖 sharp）：PNG / JPEG；失败返回 null。 */
function imgDims(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(64);
    const n = fs.readSync(fd, head, 0, 64, 0);
    fs.closeSync(fd);
    if (n >= 24 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }; // PNG IHDR
    }
    if (n >= 2 && head[0] === 0xff && head[1] === 0xd8) {
      const buf = fs.readFileSync(file); // JPEG：扫 SOF 段
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off++; continue; }
        const marker = buf[off + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
        const len = buf.readUInt16BE(off + 2);
        const isSOF = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        off += 2 + len;
      }
    }
    return null;
  } catch (e) { return null; }
}
/** 「宽 × 高 px」文本 */
function dimTxt(file) { const d = imgDims(file); return d ? (d.width + ' × ' + d.height + ' px') : ''; }
/** 文件大小文本 */
function sizeTxt(file) {
  try { const b = fs.statSync(file).size; return b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  catch (e) { return ''; }
}
/** 规格行：尺寸 · 大小 */
function specLine(file) {
  const d = dimTxt(file), s = sizeTxt(file);
  return [d, s].filter(Boolean).join(' · ');
}

function render(entries, opts = {}) {
  const productId = opts.productId || '';
  const productName = opts.productName || '';
  const title = opts.title || '🖼️ design-area:generate 前后对比';
  const badge = opts.badge || '定制区标记';
  const afterH2 = opts.afterLabel || '编辑后';
  const cards = entries.map((e) => {
    const beforeDim = dimTxt(e.before), afterDim = dimTxt(e.after), origDim = e.orig ? dimTxt(e.orig) : '';
    const cropped = !!(e.orig && origDim && beforeDim && origDim !== beforeDim);
    const cropNote = cropped
      ? `<div class="orig">原图 ${esc(origDim)} <b>→ 裁切后</b> ${esc(beforeDim)} <span class="badge warn">已裁切</span></div>`
      : (e.orig && origDim ? `<div class="orig ok">原图 ${esc(origDim)} = 裁切后 ${esc(beforeDim)}（未裁切）</div>` : '');
    return `<div class="pair">
    <div class="card"><h2>编辑前（叠字画布）</h2><img src="${b64(e.before)}" alt="before"/>
      <div class="dim">${esc(specLine(e.before))}</div>${cropNote}
      <div class="cap">${esc(e.label || '')}</div></div>
    <div class="card after"><h2>${esc(afterH2)} <span class="badge">${esc(badge)}</span></h2><img src="${b64(e.after)}" alt="after"/>
      <div class="dim">${esc(specLine(e.after))}</div>
      <div class="cap">${esc(e.label || '')}</div></div>
  </div>`;
  }).join('');
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
.dim{font-size:13px;color:#0f1111;text-align:center;margin-top:8px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.2px}
.orig{font-size:12px;color:#8a6d3b;background:#fff8e6;border:1px solid #ffe0a3;border-radius:8px;padding:5px 8px;text-align:center;margin-top:6px}
.orig.ok{color:#256029;background:#eefaf0;border-color:#bfe6c6}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#e8590c;color:#fff;font-size:12px}
.badge.warn{background:#b8860b}
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
