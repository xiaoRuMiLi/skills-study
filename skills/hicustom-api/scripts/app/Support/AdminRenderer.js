'use strict';
/**
 * AdminRenderer — 生成 output/manage.html（商品列表，前端渲染，含搜索/筛选/分页）。
 * 数据来自 /api/products.json（读 database/products.csv）。
 */
const fs = require('fs');
const path = require('path');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render({ records = [], merchant = {}, htmlDir, title = '产品管理后台', htmlFile = 'index.html' }) {
  const listUrl = merchant.customerProductList || '';
  const editBase = merchant.productEdit || '';

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)}</title>
<style>
body{font-family:"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;background:#f2f3f5;margin:0;padding:24px;color:#0f1111}
.wrap{max-width:1200px;margin:0 auto}
h1{font-size:21px;margin:0 0 4px}
.sub{color:#565959;font-size:13px;margin-bottom:14px}
.toplinks{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.toplinks a{display:inline-block;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:20px;color:#fff}
.toplinks .l{background:#007185}.toplinks .e{background:#e8590c}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;background:#fff;border:1px solid #e3e6e6;border-radius:10px;padding:10px 12px}
.toolbar input,.toolbar select{padding:8px 10px;border:1px solid #c7c7c7;border-radius:6px;font-size:13px}
.toolbar input{flex:1;min-width:220px}
.card{background:#fff;border:1px solid #e3e6e6;border-radius:12px;padding:6px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:10px;border-bottom:1px solid #eee;vertical-align:middle}
th{background:#fafafa;font-size:12px;color:#565959}
td.id{font-weight:700;width:60px}
td.name .sub{font-size:11px;color:#888}
tr.prodrow{cursor:pointer}
tr.prodrow:hover{background:#f7fafa}
.st{font-size:11px;padding:2px 8px;border-radius:10px;background:#eee}
.st-synced{background:#e3f2fd;color:#1976d2}.st-draft{background:#fff3e0;color:#e65100}
.btn{display:inline-block;text-decoration:none;font-size:12px;padding:5px 10px;border-radius:6px;background:#eee;color:#333;margin-right:4px}
.btn:hover{background:#ddd}
.btn.alt{background:#e8590c;color:#fff}.btn.teal{background:#007185;color:#fff}
.actions{white-space:nowrap}
.pager{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:14px;font-size:13px}
.pager button{background:#eee;border:1px solid #ddd;border-radius:6px;padding:6px 12px;cursor:pointer}
.pager button:disabled{opacity:.4;cursor:default}
.pager .info{color:#565959}
.empty{text-align:center;color:#888;padding:28px}
</style></head><body><div class="wrap">
<h1>🗂️ ${esc(title)}</h1>
<div class="sub" id="count">数据源：CSV 类数据库</div>
<div class="toplinks">
  ${listUrl ? `<a class="l" href="${esc(listUrl)}" target="_blank" rel="noopener">📦 我的定制商品列表</a>` : ''}
  ${editBase ? `<a class="e" href="${esc(editBase.replace('{id}', ''))}" target="_blank" rel="noopener">✏️ 商品编辑</a>` : ''}
</div>
<div class="toolbar">
  <input id="q" placeholder="🔍 搜索 ID / 名称 / SPU ..." />
  <select id="st"><option value="all">全部状态</option><option value="synced">已同步(synced)</option><option value="draft">草稿(draft)</option></select>
</div>
<div class="card">
  <table>
    <thead><tr><th>ID</th><th>商品</th><th>最低价</th><th>规格数</th><th>图库码</th><th>合成码</th><th>效果图</th><th>状态</th><th>操作</th></tr></thead>
    <tbody id="tb"></tbody>
  </table>
</div>
<div class="pager">
  <button id="prev">‹ 上一页</button>
  <span class="info" id="pinfo"></span>
  <button id="next">下一页 ›</button>
</div>
</div>
<script>
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let ALL=[], fil={q:'',status:'all',page:1,size:20};
const $ = id => document.getElementById(id);
function filtered(){ let a=ALL; if(fil.status!=='all') a=a.filter(x=>x.status===fil.status); if(fil.q){const q=fil.q.toLowerCase(); a=a.filter(x=>(x.id+' '+x.name+' '+x.spu).toLowerCase().includes(q));} return a; }
function row(x){
  const stc=(x.specs||[]).length;
  return '<tr class="prodrow" data-href="product.html?id='+esc(x.id)+'">'
    +'<td class="id">'+esc(x.id)+'</td>'
    +'<td class="name">'+esc(x.name)+'<div class="sub">'+esc(x.spu)+' · '+esc(x.material)+'</div></td>'
    +'<td>¥'+esc(x.minPrice)+'</td>'
    +'<td>'+stc+'</td>'
    +'<td>'+esc(x.galleryCodes||'—')+'</td>'
    +'<td>'+esc(x.compositeCode||'—')+'</td>'
    +'<td>'+esc(x.effectCount||'—')+'</td>'
    +'<td><span class="st st-'+esc(x.status)+'">'+esc(x.status)+'</span></td>'
    +'<td class="actions"><a class="btn" href="product.html?id='+esc(x.id)+'">详情</a>'
    +'<a class="btn alt" href="https://www.hicustom.com/merchant/productType/edit?type=0&cat_id=&id='+esc(x.id)+'" target="_blank" rel="noopener">编辑</a>'
    +'<a class="btn teal" href="https://www.hicustom.com/merchant/customerProduct/index" target="_blank" rel="noopener">定制列表</a>'
    +'<a class="btn" href="/open?path='+encodeURIComponent(x.id)+'" target="_blank" rel="noopener">📂</a></td></tr>';
}
function render(){
  const arr=filtered(), total=arr.length, pages=Math.max(1,Math.ceil(total/fil.size));
  if(fil.page>pages) fil.page=pages;
  const start=(fil.page-1)*fil.size, items=arr.slice(start,start+fil.size);
  $('tb').innerHTML = items.length ? items.map(row).join('') : '<tr><td colspan="9" class="empty">无匹配商品</td></tr>';
  $('count').textContent='数据源：CSV 类数据库 · 共 '+total+' 个商品'+(fil.status!=='all'?'（'+fil.status+'）':'');
  $('pinfo').textContent='第 '+fil.page+' / '+pages+' 页（共 '+total+' 条）';
  $('prev').disabled=fil.page<=1; $('next').disabled=fil.page>=pages;
  document.querySelectorAll('tr.prodrow').forEach(tr=>tr.addEventListener('click',()=>{const h=tr.getAttribute('data-href'); if(h) location.href=h;}));
}
$('q').addEventListener('input',e=>{fil.q=e.target.value; fil.page=1; render();});
$('st').addEventListener('change',e=>{fil.status=e.target.value; fil.page=1; render();});
$('prev').addEventListener('click',()=>{fil.page--; render();});
$('next').addEventListener('click',()=>{fil.page++; render();});
(async()=>{ try{ const r=await fetch('api/products.json'); const j=await r.json(); ALL=j.products||[]; render(); }catch(e){ $('tb').innerHTML='<tr><td colspan="9" class="empty">加载失败: '+esc(e.message)+'</td></tr>'; } })();
</script></body></html>`;

  if (htmlDir) {
    fs.mkdirSync(htmlDir, { recursive: true });
    const file = path.join(htmlDir, htmlFile);
    fs.writeFileSync(file, html, 'utf8');
    return file;
  }
  return html;
}
module.exports = { render };
