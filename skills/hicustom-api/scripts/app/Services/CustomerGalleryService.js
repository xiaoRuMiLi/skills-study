'use strict';
/**
 * CustomerGalleryService — 商家后台「图库 / 图库收藏」接口（cookie 鉴权，非开放平台）。
 *
 * ⚠️ 开放平台(api.hicustom.com)【没有】收藏夹/收藏图接口；这些都在商家后台 www.hicustom.com：
 *    - 列表  POST /merchant/customerGallery/customerGalleryCategory   （收藏夹里的图；page / pageSize）
 *    - 列表  POST /merchant/customerGallery/index                     （我的图库；page）
 *    - 导出  POST /merchant/customerGallery/download                  （ids=a,b,c → 建导出任务）
 *    - 记录  GET  /merchant/platformExportRecord/index                （轮询 status=2「已生成」）
 *    - 取件  GET  /merchant/platformExportRecord/download?code=<code>（ZIP，**原图**）
 *  鉴权：.env 的 HICUSTOM_MERCHANT_COOKIE（同 shipping:quote）。
 *
 * ⚠️ 列表里的 imageUrl 只有 500px 缩略图；**原图必须走导出 ZIP**。
 */
class CustomerGalleryService {
  constructor(config) {
    this.config = config;
    this.merchantBase = config.merchantBaseUrl || 'https://www.hicustom.com';
    this.cookie = config.merchantCookie || '';
    this.h = () => ({ Cookie: this.cookie, 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' });
    // 商家后台专用 HTTP：串行 + 节流 + 退避 + 留痕（见 app/Support/MerchantHttp.js）
    this.mhttp = require('../Support/MerchantHttp').getMerchantHttp(config);
  }

  _hasCookie() { return !!this.cookie; }
  _needCookie() {
    if (!this._hasCookie()) {
      const e = new Error('未配置 HICUSTOM_MERCHANT_COOKIE（.env）。请登录 www.hicustom.com/merchant 后取其 Cookie 填入。');
      e.code = 'NO_COOKIE';
      throw e;
    }
  }
  async _json(res) {
    const t = await res.text();
    let j = null; try { j = JSON.parse(t); } catch (e) { /* not json */ }
    if (!j) throw new Error('非 JSON 响应 HTTP ' + res.status + ' ' + t.slice(0, 120));
    return j;
  }
  async _postForm(pathname, fields = {}) {
    this._needCookie();
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') body.set(k, String(v));
    const res = await this.mhttp.post(this.merchantBase + pathname, {
      headers: { ...this.h(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    });
    return this._json(res);
  }
  async _get(pathname) {
    this._needCookie();
    const res = await this.mhttp.get(this.merchantBase + pathname, { headers: this.h() });
    return this._json(res);
  }

  /** 收藏夹（分类）树：navData.data.list[].subCg[]（含 id/name/count） */
  async categories() {
    const j = await this._get('/merchant/customerGallery/customerGalleryCategory');
    const list = (j.data && j.data.navData && j.data.navData.data && j.data.navData.data.list) || [];
    const flatten = (nodes, depth = 0, out = []) => {
      for (const n of nodes || []) { out.push({ depth, id: n.id, name: n.name, count: n.count }); if (n.subCg) flatten(n.subCg, depth + 1, out); }
      return out;
    };
    return { groups: list.map((g) => g.name), folders: flatten((list[0] && list[0].subCg) || []), raw: j.data };
  }

  /** 收藏夹里的图（默认「图库收藏」）。catId 传分类 id 时一并带上（部分账号未分类，服务端会忽略）。 */
  async list({ page = 1, pageSize = 200, catId, scope = 'category' } = {}) {
    const path = scope === 'gallery' ? '/merchant/customerGallery/index' : '/merchant/customerGallery/customerGalleryCategory';
    const j = await this._postForm(path, { page, pageSize, cat_id: catId });
    const d = (j.data) || {};
    return { total: d.total || 0, perPage: d.per_page || pageSize, currentPage: d.current_page || page, list: d.data || [] };
  }

  /** 拉全部（自动翻页） */
  async listAll(opts = {}) {
    const pageSize = opts.pageSize || 200;
    const first = await this.list({ ...opts, page: 1, pageSize });
    const out = first.list.slice();
    const lastPage = Math.max(1, Math.ceil((first.total || out.length) / pageSize));
    for (let p = 2; p <= lastPage; p++) {
      const r = await this.list({ ...opts, page: p, pageSize });
      out.push(...r.list);
      if (!r.list.length) break;
    }
    return { total: first.total, list: out };
  }

  /** 建导出任务（传入图片 id 数组） */
  async export(ids) {
    const arr = (Array.isArray(ids) ? ids : String(ids).split(',')).map((x) => String(x).trim()).filter(Boolean);
    if (!arr.length) throw new Error('请至少选择 1 张图片（--ids 或先 --list 拿 id）');
    const j = await this._postForm('/merchant/customerGallery/download', { ids: arr.join(',') });
    if (j.status !== 1000 && j.code !== 'success') throw new Error('建导出任务失败: ' + (j.msg || ''));
    return { ids: arr, redirect: j.data && j.data.url };
  }

  /** 导出记录列表（最新在前） */
  async exportRecords() {
    const j = await this._get('/merchant/platformExportRecord/index');
    return (j.data && j.data.data) || [];
  }

  /** 轮询到某个导出任务完成（status=2「已生成」）。matchIds 用于定位记录。 */
  async waitExport({ ids, timeoutMs = 180000, intervalMs = 3000, log } = {}) {
    const want = new Set((ids || []).map(String));
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await new Promise((s) => setTimeout(s, intervalMs));
      const recs = await this.exportRecords();
      const rec = recs.find((r) => {
        const p = (r.params || []).find((x) => x.key === 'ids');
        if (!p) return false;
        const got = String(p.value).split(',');
        return got.length === want.size && got.every((x) => want.has(String(x)));
      }) || (want.size ? null : recs[0]);
      if (rec) {
        if (log) log(`  导出 ${rec.code} status=${rec.status}(${rec.status_text}) ${rec.export_num}/${rec.num}`);
        if (rec.status === 2) return rec;
        if (rec.status === 3) throw new Error('导出失败: ' + rec.code);
      }
    }
    throw new Error('导出超时（' + Math.round(timeoutMs / 1000) + 's）');
  }

  /** 按 code 删除（先查 id，再批量删；成功后由调用方决定是否清回收站） */
  async deleteCodes(codes, { log } = {}) {
    const want = new Set((Array.isArray(codes) ? codes : [codes]).map(String));
    const r = await this.listAll({ pageSize: 200 });
    const ids = r.list.filter((x) => want.has(String(x.code))).map((x) => x.id);
    if (!ids.length) return { deleted: [], missing: Array.from(want) };
    const j = await this._postForm('/merchant/customerGallery/batchdelete', { ids: ids.join(',') });
    if (log) log('batchdelete -> ' + JSON.stringify(j).slice(0, 120));
    if (!(j.status === 1000 || j.code === 'success')) throw new Error('删除失败: ' + (j.msg || ''));
    return { deleted: r.list.filter((x) => want.has(String(x.code))).map((x) => x.code), missing: [] };
  }

  /** 清空回收站（彻底删除） */
  async purgeRecycle(ids) {
    const j = await this._postForm('/merchant/customerGallery/deleterecycle', ids ? { ids: ids.join(',') } : { ids: '' });
    return j;
  }

  /** 取 ZIP（返回 Buffer） */
  async downloadZip(code) {
    this._needCookie();
    const res = await this.mhttp.get(this.merchantBase + '/merchant/platformExportRecord/download?code=' + encodeURIComponent(code), { headers: this.h() });
    if (!res.ok) throw new Error('下载失败 HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('返回的不是 ZIP（可能记录未生成/已过期）');
    return buf;
  }
}

module.exports = { CustomerGalleryService };
