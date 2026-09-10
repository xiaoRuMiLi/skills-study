'use strict';
// 只读探测：打印空白商品详情 + 文生图提示词原文 + 尺寸选择（不调用生成）
const { bootstrap } = require('./core/bootstrap');
const { ZhipuService } = require('./app/Services/ZhipuService');

(async () => {
  const app = bootstrap().app;
  const product = app.make('product');
  const id = process.argv[2] || '12101';
  const r = await product.detail(id);
  if (!r || r.status >= 400 || r.code !== 200) {
    console.log('❌ 详情失败: HTTP ' + (r && r.status) + ' code=' + (r && r.code) + ' msg=' + (r && r.msg || ''));
    console.log(JSON.stringify(r && (r.data || r), null, 2));
    return;
  }
  const d = r.data || {};
  console.log('==================== 空白商品信息 (id ' + id + ') ====================');
  console.log('名称: ' + (d.cn_name || '') + ' / ' + (d.en_name || ''));
  console.log('code: ' + (d.code || '') + ' | type: ' + (d.type || ''));
  const pd = d.product_description || {};
  const ds = pd.design_style || {};
  const pm = pd.product_material || {};
  const faces = pd.print_areas || pd.printArea || [];
  console.log('印刷面数: ' + (Array.isArray(faces) ? faces.length : '?'));
  console.log('印刷区: ' + JSON.stringify(faces));
  console.log('— design_style —');
  console.log(JSON.stringify(ds, null, 2));
  console.log('— product_material —');
  console.log(JSON.stringify(pm, null, 2));
  console.log('detail_info_desc: ' + (pd.detail_info_desc || '').slice(0, 200));

  console.log('\n==================== 文生图提示词原文 ====================');
  console.log(ZhipuService.buildImagePrompt(d));

  console.log('\n==================== 尺寸选择 (印刷区宽高比) ====================');
  const gen = Array.isArray(faces) && faces.length ? faces : [{ id: 1, width: 1024, height: 1024 }];
  for (const f of gen) {
    console.log('  面' + (f.id || '?') + ' ' + (f.width || 1024) + 'x' + (f.height || 1024) + ' → ' + ZhipuService.pickSize(f.width || 1024, f.height || 1024));
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
