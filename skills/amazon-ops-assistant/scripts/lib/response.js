'use strict';
// @ts-nocheck
/**
 * response.js — SP-API 响应解包。
 * SP-API GET 常以 { payload: {...} } 包装；这里解包，兼容无包装情况。
 */
function unwrap(data) {
  if (data && data.payload) return data.payload;
  return data || {};
}

module.exports = { unwrap };
