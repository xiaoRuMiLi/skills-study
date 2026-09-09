'use strict';
/**
 * ListingTranslateCommand — listing:translate（上架文案→中文，仅审阅）。
 * 用法: listing:translate --product-id <id> [--force]
 * 产物: output/<id>/listing/translation.json（不改 record.json / xlsm）
 */
const fs = require('fs');
const path = require('path');
const { translateRecord } = require('../../Services/ListingTranslation');

class ListingTranslateCommand {
  constructor(app) { this.app = app; this.signature = 'listing:translate'; this.description = '上架文案→中文(审阅用,不改表格)'; this.usage = '--product-id <id> [--force]'; }
  async handle(opts) {
    const id = opts.productId;
    if (!id) { console.log('需要 --product-id <id>。'); return; }
    const config = this.app.make('config');
    const recFile = path.join(config.outputDir, String(id), 'listing', 'record.json');
    const outFile = path.join(config.outputDir, String(id), 'listing', 'translation.json');
    if (!fs.existsSync(recFile)) { console.log('未找到 ' + recFile + '（先跑 listing 流程生成 record.json）。'); return; }
    if (!opts.force && fs.existsSync(outFile)) { console.log('已存在中文翻译，跳过复用（--force 重新翻译）→ ' + outFile); return; }
    const record = JSON.parse(fs.readFileSync(recFile, 'utf8'));
    console.log('翻译中(智谱 glm-4)…');
    const zh = await translateRecord(record);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(zh, null, 2), 'utf8');
    console.log('✅ 中文翻译: ' + outFile);
    console.log('  标题: ' + zh.item_name_zh);
    console.log('  五点: ' + (zh.bullet_points_zh || []).map((b) => '· ' + b).join('\n'));
  }
}
module.exports = { ListingTranslateCommand };
