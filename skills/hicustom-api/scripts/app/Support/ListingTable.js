'use strict';
/**
 * ListingTable.js — 轻量读取「亚马逊原始模板 xlsm」里我们回填的数据列。
 * 只读取 Template 表：第4行=列标签(label)、第5行=底层attribute、第7行=回填数据行。
 * 不加载 Data Definitions / Dropdown Lists 等其它 sheet，减小读取量。
 * 返回：{ header, label, attribute, col, value }[] 及 columns[]/row{header:value}（便于渲染/JSON）。
 */
const fs = require('fs');
const path = require('path');

const decodeXml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const colToIdx = (col) => { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const idxToCol = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

function parseSharedStrings(file) {
  const out = []; if (!fs.existsSync(file)) return out;
  const xml = fs.readFileSync(file, 'utf8');
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(xml))) { let t = ''; const tre = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm; while ((tm = tre.exec(m[1]))) t += tm[1]; out.push(decodeXml(t)); }
  return out;
}
// 读指定 sheet 的指定行 -> { colIndex: value }
function readRow(sheetXml, rowNum, shared) {
  const out = {};
  const rowRe = new RegExp('<row[^>]*r="' + rowNum + '"[^>]*>([\\s\\S]*?)<\\/row>', 'g'); let rm = rowRe.exec(sheetXml);
  if (!rm) return out;
  const cre = /<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g; let cm;
  while ((cm = cre.exec(rm[1]))) {
    const ci = colToIdx(cm[1]); const t = cm[2]; const inner = cm[3]; let v = '';
    if (t === 'inlineStr') { const im = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); v = im ? decodeXml(im[1]) : ''; }
    else { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); if (vm) v = t === 's' ? shared[+vm[1]] : decodeXml(vm[1]); }
    if (v !== '') out[ci] = v;
  }
  return out;
}
function unzipXlsm(tpl) {
  const crypto = require('crypto');
  let mtime = ''; try { mtime = String(fs.statSync(tpl).mtimeMs); } catch (e) {}
  const key = crypto.createHash('md5').update(tpl + ':' + mtime).digest('hex').slice(0, 8);
  const tmp = path.join(require('os').tmpdir(), 'listing_tpl_' + key);
  if (!fs.existsSync(path.join(tmp, 'xl', 'workbook.xml'))) {
    fs.mkdirSync(tmp, { recursive: true }); const zip = path.join(tmp, 'tpl.zip'); fs.copyFileSync(tpl, zip);
    require('child_process').execSync('powershell -NoProfile -Command "Expand-Archive -LiteralPath \'' + zip + '\' -DestinationPath \'' + tmp + '\' -Force"', { stdio: 'pipe' });
    // 清理 zip，避免残留
    try { fs.unlinkSync(zip); } catch (e) {}
  }
  return tmp;
}
function sheetFileByName(tmp, name) {
  const wb = fs.readFileSync(path.join(tmp, 'xl', 'workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(tmp, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
  const sheets = []; const sre = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g; let sm;
  while ((sm = sre.exec(wb))) sheets.push([decodeXml(sm[1]), sm[2]]);
  // rels：Id 与 Target 顺序无关（用 .match 一次性取所有元素，避免 exec/g 状态问题）
  const ridMap = {};
  const relEls = rels.match(/<Relationship\b[^>]*\/>/g) || [];
  for (const el of relEls) {
    const idm = el.match(/Id="(rId\d+)"/); const tm = el.match(/Target="([^"]*)"/);
    if (idm && tm) ridMap[idm[1]] = tm[1];
  }
  const rid = (sheets.find((s) => s[0] === name) || [])[1];
  if (!rid) return null;
  return path.join(tmp, 'xl', ridMap[rid].replace(/^\/?xl\//, ''));
}
// 读取回填表格：返回 { filled: [...], columns:[], row:{}, rows:[] }（filled=仅回填的非空列，含 index）
function readFilledTable(xlsmPath) {
  if (!xlsmPath || !fs.existsSync(xlsmPath)) return { filled: [], columns: [], row: {}, rows: [] };
  try {
    const tmp = unzipXlsm(xlsmPath);
    const shared = parseSharedStrings(path.join(tmp, 'xl', 'sharedStrings.xml'));
    const tplFile = sheetFileByName(tmp, 'Template');
    if (!tplFile) return { filled: [], columns: [], row: {}, rows: [] };
    const sxml = fs.readFileSync(tplFile, 'utf8');
    // 该 sheet 的行数（判断是否有数据行）
    const hasRow7 = new RegExp('<row[^>]*r="7"[^>]*>').test(sxml);
    const labelRow = readRow(sxml, 4, shared);
    const attrRow = readRow(sxml, 5, shared);
    const dataRow = readRow(sxml, 7, shared);
    const labelFreq = {};
    for (const ci of Object.keys(labelRow).map(Number)) { const lab = labelRow[ci]; labelFreq[lab] = (labelFreq[lab] || 0) + 1; }
    const labelCount = {}; const filled = []; const row = {}; const columns = [];
    for (const ci of Object.keys(dataRow).map(Number).sort((a, b) => a - b)) {
      const label = labelRow[ci] || idxToCol(ci);
      const attr = attrRow[ci] || '';
      labelCount[label] = (labelCount[label] || 0) + 1;
      const header = labelFreq[label] > 1 ? (label + ' ' + labelCount[label]) : label;
      filled.push({ index: ci, col: idxToCol(ci), label, header, attribute: attr, value: dataRow[ci] });
      columns.push(header);
      row[header] = dataRow[ci];
    }
    return { filled, columns, row, rows: columns.map((c) => ({ header: c, value: row[c] })), hasData: hasRow7 };
  } catch (e) { return { filled: [], columns: [], row: {}, rows: [], error: e.message }; }
}
module.exports = { readFilledTable, unzipXlsm, sheetFileByName, readRow };
