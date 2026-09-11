'use strict';
/**
 * GalleryCleanCommand — gallery:clean
 * 清理「为跑流程而上传的测试图」（清单见 app/Support/PendingCleanup，状态文件 .hicustom/_cleanup-pending.json）。
 * 走商家后台接口（官方无删除接口）：POST /merchant/customerGallery/batchdelete + deleterecycle。
 *
 * 用法：
 *   node scripts/hi.js gallery:clean --list              # 只看清单（不删）
 *   node scripts/hi.js gallery:clean                     # 删除清单里的全部（+清回收站+复核）
 *   node scripts/hi.js gallery:clean --add A,B,C         # 手工加入清单
 *   node scripts/hi.js gallery:clean --codes A,B         # 只删这几个（不影响清单外的）
 *   node scripts/hi.js gallery:clean --prune             # 从清单里剔除"已不存在"的
 */
class GalleryCleanCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'gallery:clean';
    this.description = '清理测试图库（待清理清单，一键批量删除 + 清回收站）';
    this.usage = '[--list] [--add a,b] [--codes a,b] [--prune] [--keep-recycle]';
  }

  async handle(opts) {
    const pending = this.app.make('pendingCleanup');
    const cg = this.app.make('customerGallery');
    console.log('========== gallery:clean ==========');

    // --log [n]：查看最近 N 次「商家后台」调用（留痕，便于核对）
    if (opts.log !== undefined) {
      const n = Number(opts.log) > 0 ? Number(opts.log) : 20;
      const mhttp = require('../../Support/MerchantHttp').getMerchantHttp(this.app.make('config'));
      const rows = mhttp.recent(n);
      console.log('最近 ' + rows.length + ' 次商家后台调用（' + mhttp.logFile + '）:');
      rows.forEach((r) => console.log('  ' + r.ts + '  ' + r.method + ' ' + r.path + '  -> ' + (r.status || r.error) + '  ' + r.ms + 'ms' + (r.attempt ? '  retry#' + r.attempt : '')));
      return;
    }

    if (opts.add) {
      const items = String(opts.add).split(',').map((s) => ({ code: s.trim(), note: 'manual' })).filter((x) => x.code);
      const arr = pending.add(items);
      console.log('已加入清单 ' + items.length + ' 条，当前共 ' + arr.length + ' 条');
    }

    let items = pending.list();
    console.log('待清理 ' + items.length + ' 条' + (items.length ? '：' + items.map((x) => x.code).join(', ') : ''));

    if (!cg._hasCookie()) {
      console.log('⚠️ 商家 cookie 不可用（未配置或已过期）→ 无法删除。');
      console.log('   处理办法：登录 www.hicustom.com/merchant 后执行 node scripts/dev/oneshot/get-merchant-cookie.js');
      return;
    }

    // 用当前图库现况核对（同时可用于剔除失效码）
    let existing = new Set();
    try {
      const r = await cg.listAll({ pageSize: 200 });
      existing = new Set(r.list.map((x) => x.code));
      console.log('图库现况核对完成（我的图库共 ' + r.total + ' 条）');
    } catch (e) {
      console.log('⚠️ 读取图库失败：' + e.message + '（cookie 可能已过期）');
      return;
    }

    if (opts.list) {
      items.forEach((x) => console.log('  ' + x.code + (existing.has(x.code) ? '  [存在]' : '  [已不在]') + (x.note ? '  ' + x.note : '')));
      return;
    }

    const targets = opts.codes
      ? String(opts.codes).split(',').map((s) => s.trim()).filter(Boolean)
      : items.map((x) => x.code);

    const gone = targets.filter((c) => !existing.has(c));
    const todo = targets.filter((c) => existing.has(c));
    if (gone.length) console.log('（其中 ' + gone.length + ' 条已不在图库：' + gone.join(',') + '）');

    if (!todo.length) {
      if (opts.prune) { pending.remove(gone); console.log('已从清单剔除失效码'); }
      console.log('无需删除 ✅');
      return;
    }

    console.log('开始删除 ' + todo.length + ' 条…');
    const res = await cg.deleteCodes(todo, { log: (m) => console.log('  ' + m) });

    await new Promise((s) => setTimeout(s, 1500));
    if (!opts.keepRecycle) { try { await cg.purgeRecycle(); } catch (e) { /* ignore */ } }
    await new Promise((s) => setTimeout(s, 15000));
    const after = await cg.listAll({ pageSize: 200 });
    const still = after.list.map((x) => x.code).filter((c) => todo.indexOf(c) >= 0);
    console.log('复核：仍存在 ' + still.length + (still.length ? ' -> ' + still.join(',') : ' ✅ 已清理干净'));
    const done = todo.filter((c) => still.indexOf(c) < 0);
    pending.remove(done.concat(gone));
    console.log('清单已更新，剩余 ' + pending.list().length + ' 条');
  }
}

module.exports = { GalleryCleanCommand };
