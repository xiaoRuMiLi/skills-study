'use strict';
/**
 * DesignService.js — 定制产品业务服务（列表 / 详情）。
 * 定制产品 = 空白产品 + 设计素材合成的成品（指纹ERP-刊登-定制产品）。
 * 每个变体（颜色x尺码）的 id 不同；detail 返回颜色/尺码/效果图/design_* 命名/SKU。
 */
class DesignService {
  constructor(http) { this.http = http; }

  // 定制产品列表（分页）
  async list({ page, pageSize, lang, createdFrom, createdTo, customerCode, externalCustomerId, externalId } = {}) {
    return this.http.get(this.http.config.endpoints.customProducts, {
      query: {
        page, page_size: pageSize, lang, created_from: createdFrom, created_to: createdTo,
        customer_code: customerCode, external_customer_id: externalCustomerId, external_id: externalId,
      },
    });
  }

  // 定制产品详情
  async detail(code) {
    const path = this.http.config.endpoints.customProductDetail.replace('{code}', encodeURIComponent(code));
    return this.http.get(path);
  }

  // 定制产品自动合成——效果图预览/调试（cfgs 为 [{view_id,gallery_code,width,height,top_x,top_y}]）
  async preview({ productTypeId, defaultColorId, defaultViewId, imageWidth, cfgs } = {}) {
    return this.http.get(this.http.config.endpoints.productPreview, {
      query: {
        product_type_id: productTypeId, default_color_id: defaultColorId, default_view_id: defaultViewId,
        image_width: imageWidth,
        cfgs: Array.isArray(cfgs) ? JSON.stringify(cfgs) : cfgs,
      },
    });
  }

  // 定制产品自动合成（POST /api/v1/product，x-www-form-urlencoded）
  // 传入 cfgs: [{view_id,gallery_code,width,height,top_x,top_y}]，返回定制产品 + colors[].renderings[]（完整展示图）
  async composite({ productTypeId, defaultColorId, defaultViewId, externalId, externalCustomerId, cfgs } = {}) {
    if (!productTypeId) throw new Error('缺少 product_type_id');
    if (!Array.isArray(cfgs) || cfgs.length === 0) throw new Error('缺少 cfgs（图片元素参数）');
    return this.http.post(this.http.config.endpoints.productComposite, {
      urlencoded: {
        product_type_id: productTypeId,
        default_color_id: defaultColorId,
        default_view_id: defaultViewId,
        external_id: externalId,
        external_customer_id: externalCustomerId,
        cfgs, // HttpClient 会 JSON.stringify 数组
      },
    });
  }
}
module.exports = { DesignService };
