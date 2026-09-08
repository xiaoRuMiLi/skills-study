'use strict';
/**
 * TradeService.js — 交易记录业务服务（按时间范围查商户端交易流水）。
 * GET /api/v1/common/trade_record。返回 { total, page, page_size, list:[...] }。
 */
class TradeService {
  constructor(http) { this.http = http; }

  // params: page/pageSize(必填,pageSize<=500)/type/payway/payStatus/orderNum/tradeNo/payCurrency
  //         createdFrom/createdTo -> created_range{from,to}；arrivalFrom/arrivalTo -> arrival_time_range{from,to}
  //         customerIds(array) -> customer_ids
  async records({ page, pageSize, type, payway, payStatus, orderNum, tradeNo, payCurrency, createdFrom, createdTo, arrivalFrom, arrivalTo, customerIds } = {}) {
    const query = {
      page, page_size: pageSize, type, payway, pay_status: payStatus, order_num: orderNum,
      trade_no: tradeNo, pay_currency: payCurrency, customer_ids: customerIds,
      created_range: (createdFrom || createdTo) ? { from: createdFrom, to: createdTo } : undefined,
      arrival_time_range: (arrivalFrom || arrivalTo) ? { from: arrivalFrom, to: arrivalTo } : undefined,
    };
    return this.http.get(this.http.config.endpoints.tradeRecord, { query });
  }
}
module.exports = { TradeService };
