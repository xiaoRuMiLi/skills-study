'use strict';
/**
 * get-merchant-cookie.js — 从已登录浏览器抓 hicustom 商家后台 cookie，写入 .env 的 HICUSTOM_MERCHANT_COOKIE。
 * 用法:
 *   node scripts/dev/oneshot/get-merchant-cookie.js                     # 自动发现 hicustom 页面(默认端口19012)
 *   node scripts/dev/oneshot/get-merchant-cookie.js <cdp-port>          # 指定 CDP 端口
 *   node scripts/dev/oneshot/get-merchant-cookie.js ws://.../page/<id>  # 直接给页面 target ws
 * 前提：浏览器已登录 www.hicustom.com/merchant。不打印 cookie 值。
 */
const { refreshMerchantCookie } = require('../../app/Support/MerchantCookie');

(async () => {
  const arg = process.argv[2];
  try {
    let opts = {};
    if (arg && /^ws:\/\//.test(arg)) opts.wsUrl = arg;
    else if (arg) opts.port = arg;
    const r = await refreshMerchantCookie(opts);
    console.log('✅ 已写入 .env HICUSTOM_MERCHANT_COOKIE（长度 ' + r.length + '）→ ' + r.env);
  } catch (e) { console.log('❌ ' + e.message); process.exit(1); }
})();
