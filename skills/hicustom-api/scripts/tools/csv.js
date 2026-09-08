'use strict';
/**
 * csv.js — 轻量 CSV 解析/序列化（零依赖，处理引号、BOM）。
 * 供 ProductRepository（"类数据库"）使用。
 */

// 解析 CSV 文本 → 二维数组（已去 BOM）
function parse(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  // 去掉末尾空行
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

// 二维数组 → CSV 文本（跨平台换行）
function serialize(rows) {
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 二维数组 → 对象数组（第一行作为列名）
function toObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] != null ? r[i] : ''; });
    return o;
  });
}
// 对象数组 → 二维数组（以给定/推断列名）
function fromObjects(objs, headers) {
  const h = headers || Object.keys(objs[0] || {});
  return [h].concat(objs.map((o) => h.map((k) => o[k] != null ? o[k] : '')));
}

module.exports = { parse, serialize, toObjects, fromObjects, esc };
