'use strict';
/**
 * TemplateProductTypes.js — 只读提取亚马逊模板 xlsm 中 Product Type 列的下拉合法值。
 * 模板仅作为字段规范参考（绝不回填）。下拉值 = 命名范围 product_type1.value → 'Dropdown Lists'!$XX$n:$XX$m。
 * 用法：readTemplateProductTypes(tplPath) → { options: ['PAJAMAS','TOILET_SEAT'], src }
 */
const fs = require('fs');
const path = require('path');

const decodeXml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const colIdx = (col) => { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };

function readTemplateProductTypes(tpl) {
  if (!tpl || !fs.existsSync(tpl)) return { options: [], src: '' };
  const crypto = require('crypto');
  const tmp = path.join(require('os').tmpdir(), 'listing_tpl_' + crypto.createHash('md5').update(tpl).digest('hex').slice(0, 8));
  try {
    if (!fs.existsSync(path.join(tmp, 'xl', 'workbook.xml'))) {
      fs.mkdirSync(tmp, { recursive: true });
      const zip = path.join(tmp, 'tpl.zip');
      fs.copyFileSync(tpl, zip);
      require('child_process').execSync('powershell -NoProfile -Command "Expand-Archive -LiteralPath \'' + zip + '\' -DestinationPath \'' + tmp + '\' -Force"', { stdio: 'pipe' });
    }
    const read = (f) => fs.readFileSync(path.join(tmp, f), 'utf8');
    const wb = read('xl/workbook.xml');
    const m = wb.match(/<definedName name="product_type1\.value"[^>]*>([^<]+)<\/definedName>/);
    if (!m) return { options: [], src: tpl + ' (未找到命名范围 product_type1.value)' };
    const dm = decodeXml(m[1]).match(/'?([^'!]+)'?!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?/);
    if (!dm) return { options: [], src: tpl + ' (命名范围格式无法解析)' };
    const sheetName = dm[1], c1 = colIdx(dm[2]), c2 = dm[4] ? colIdx(dm[4]) : c1, r1 = +dm[3], r2 = dm[5] ? +dm[5] : r1;
    const rels = read('xl/_rels/workbook.xml.rels');
    const sheets = []; const sre = /<sheet name="([^"]*)"[^>]*r:id="(rId\d+)"/g; let sm;
    while ((sm = sre.exec(wb))) sheets.push([decodeXml(sm[1]), sm[2]]);
    const ridMap = {}; const rre = /Id="(rId\d+)"[^>]*Target="([^"]*)"/g; let rrm;
    while ((rrm = rre.exec(rels))) ridMap[rrm[1]] = rrm[2];
    const rid = (sheets.find((s) => s[0] === sheetName) || [])[1];
    if (!rid) return { options: [], src: tpl + ' (找不到工作表 ' + sheetName + ')' };
    const sxml = read('xl/' + ridMap[rid].replace(/^\/?xl\//, ''));
    const ss = [];
    if (fs.existsSync(path.join(tmp, 'xl/sharedStrings.xml'))) {
      const ssXml = read('xl/sharedStrings.xml'); const sire = /<si>([\s\S]*?)<\/si>/g; let sim;
      while ((sim = sire.exec(ssXml))) { let t = ''; const tre = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm; while ((tm = tre.exec(sim[1]))) t += tm[1]; ss.push(decodeXml(t)); }
    }
    const opts = [];
    const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let rm2;
    while ((rm2 = rowRe.exec(sxml))) {
      const r = +rm2[1]; if (r < r1 || r > r2) continue;
      const cre = /<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g; let cm;
      while ((cm = cre.exec(rm2[2]))) {
        const ci = colIdx(cm[1]); if (ci < c1 || ci > c2) continue;
        const vm = cm[3].match(/<v>([\s\S]*?)<\/v>/); if (!vm) continue;
        const val = cm[2] === 's' ? ss[+vm[1]] : decodeXml(vm[1]);
        if (val) opts.push(val);
      }
    }
    return { options: [...new Set(opts)], src: tpl };
  } catch (e) { return { options: [], src: tpl + ' (读取失败: ' + e.message + ')' }; }
}

// 按商品名在合法值里匹配 product_type
function matchProductType(nameEnCn, options) {
  const nm = String(nameEnCn || '').toLowerCase();
  const rules = [
    [/pajama|pyjama|sleepwear|nightwear|lounge/, /PAJAMA/i],
    [/toilet|lid cover|seat cover|tank cover/, /TOILET/i],
    [/sleep mask|eye mask|sleepmask|eyemask|遮光眼罩|眼罩/, /SLEEP|MASK/i], // 睡眠眼罩
    [/hat|cap|beanie|bucket hat|snapback|trucker|棒球帽|帽子|鸭舌帽|渔夫帽/, /HAT/i], // 帽子
  ];
  for (const [re, optRe] of rules) { if (re.test(nm)) { const hit = (options || []).find((o) => optRe.test(o)); if (hit) return hit; } }
  // 通用兜底：用商品名命中下拉项的首个单词（如 "SLEEP_MASK" → "sleep"）
  return (options || []).find((o) => nm.includes(String(o).toLowerCase().replace(/_/g, ' ').trim().split(' ')[0])) || '';
}

module.exports = { readTemplateProductTypes, matchProductType };
