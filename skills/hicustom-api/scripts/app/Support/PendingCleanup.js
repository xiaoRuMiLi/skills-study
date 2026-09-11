'use strict';
/**
 * PendingCleanup —— 「待清理图库」清单。
 * 任何为了流程跑通而上传到指纹图库的测试图（标定图/复核孪生图…）都记在这里，
 * 等商家 cookie 有效时用 `gallery:clean` 一次性删干净，避免遗忘、也避免频繁删。
 * 存储：<stateDir>/_cleanup-pending.json
 */
const fs = require('fs');
const path = require('path');

class PendingCleanup {
  constructor(config) {
    this.file = path.join(path.dirname(config.tokenCachePath), '_cleanup-pending.json');
  }
  list() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { return []; }
  }
  _write(items) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(items, null, 2), 'utf8');
    return items;
  }
  /** 追加（按 code 去重） */
  add(entries) {
    const arr = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    const items = this.list();
    const seen = new Set(items.map((x) => x.code));
    for (const e of arr) {
      const code = (typeof e === 'string') ? e : (e && e.code);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      items.push({ code: code, note: (e && e.note) || '', at: new Date().toISOString() });
    }
    return this._write(items);
  }
  /** 移除（已删除成功的） */
  remove(codes) {
    const set = new Set((Array.isArray(codes) ? codes : [codes]).filter(Boolean));
    return this._write(this.list().filter((x) => !set.has(x.code)));
  }
  clear() { return this._write([]); }
}

module.exports = { PendingCleanup };
