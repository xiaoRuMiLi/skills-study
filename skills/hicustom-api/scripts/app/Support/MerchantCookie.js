'use strict';
/**
 * MerchantCookie — 从已登录浏览器 CDP 抓 hicustom 商家 cookie，读写 .env 的 HICUSTOM_MERCHANT_COOKIE。
 * 被 get-merchant-cookie.js（CLI）与 serve.js（cookie 过期自动刷新）共用。
 * 不打印 cookie 值。
 */
const fs = require('fs');
const path = require('path');

// .env 路径：优先环境变量，否则取 skill 根目录（app/Support -> app -> scripts -> skill 根 = 上3级）
const ENV = process.env.HICUSTOM_ENV || path.join(__dirname, '..', '..', '..', '.env');

async function findHicustomPage(port) {
  const url = 'http://127.0.0.1:' + port + '/json/list';
  const list = await (await fetch(url)).json();
  const page = list.find((t) => t.type === 'page' && /hicustom\.com/.test(t.url));
  if (!page) throw new Error('在 CDP :' + port + ' 没找到 hicustom 页面（确认已登录并打开 hicustom.com）。');
  return page.webSocketDebuggerUrl;
}

function getCookieHeader(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      const t = setTimeout(() => { pending.delete(mid); rej(new Error('timeout ' + method)); }, 15000);
      pending.set(mid, (m) => { clearTimeout(t); res(m); });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    ws.onopen = async () => {
      try {
        const r = await send('Network.getCookies', { urls: ['https://www.hicustom.com', 'https://api.hicustom.com'] });
        const cookies = (r.result && r.result.cookies) || [];
        const header = cookies.map((c) => c.name + '=' + c.value).join('; ');
        if (!header) { reject(new Error('未取到 cookie，可能未登录。')); return; }
        resolve(header);
      } catch (e) { reject(e); }
      ws.close();
    };
    ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onclose = () => {};
  });
}

function writeEnvCookie(header) {
  let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  if (/^HICUSTOM_MERCHANT_COOKIE=.*$/m.test(env)) env = env.replace(/^HICUSTOM_MERCHANT_COOKIE=.*$/m, 'HICUSTOM_MERCHANT_COOKIE=' + header);
  else env = env.replace(/\s*$/, '') + '\nHICUSTOM_MERCHANT_COOKIE=' + header + '\n';
  fs.writeFileSync(ENV, env, 'utf8');
  return ENV;
}

// 刷新并写 .env，返回 { header, env }。port 可覆盖；wsUrl 直接给可跳过发现。
async function refreshMerchantCookie({ port = process.env.HICUSTOM_CDP_PORT || '19012', wsUrl } = {}) {
  const u = wsUrl || await findHicustomPage(port);
  const header = await getCookieHeader(u);
  const env = writeEnvCookie(header);
  return { header, env, length: header.length };
}

module.exports = { refreshMerchantCookie, getCookieHeader, findHicustomPage, writeEnvCookie };
