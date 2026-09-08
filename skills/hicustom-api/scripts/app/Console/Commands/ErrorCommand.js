'use strict';
/**
 * ErrorCommand — error:describe / error:list
 * 查看全局错误码中文说明。
 *   error:describe --code 2104
 *   error:list [--grep key]
 */
const { describe, list } = require('../../Support/ErrorCatalog');

class ErrorCommand {
  constructor(app) { this.app = app; this.signature = 'error:describe'; this.description = '错误码中文说明'; this.usage = '--code <错误码>  或  error:list'; }
  async handle(opts) {
    if (opts.code != null) {
      console.log('========== error:describe ==========');
      console.log('  [' + opts.code + '] ' + describe(opts.code));
      return;
    }
    console.log('========== error:list ==========');
    const all = list();
    const grep = opts.grep ? String(opts.grep) : '';
    for (const e of all) {
      if (grep && !String(e.message).includes(grep)) continue;
      console.log('  ' + String(e.code).padEnd(6) + e.message);
    }
  }
}
module.exports = { ErrorCommand };
