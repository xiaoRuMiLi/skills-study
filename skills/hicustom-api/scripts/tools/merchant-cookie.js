'use strict';
/**
 * merchant-cookie.js — 一键抓取/更新 HICUSTOM 商家登录 Cookie（HICUSTOM_MERCHANT_COOKIE）。
 * 用法: node scripts/tools/merchant-cookie.js --grab [--port 19012] [--host 127.0.0.1]
 *
 * 工作流（Cookie 失效时）：
 *   1) （由 agent 用受控浏览器打开）登录页 https://www.hicustom.com/merchant  → 用户登录
 *   2) 运行本脚本 --grab：连 CDP → Network.getAllCookies → 过滤 hicustom.com 域 → 组 Cookie 头
 *   3) 写入 scripts/.env 的 HICUSTOM_MERCHANT_COOKIE
 *   4) 用商家运费试算接口活体校验（通了=成功，否则提示需重新登录）
 *
 * 说明：CDP 端口默认 19012（openclaw 浏览器）；可通过 --port 覆盖。脚本自动从 /json 发现 hicustom 目标页。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : dflt; }
const PORT = +arg('port', 19012);
const HOST = arg('host', '127.0.0.1');
const CDP_BASE = 'http://' + HOST + ':' + PORT;

// 从 CDP /json 列表发现 hicustom.com 的页面 target
function findHicustomTarget(cb) {
  http.get(CDP_BASE + '/json', (res) => {
    let s = ''; res.on('data', (d) => s += d); res.on('end', () => {
      try {
        const list = JSON.parse(s);
        const t = list.find((x) => x.type === 'page' && /hicustom\.com|hicustom/i.test(x.url || ''));
        cb(t || null);
      } catch (e) { cb(null); }
    });
  }).on('error', () => cb(null));
}

function cdpGetAllCookies(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    const send = (method, params) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); } };
    ws.onerror = (e) => { reject(new Error('CDP WS 错误: ' + (e.message || e))); };
    ws.onopen = async () => {
      try { await send('Network.enable', {}); const r = await send('Network.getAllCookies', {}); const cookies = (r.cookies || []); resolve(cookies); }
      catch (e) { reject(e); }
      ws.close();
    };
  });
}

function buildHeader(cookies) {
  const hc = cookies.filter((c) => { const d = (c.domain || '').replace(/^\./, ''); return d === 'hicustom.com' || d === 'www.hicustom.com' || d === '.hicustom.com' || d.endsWith('.hicustom.com'); })
    .filter((c) => !(c.expires > 0 && c.expires * 1000 < Date.now()));
  return hc.map((c) => c.name + '=' + c.value).join('; ');
}

// 用商家运费试算接口活体校验 cookie
function validateCookie(cookie) {
  return new Promise((resolve) => {
    const body = '';
    const req = http.request({ host: 'www.hicustom.com', path: '/merchant/shippingRule/calculateNew', method: 'POST', headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }, timeout: 20000 }, (res) => {
      let s = ''; res.on('data', (d) => s += d); res.on('end', () => resolve({ status: res.statusCode, isLoginPage: /登录|login|验证/i.test(s) }));
    });
    req.on('error', () => resolve({ status: 0, isLoginPage: true }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, isLoginPage: true }); });
    req.end(body);
  });
}

(async () => {
  const t = await new Promise((r) => findHicustomTarget(r));
  if (!t) { console.log('❌ 未找到 hicustom 页面（浏览器控制服务需运行，且已打开 hicustom.com；确认后重试）'); process.exit(1); }
  console.log('检测到 hicustom 页面: ' + (t.url || '').slice(0, 60) + '…');
  const cookies = await cdpGetAllCookies(t.webSocketDebuggerUrl);
  const header = buildHeader(cookies);
  if (!header) { console.log('❌ 未取到 hicustom 域 cookie——可能未登录。请登录后重试。'); process.exit(1); }
  const envFile = path.join(__dirname, '..', '..', 'scripts', '.env');
  let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const lines = content.split(/\r?\n/); const out = []; let replaced = false;
  for (const l of lines) { if (/^\s*HICUSTOM_MERCHANT_COOKIE\s*=/.test(l)) { if (!replaced) { out.push('HICUSTOM_MERCHANT_COOKIE=' + header); replaced = true; } } else out.push(l); }
  if (!replaced) out.push('HICUSTOM_MERCHANT_COOKIE=' + header);
  fs.writeFileSync(envFile, out.join('\n'), 'utf8');
  console.log('✅ 已写入 scripts/.env 的 HICUSTOM_MERCHANT_COOKIE（' + header.length + ' 字符，未打印值）');
  const v = await validateCookie(header);
  if (v.status === 200 && !v.isLoginPage) console.log('✅ 活体验证通过：cookie 有效，运费试算可访问。');
  else console.log('⚠️ 校验返回 status=' + v.status + (v.isLoginPage ? '（可能仍处于登录/验证页，请检查登录态）' : ''));
})().catch((e) => { console.log('❌ ' + e.message); process.exit(1); });
