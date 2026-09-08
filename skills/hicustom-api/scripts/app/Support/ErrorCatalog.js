'use strict';
/**
 * ErrorCatalog.js — 指纹开放平台 全局错误码 → 中文说明。
 * 来源：开放平台文档「附录1：全局错误码」。程序应以 code 判断，不依赖 msg。
 */
const CODES = {
  1000: '请求失败', 1001: '缺少参数', 1002: '非法操作', 1003: '参数错误',
  1100: '获取详情接口code和id必须一个', 1101: '详情对象未找到', 1102: '非法code参数',
  2000: '不合理的access_token', 2001: 'access_token绑定的用户非法', 2002: '当前接口停用，请联系技术人员',
  2003: '没有当前接口权限，请联系技术人员', 2004: '超出当前接口请求频率',
  2102: '不合理的授权用户', 2104: '不合理的client_id或者client_secret（app_key/app_secret 凭证错误）',
  2105: '不合理的请求方式', 2106: 'access_token已过期',
  3001: '非法用户', 3002: '非法的productConfig参数', 3003: '非法json参数', 3004: '该空白产品不存在或已下架',
  3005: '非法color_id参数', 3006: '非法view_id参数', 3007: '非法cfgs参数', 3008: 'cfgs参数中type参数异常',
  3009: '非法gallery_id参数', 3010: '非法offset_x参数', 3011: '非法offset_y参数', 3012: '非法height参数',
  3013: '非法width参数', 3014: '非法opacity参数', 3015: '非法print_area_id参数', 3016: '图片超出印刷区域范围',
  3017: '非法product_type_id参数', 3018: '非法gallery_id参数', 3019: '预览操作失败', 3020: '生成定制产品操作失败',
  3100: '非法image参数', 3101: '上传操作失败', 3102: '图片上传超时或格式不正确',
  3200: '非法start_created参数', 3201: '非法end_created参数', 3202: '非法cid参数',
  4000: '非法order参数', 4001: '非法address参数', 4002: 'order参数不是json格式', 4003: 'address参数不是json格式',
  4004: '非法的orderItems参数', 4005: '非法的product_id参数', 4006: '非法的stock_item_id参数', 4007: '非法的qty参数',
  4008: '请不要提交重复的order_from_id', 4009: '用户地址不匹配系统，请联系技术人员', 4010: '创建订单失败，请联系技术人员',
  4011: '订单参数payment_time非法', 4012: '订单参数order_time非法', 4013: '订单参数currency_code非法',
  4014: '订单参数shipping_amount非法', 4015: '订单参数subtotal非法', 4016: '订单参数discount_amount非法',
  4017: '订单参数grand_total非法', 4018: '用户地址不匹配物流系统配送，请联系技术人员',
  4020: '非法order_id参数', 4021: '非法order_from_id参数', 4022: '不存在的订单',
  4100: '非法的country参数', 4101: '非法的region参数', 4102: '非法的city参数', 4103: '非法的area参数',
  4104: '非法的street参数', 4105: '非法的postcode参数', 4106: '非法的mobile_phone参数', 4107: '非法的consignee_first_name参数',
  4200: '无效的物流跟踪号',
};

function describe(code, fallback) {
  return CODES[String(code)] || fallback || ('未知错误码 ' + code);
}
function list() {
  return Object.keys(CODES).map((k) => ({ code: Number(k), message: CODES[k] }));
}

module.exports = { CODES, describe, list };
