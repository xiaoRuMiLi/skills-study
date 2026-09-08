'use strict';
/**
 * OrderService.js — 订单业务服务（创建 / 列表 / 详情）。
 * 创建订单：POST /api/v1/order，x-www-form-urlencoded；嵌套对象(order_items/address)由 HttpClient 转 JSON 字符串。
 * 订单状态: -1未付货款 -2待编辑 3已付货款 5排单中 8确认生产 9已发货 7已取消
 * 物流: 详情 logistic_info.shipping_track_number = 物流单号/跟踪号（回填亚马逊用）
 */

const STATUS = { '-1': '未付货款', '-2': '待编辑', '3': '已付货款', '5': '排单中', '8': '确认生产', '9': '已发货', '7': '已取消' };
function statusLabel(s) { return STATUS[String(s)] || s; }

class OrderService {
  constructor(http) { this.http = http; }
  get statusLabel() { return statusLabel; }

  // 创建订单。payload 为订单对象（out_order_id/store_id/address/order_items/product_code/stock_item_id/qty 等）
  async create(orderPayload) {
    return this.http.post(this.http.config.endpoints.createOrder, { urlencoded: orderPayload });
  }

  // 订单列表（近180天）
  async list({ page, pageSize, status, createdFrom, createdTo } = {}) {
    return this.http.get(this.http.config.endpoints.orderList, {
      query: { page, page_size: pageSize, status, created_from: createdFrom, created_to: createdTo },
    });
  }

  // 订单详情（平台订单号）；queryWeightVolume 查重量体积
  async detail(orderId, { queryWeightVolume } = {}) {
    const path = this.http.config.endpoints.orderDetail.replace('{order_id}', encodeURIComponent(orderId));
    return this.http.get(path, { query: { query_weight_volume: queryWeightVolume } });
  }

  // 订单详情（商户订单号查询）；多店铺同单号时传 storeId
  async detailByOutOrderId(outOrderId, { storeId, queryWeightVolume } = {}) {
    const path = this.http.config.endpoints.orderByOutId.replace('{out_order_id}', encodeURIComponent(outOrderId));
    return this.http.get(path, { query: { store_id: storeId, query_weight_volume: queryWeightVolume } });
  }

  // 商户订单项生产信息（已发货订单：生产项/单件码）；outItemIds 数组
  async itemProductionInfo(outItemIds) {
    return this.http.post(this.http.config.endpoints.orderItemProduction, { json: { out_item_ids: outItemIds } });
  }
}
module.exports = { OrderService, statusLabel };
