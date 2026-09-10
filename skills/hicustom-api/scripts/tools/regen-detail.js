'use strict';
/**
 * regen-detail.js — 从已缓存 product.json 重新生成详情页，并按规格(颜色/形状)把效果图下载到子文件夹。
 * 用法：node scripts/tools/regen-detail.js <商品id>
 * 不会重新合成；若 product.json 缺分组，会从定制产品详情接口取回 colors[].renderings 来分组。
 */
const fs = require('fs');
const path = require('path');
const HOST = 'C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api';
const { bootstrap } = require(path.join(HOST, 'scripts/core/bootstrap'));
const { render } = require(path.join(HOST, 'scripts/app/Support/ListingRenderer'));

const sanit = (s) => String(s == null ? '默认' : s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').trim() || '默认';

const id = process.argv[2] || '11243';
const outDir = path.join(HOST, 'output', id);
const imgDir = path.join(outDir, 'images');
const pjPath = path.join(outDir, 'product.json');
const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
const profile = pj.profile, customization = pj.customization || {};

(async () => {
  // 若缺分组数据，从定制产品详情取回
  if ((!customization.effectGroups || !customization.effectGroups.length) && customization.compositeProductCode) {
    try {
      const { app } = bootstrap();
      const design = app.make('design');
      const r = await design.detail(customization.compositeProductCode);
      if (r.code === 200 && r.data) {
        customization.effectGroups = (r.data.colors || []).map((c) => ({ name: c.cn_name || '默认', images: (c.renderings || []).map((rr) => rr.big_img || rr.small_img).filter(Boolean) }));
        customization.effectImages = [].concat(...customization.effectGroups.map((g) => g.images));
        console.log('🔎 已从定制产品详情取回分组: ' + customization.effectGroups.map((g) => g.name + '(' + g.images.length + ')').join(' / '));
      }
    } catch (e) { console.log('取详情分组失败: ' + e.message); }
  }

  fs.mkdirSync(imgDir, { recursive: true });
  customization.effectImageLocal = [];
  customization.effectImageLocalGroups = [];
  const groups = (customization.effectGroups && customization.effectGroups.length) ? customization.effectGroups : [{ name: '默认', images: customization.effectImages || [] }];
  for (const g of groups) {
    const folder = sanit(g.name);
    const gdir = path.join(imgDir, folder);
    fs.mkdirSync(gdir, { recursive: true });
    const gfiles = [];
    for (let i = 0; i < (g.images || []).length; i++) {
      const file = path.join(gdir, 'effect-' + (i + 1) + '.jpg');
      const rel = './images/' + folder + '/effect-' + (i + 1) + '.jpg';
      if (fs.existsSync(file)) { gfiles.push(rel); continue; }
      try {
        const r = await fetch(g.images[i]);
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(file, buf);
        gfiles.push(rel);
      } catch (e) { console.log('  下载失败 ' + g.name + ' ' + (i + 1) + ': ' + e.message); }
    }
    customization.effectImageLocalGroups.push({ name: g.name, dir: './images/' + folder, files: gfiles });
    customization.effectImageLocal = customization.effectImageLocal.concat(gfiles);
    console.log('📁 ' + g.name + ': ' + gfiles.length + ' 张 → images\\' + folder);
  }

  pj.customization = customization;
  fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2), 'utf8');

  const htmlFile = render({ profile, customization, options: { title: profile.identity.cnName + ' — 产品信息', sections: undefined, links: [
    { label: '✏️ 编辑当前空白商品', url: 'https://www.hicustom.com/merchant/productType/edit?type=0&cat_id=&id=' + id, kind: 'product' },
    { label: '📦 我的定制商品列表', url: 'https://www.hicustom.com/merchant/customerProduct/index', kind: 'list' },
  ], dir: id }, htmlDir: outDir });
  console.log('✅ 详情已生成: ' + htmlFile);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
