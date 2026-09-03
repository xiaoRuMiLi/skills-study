'use strict';
// @ts-nocheck
/**
 * reports — 报表（Reports API）。SP-API Reports 是异步：
 *   create -> getReport(轮询) -> getReportDocument -> 下载(GZIP解压) -> 解析/保存。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

module.exports = function createReportsModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr } = format;

  async function create(opts) {
    hr('创建报表 (createReport)');
    const mp = opts.marketplace || env.marketplace();
    const type = opts.type;
    if (!type || !mp) { console.log('用法: reports create --type <ReportType> --marketplace X'); return; }
    const body = { reportType: type, marketplaceIds: [mp] };
    if (opts.period) body.dataStartTime = new Date(opts.period).toISOString();
    const r = await callOp('createReport', { body });
    const id = ctx.unwrap(r.data).reportId;
    console.log('HTTP ' + r.status + ' reportId=' + id);
    if (id) console.log('\n轮询: reports run --type <ReportType> --marketplace X 或 reports status --reportId ' + id);
  }

  async function status(opts) {
    hr('报表状态 (getReport)');
    const id = opts.reportId;
    if (!id) { console.log('用法: reports status --reportId <id>'); return; }
    const r = await callOp('getReport', { pathParams: { reportId: id } });
    const p = ctx.unwrap(r.data);
    console.log('reportId=' + p.reportId + ' status=' + p.processingStatus + ' type=' + p.reportType);
    if (p.reportDocumentId) console.log('documentId=' + p.reportDocumentId);
    console.log('\n若 completed，用 reports run 或保存报表。');
  }

  async function listTypes() {
    hr('报表类型（常用）');
    console.log('  GET_MERCHANT_LISTINGS_ALL_DATA        — 全部在售 listing 列表');
    console.log('  GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_DATE — 订单');
    console.log('  GET_FBA_INVENTORY_AGED_DATA           — FBA 库龄');
    console.log('  GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE — 结算');
    console.log('\n精确类型号用 `system spec "getReport"` 或官方 Report Type 列表核对。');
  }

  // —— 简易表格解析：自动识别分隔符（逗号/制表符），处理引号/BOM ——
  function parseCsv(text, delim) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== '') || '');
    const hasTab = firstLine.indexOf('\t') >= 0;
    const hasComma = firstLine.indexOf(',') >= 0;
    const d = delim || (hasTab && (!hasComma || firstLine.indexOf('\t') < firstLine.indexOf(',')) ? '\t' : ',');
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
      else if (c === '"') inQ = true;
      else if (c === d) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length) rows.push(row); row = []; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); if (row.length) rows.push(row); }
    return { rows, delim: d };
  }

  // 看已保存的报表文件（无需重新生成）；--status 过滤（如 Active）
  async function view(opts) {
    const file = opts.file;
    if (!file) { console.log('用法: reports view --file <report.csv> [--status Active] [--rows N]'); return; }
    if (!fs.existsSync(file)) { console.log('文件不存在: ' + file); return; }
    const text = fs.readFileSync(file, 'utf8');
    const { rows, delim } = parseCsv(text, opts.delimiter);
    const header = rows[0] || [];
    const statusCol = header.findIndex((h) => /^status$/i.test(String(h).trim()));
    const filter = opts.status;
    const data = rows.slice(1);
    const filtered = filter ? data.filter((r) => String(r[statusCol] || '').trim().toLowerCase() === String(filter).toLowerCase()) : data;
    const maxRows = Number(opts.rows) || 15;
    console.log('文件 ' + file + ' | 分隔符 ' + (delim === '\t' ? 'TAB' : 'COMMA') + ' | 共 ' + data.length + ' 行' + (filter ? ' | 状态=' + filter + ' → ' + filtered.length + ' 行' : '') + ' × ' + header.length + ' 列\n');
    const pickCols = ['item-name', 'seller-sku', 'price', 'quantity', 'status', 'asin1'].map((n) => header.findIndex((h) => String(h).trim().toLowerCase() === n)).filter((i) => i >= 0);
    console.log('列: ' + pickCols.map((i) => header[i]).join(' | '));
    for (const row of filtered.slice(0, maxRows)) {
      if (row.length <= 2) continue;
      console.log('  ' + pickCols.map((i) => String(row[i] || '').slice(0, 22)).join(' | '));
    }
    if (filtered.length - 1 > maxRows) console.log('…(共 ' + filtered.length + ' 行)');
  }

  // 完整流程：createReport -> 轮询 -> getReportDocument -> 下载(解压) -> 解析/保存
  // JSON 报表渲染（如 GET_SALES_AND_TRAFFIC_REPORT）
  function renderJsonReport(j) {
    const cur = (m) => (m && (m.currencyCode || m.CurrencyCode)) || '';
    const amt = (o) => (o && (o.amount !== undefined ? o.amount : o.Amount)) || 0;
    const byAsin = j.salesAndTrafficByAsin || [];
    const byDate = j.salesAndTrafficByDate || [];
    console.log('报表 JSON | 按日期 ' + byDate.length + ' 天 | 按ASIN/SKU ' + byAsin.length + ' 行\n');
    if (byDate.length) {
      const d0 = byDate[0];
      const s0 = (d0.salesByDate || {});
      console.log('日期: ' + byDate.length + ' 天 → ' + (s0.orderedProductSales ? amt(s0.orderedProductSales) : 0) + ' ' + cur(s0.orderedProductSales) + ' (首日)');
    }
    if (byAsin.length) {
      console.log('\n按 ASIN/SKU（SKU粒度）:');
      for (const a of byAsin.slice(0, 20)) {
        const s = (a.salesByAsin || {});
        const t = (a.trafficByAsin || {});
        const sales = s.orderedProductSales ? amt(s.orderedProductSales) : 0;
        const c = cur(s.orderedProductSales);
        const units = s.unitsOrdered != null ? s.unitsOrdered : '';
        const sess = t.sessions != null ? t.sessions : '';
        const conv = t.unitSessionPercentage != null ? (t.unitSessionPercentage + '%') : '';
        console.log('  ' + String(a.childAsin || a.asin || '?').padEnd(14) + ' [SKU ' + String(a.sku || '?').padEnd(20) + '] 销量' + units + ' 销售' + sales + c + ' 会话' + sess + ' 转化' + conv);
      }
      if (byAsin.length > 20) console.log('…(共 ' + byAsin.length + ' 行)');
    }
    if (!byAsin.length && !byDate.length) console.log('(无销售/流量数据)');
  }

  // 宽松解析 reportOptions：兼容 PowerShell 剥引号后的 {a:b,c:d}
  function parseOptions(s) {
    try { return JSON.parse(s); } catch (e) { /* fallthrough */ }
    const cleaned = s.replace(/([A-Za-z0-9_-]+)\s*:/g, '"$1":')
      .replace(/:\s*([A-Za-z0-9_.-]+)/g, ':"$1"');
    try { return JSON.parse(cleaned); } catch (e) { throw new Error('无法解析 --options-json'); }
  }

  async function run(opts) {
    hr('生成报表全流程');
    const mp = opts.marketplace || env.marketplace();
    const type = opts.type;
    if (!type || !mp) { console.log('用法: reports run --type <ReportType> --marketplace X [--options-json <json>|--date-granularity DAY --asin-granularity SKU] [--days N] [--save file]'); return; }
    const save = opts.save;
    const body = { reportType: type, marketplaceIds: [mp] };
    if (opts.optionsJson) { try { body.reportOptions = parseOptions(opts.optionsJson); } catch (e) { console.log(e.message); return; } }
    else if (opts.dateGranularity || opts.asinGranularity) {
      body.reportOptions = {};
      if (opts.dateGranularity) body.reportOptions.dateGranularity = opts.dateGranularity;
      if (opts.asinGranularity) body.reportOptions.asinGranularity = opts.asinGranularity;
    }
    if (opts.days) { body.dataStartTime = new Date(Date.now() - Number(opts.days) * 864e5).toISOString().slice(0, 10); body.dataEndTime = new Date().toISOString().slice(0, 10); }

    const cr = await callOp('createReport', { body });
    const reportId = ctx.unwrap(cr.data).reportId;
    if (!reportId) { console.log('创建报表失败: ' + JSON.stringify(cr.data).slice(0, 300)); return; }
    console.log('已创建报表 reportId=' + reportId + '，等待处理…');

    const maxPolls = Number(opts.maxPolls) || 30;
    let status, reportDocId;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((res) => setTimeout(res, 5000));
      const gr = await callOp('getReport', { pathParams: { reportId } });
      const p = ctx.unwrap(gr.data);
      status = p.processingStatus; reportDocId = p.reportDocumentId;
      process.stdout.write('  [' + (i + 1) + '/' + maxPolls + '] ' + status + '\r');
      if (status === 'DONE') break;
      if (status === 'CANCELLED' || status === 'FAILED') { console.log('\n报表未成功: ' + status); return; }
    }
    process.stdout.write('\n');
    if (status !== 'DONE') { console.log('轮询超时，未完成。可稍后 reports status --reportId ' + reportId); return; }

    const dr = await callOp('getReportDocument', { pathParams: { reportDocumentId: reportDocId } });
    const doc = ctx.unwrap(dr.data);
    if (!doc.url) { console.log('未取到文档 URL。'); return; }
    const resp = await fetch(doc.url);
    const raw = zlib.gunzipSync(Buffer.from(await resp.arrayBuffer()));
    const text = raw.toString('utf8');
    const trimmed = text.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let j; try { j = JSON.parse(text); } catch (e) { console.log('JSON 解析失败。'); return; }
      renderJsonReport(j);
    } else {
      const { rows, delim } = parseCsv(text);
      console.log('报表 ' + Math.max(0, rows.length - 1) + ' 行数据 × ' + (rows[0] || []).length + ' 列 | 分隔符 ' + (delim === '\t' ? 'TAB' : 'COMMA') + '\n');
      const header = (rows[0] || []).slice(0, 8).map((h) => String(h).slice(0, 16));
      console.log('列: ' + header.join(' | '));
      for (const row of rows.slice(1, Math.min(15, rows.length))) {
        if (row.length <= 2) continue;
        console.log('  ' + row.slice(0, 8).map((c) => String(c || '').slice(0, 18)).join(' | '));
      }
      if (rows.length - 1 > 15) console.log('…(共 ' + (rows.length - 1) + ' 行)');
    }
    if (save) { fs.writeFileSync(save, '\uFEFF' + text, 'utf8'); console.log('\n✅ 已保存: ' + path.resolve(save)); }
  }

  return {
    name: 'reports',
    title: '报表',
    describe: '创建/轮询/下载/解析报表（含在售listing）',
    commands: {
      create: { usage: '--type <ReportType> --marketplace X', run: create },
      status: { usage: '--reportId <id>', run: status },
      types: { usage: '', run: listTypes },
      run: { usage: '--type <ReportType> --marketplace X [--days N] [--save file.csv]', run: run },
      view: { usage: '--file <report.csv> [--status Active] [--rows N]', run: view },
    },
  };
};
