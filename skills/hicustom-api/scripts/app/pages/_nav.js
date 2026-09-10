/* _nav.js — 通用顶部导航（serve.js 自动注入到「没有 header」的页面）
 * 已有自己 header 的页面会跳过，避免重复。 */
(function () {
  'use strict';
  if (window.__topnav) return;
  window.__topnav = true;
  function run() {
    if (document.querySelector('header')) return;               // 页面自带导航 → 不重复
    if (document.getElementById('topnav')) return;
    var css = '#topnav{position:sticky;top:0;background:#131921;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:16px;z-index:2147483000;font:14px "Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif}'
      + '#topnav b{font-size:15px;font-weight:600}'
      + '#topnav a{color:#cbd5e1;text-decoration:none;font-size:13px}#topnav a:hover{color:#fff}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var n = document.createElement('div'); n.id = 'topnav';
    n.innerHTML = '<b>🦞 HICUSTOM 工作台</b>'
      + '<a href="/">首页</a><a href="/manage.html">管理后台</a>'
      + '<a href="/listing-list.html">Listing 列表</a><a href="/workflow.html">Workflow</a>';
    (document.body || document.documentElement).insertBefore(n, document.body ? document.body.firstChild : null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
