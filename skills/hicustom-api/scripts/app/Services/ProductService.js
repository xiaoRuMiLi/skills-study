'use strict';
/**
 * ProductService.js — 空白产品业务服务（列表 / 分类 / 详情）。
 * 空白产品 = 指纹平台可定制设计的底板（male/female tee、手机壳、抱枕套等）。
 * 每个变体（颜色x尺码）的 id 不同；detail 返回颜色/尺码/印刷区/价格/批发价等。
 */
class ProductService {
  constructor(http) { this.http = http; }

  // 空白产品列表（分页）；cid 分类id，lowest_cids 只显示最底层
  async list({ page, pageSize, cid, lowestCids } = {}) {
    return this.http.get(this.http.config.endpoints.productTypes, {
      query: { page, page_size: pageSize, cid, lowest_cids: lowestCids },
    });
  }

  // 空白产品分类（树状）
  async categories() {
    return this.http.get(this.http.config.endpoints.productTypeCategories);
  }

  // 空白产品详情：颜色/尺码/印刷区/价格/批发价/变体
  async detail(id) {
    const path = this.http.config.endpoints.productTypeDetail.replace('{id}', encodeURIComponent(id));
    return this.http.get(path);
  }

  // 近一个月下架的空白产品列表（返回 id 数组）
  async removed() {
    return this.http.get(this.http.config.endpoints.productTypeRemove);
  }
}
module.exports = { ProductService };
