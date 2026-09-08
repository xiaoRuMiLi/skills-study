'use strict';
/**
 * GalleryService.js — 图库业务服务（图库上传 / 图库分类）。
 * 只做业务语义与参数组装；HTTP/鉴权交给 injected http；不打印业务结果。
 * 上传返回 { code, design_img, preview_img, ... } 供上层使用。
 */
const fs = require('fs');

class GalleryService {
  constructor(http) { this.http = http; }

  // 上传图片（form-data，multipart）。image 为本地文件路径；外字段可选。
  async upload({ image, cn_name, en_name, cn_tags, en_tags, external_id, external_customer_id } = {}) {
    if (!image || !fs.existsSync(image)) throw new Error('缺少有效的 --file 图片路径');
    const buf = fs.readFileSync(image);
    const name = image.split(/[\\/]/).pop();
    const ext = (name.split('.').pop() || 'png').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    const fd = new FormData();
    fd.append('image', new Blob([buf], { type: mime }), name);
    const map = { cn_name, en_name, cn_tags, en_tags, external_id, external_customer_id };
    for (const [k, v] of Object.entries(map)) if (v != null && v !== '') fd.append(k, String(v));
    return this.http.post(this.http.config.endpoints.galleryUpload, { form: fd });
  }

  // 图库分类；lang: '1'中文 '2'英文
  async categories({ lang } = {}) {
    return this.http.get(this.http.config.endpoints.galleryCategories, { query: { lang } });
  }

  // 图库列表（分页）；参数见文档：page/page_size/lang/cid/lowest_cids/created_from/created_to/sort_field/sort_type/customer_code/external_customer_id/external_id
  async list(params = {}) {
    const q = { page: params.page, page_size: params.pageSize, lang: params.lang, cid: params.cid,
      lowest_cids: params.lowestCids, created_from: params.createdFrom, created_to: params.createdTo,
      sort_field: params.sortField, sort_type: params.sortType, customer_code: params.customerCode,
      external_customer_id: params.externalCustomerId, external_id: params.externalId };
    return this.http.get(this.http.config.endpoints.galleryList, { query: q });
  }

  // 图片详情
  async detail(code, { lang } = {}) {
    const path = this.http.config.endpoints.galleryDetail.replace('{code}', encodeURIComponent(code));
    return this.http.get(path, { query: { lang } });
  }

  // 图片编辑（PATCH，x-www-form-urlencoded）；只传要改的字段
  async edit(code, fields = {}) {
    const path = this.http.config.endpoints.galleryEdit.replace('{code}', encodeURIComponent(code));
    return this.http.patch(path, { urlencoded: fields });
  }
}

module.exports = { GalleryService };
