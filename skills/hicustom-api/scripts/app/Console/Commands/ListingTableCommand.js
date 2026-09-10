'use strict';
const path = require('path');
/**
 * ListingTableCommand — listing:table
 * 轻量读取亚马逊原始模板(或回填后的 listing_filled.xlsm)里「我们回填的数据列」：
 *   只读 Template 表的第4行(列标签 label)、第5行(底层 attribute)、第7行(回填数据行)，
 *   不加载 Data Definitions / Dropdown Lists 等其它 sheet，避免读取量过大。
 * 用法: listing:table --product-id 12664 [--filled] [--json]
 *   默认读 config/listing.templatePath（原始模板）；--filled 读回填产物 listing_filled.xlsm。
 */
const { readFilledTable } = require('../../Support/ListingTable');

class ListingTableCommand {
  constructor(app) { this.app = app; this.signature = 'listing:table'; this.description = '读取模板里回填的数据列+列名(轻量)'; this.usage = '--product-id <id> [--filled] [--json]'; }
  handle(opts) {
    const config = this.app.make('config');
    const id = opts.productId;
    if (!id) { console.log('需要 --product-id <商品id>。'); return; }
    const tpl = process.env.LISTING_TEMPLATE_PATH || (config.listing && config.listing.templatePath) || '';
    let xlsm;
    if (opts.filled) xlsm = path.join(config.outputDir, String(id), 'listing', 'listing_filled.xlsx');
    else xlsm = tpl;
    const t = readFilledTable(xlsm);
    if (t.error) { console.log('❌ 读取失败: ' + t.error); return; }
    if (!t.filled.length) { console.log('⚠️ 模板(或回填文件)第7行为空：' + xlsm); return; }
    if (opts.json) {
      console.log(JSON.stringify({ file: xlsm, columns: t.columns, row: t.row, filled: t.filled.map((f) => ({ col: f.col, label: f.header, attribute: f.attribute, value: f.value })) }, null, 2));
      return;
    }
    console.log('===== ' + path.basename(xlsm) + ' 回填列 (' + t.filled.length + ' 列) =====');
    for (const f of t.filled) {
      const v = String(f.value);
      console.log('  ' + f.header + '  [' + f.attribute + ']  =  ' + (v.length > 80 ? v.slice(0, 80) + '…' : v));
    }
  }
}
module.exports = { ListingTableCommand };
