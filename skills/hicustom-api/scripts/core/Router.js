'use strict';
/**
 * Router.js — artisan 式命令路由 + CLI 参数解析。
 * register(name, { description, usage, run })；dispatch(argv)。
 * --kebab-case 自动转 camelCase 选项。
 */
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

class Router {
  constructor() { this.commands = new Map(); }
  register(name, def) { this.commands.set(name, def); }
  list() { return [...this.commands.entries()]; }
  parseArgv(rest) {
    const opts = {};
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a.startsWith('--')) {
        const key = camel(a.slice(2));
        let val = true;
        if (rest[i + 1] && !rest[i + 1].startsWith('--')) val = rest[++i];
        opts[key] = val;
      } else {
        // 位置参数
        if (!opts._) opts._ = [];
        opts._.push(a);
      }
    }
    return opts;
  }
  async dispatch(argv) {
    const [name, ...rest] = argv;
    if (!name || name === 'list' || name === 'help') { this.printList(); return 0; }
    const cmd = this.commands.get(name);
    if (!cmd) { console.log('未知命令: ' + name + '。用 `node scripts/hi.js list` 查看。'); return 1; }
    await cmd.run(this.parseArgv(rest), rest);
    return 0;
  }
  printList() {
    console.log('hicustom-api (指纹开放平台客户端)\n');
    for (const [name, def] of this.commands) {
      console.log('  ' + name.padEnd(26) + (def.description || (def.usage || '')));
    }
    console.log('\n  list                     列出全部命令');
  }
}

module.exports = { Router, camel };
