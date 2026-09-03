'use strict';
// @ts-nocheck
/**
 * parse.js — CLI 参数解析器（轻量、无外部依赖）。
 * 支持 --key value 与 --flag。
 * 例：parse(['--days','7','--marketplace','X']) => { days: 7, marketplace: 'X' }
 */
function camelCase(key) { return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

function parseArgv(argv, defaults = {}) {
  const opts = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') || (a.startsWith('-') && a.length > 1)) {
      const rawKey = a.replace(/^--?/, '');
      const key = camelCase(rawKey);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('-')) { opts[key] = next; i++; }
      else opts[key] = true;
    }
  }
  return opts;
}

module.exports = { parseArgv };
