'use strict';
/**
 * run-trump-design.js — 后台任务：给空白商品 12657 做定制款（特朗普竞选主题 + 彩色艺术字）。
 * 流程：抓详情 → 智谱AI生成爱国/竞选主题底图 → 裁水印 → 叠加彩色渐变艺术字(TRUMP 2024)
 *       → 归档原稿(加文字前+后) → listing:generate 上传+合成 → 输出定制产品码。
 * 运行：node scripts/run-trump-design.js   （建议后台）
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { bootstrap } = require('../../core/bootstrap');
const { app } = bootstrap();
const sharp = require('../../tools/node_modules/sharp');

const PROD_ID = 12657;
const OUT = path.join(__dirname, '..', '..', '..', 'output', String(PROD_ID));
const ROOT = path.resolve(__dirname, '..', '..', '..');

const PROMPT = `生成一张【满幅平铺的印花图案设计稿】，只用来印花到面料/商品上（这不是商品实物照）。请不要画出任何布料、织物、衣服、商品或实体物品，不要 3D、不要场景——整张图就是一层平铺的印花设计。
- 主题：美式复古爱国海报风格（配色：红、白、蓝）。元素：飘动的星条旗波浪、白色五角星、金色雄鹰、飞扬红蓝色块，热烈有力量感，复古做旧质感，装饰性纹样。
- 构图：满幅平铺、可重复、层次丰富，适合作为周边布艺/收纳垫整幅印花底图。
- 要求：图案内绝不能出现任何人物肖像、真人、真实人名、政党标志、政宣文字或受版权保护的标识；不能出现任何文字、字母、水印或 logo；全部为原创通用元素。请在图片最下方留出约 8% 高的纯白色留白边（白边内不要画任何内容）。`;

function cropWatermark(src, dst) {
  return new Promise((resolve, reject) => {
    (async () => {
      const m = await sharp(src).metadata();
      const cw = Math.round(m.width * 0.88), ch = Math.round(m.height * 0.88);
      await sharp(src).extract({ left: 0, top: 0, width: cw, height: ch }).resize(1024, 1024).jpeg({ quality: 95 }).toFile(dst);
      resolve();
    })().catch(reject);
  });
}

// 彩色渐变艺术字叠加（SVG linearGradient，红→白→蓝 + 白色描边）
async function overlayText(inputFile, outFile, mainText, subText) {
  const meta = await sharp(inputFile).metadata();
  const W = meta.width, H = meta.height;
  const fsMain = Math.round(W * 0.15);
  const fsSub = Math.round(fsMain * 0.42);
  const y = Math.round(H * 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#B22234"/><stop offset="0.35" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#3C3B6E"/><stop offset="0.65" stop-color="#FFFFFF"/><stop offset="1" stop-color="#B22234"/>
  </linearGradient></defs>
  <text x="${W / 2}" y="${y}" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="${fsMain}"
    fill="url(#g)" text-anchor="middle" letter-spacing="${Math.round(fsMain * 0.04)}"
    stroke="#1a1a2e" stroke-width="${Math.max(2, Math.round(fsMain * 0.02))}" paint-order="stroke">${mainText}</text>
  <text x="${W / 2}" y="${y + Math.round(fsMain * 0.85)}" font-family="Arial Black, Impact, sans-serif" font-weight="800" font-size="${fsSub}"
    fill="#FFD700" text-anchor="middle" letter-spacing="${Math.round(fsSub * 0.2)}"
    stroke="#1a1a2e" stroke-width="${Math.max(1, Math.round(fsSub * 0.03))}" paint-order="stroke">${subText}</text>
</svg>`;
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(inputFile).composite([{ input: overlay }]).jpeg({ quality: 95 }).toFile(outFile);
}

(async () => {
  console.log('===== 后台任务: 12657 特朗普主题定制 =====');
  fs.mkdirSync(OUT, { recursive: true });
  const product = app.make('product');
  const zhipu = app.make('zhipu');
  const config = app.make('config');

  // ① 抓详情
  const r = await product.detail(PROD_ID);
  if (r.code !== 200) { console.log('❌ 详情失败: ' + r.msg); return; }
  const faces = ((r.data.product_description && r.data.product_description.print_areas) || []);
  const defColor = r.data.default_values && r.data.default_values.color;
  console.log('✅ 详情: ' + (r.data.cn_name || '') + ' | 印刷面 ' + faces.length + ' | 默认颜色 ' + defColor);

  // ② 生成主题底图
  const size = '1024x1024';
  console.log('🤖 智谱生成爱国/竞选主题底图...');
  const img = await zhipu.generateImage({ prompt: PROMPT, size });
  if (!img || !img.url) { console.log('❌ AI 未返回图片'); return; }
  const raw = path.join(ROOT, 'input', 'trump_bg_raw.jpg');
  const bg = path.join(ROOT, 'input', 'trump_bg.jpg');
  fs.writeFileSync(raw, Buffer.from(await (await fetch(img.url)).arrayBuffer()));
  await cropWatermark(raw, bg);
  console.log('✅ 底图(去水印) → input/trump_bg.jpg');

  // ③ 叠加彩色艺术字
  const design = path.join(ROOT, 'input', 'trump_design.jpg');
  await overlayText(bg, design, 'TRUMP 2024', 'MAGA ★ KEEP AMERICA GREAT');
  console.log('✅ 彩色艺术字 → input/trump_design.jpg');

  // ④ 归档原稿：加文字前 + 加文字后
  const arch = path.join(OUT, '原稿');
  fs.mkdirSync(arch, { recursive: true });
  fs.copyFileSync(bg, path.join(arch, 'trump_before.jpg'));
  fs.copyFileSync(design, path.join(arch, 'trump_after.jpg'));
  console.log('🗂️ 原稿已归档: ' + arch + ' (trump_before.jpg / trump_after.jpg)');

  // ⑤ listing:generate 上传+合成（一条龙）
  console.log('🚀 运行 listing:generate（上传图库 + 自动合成）...');
  const cmd = 'node "' + path.join(ROOT, 'scripts', 'hi.js') + '" listing:generate --product-id ' + PROD_ID + ' --images "input/trump_design.jpg"';
  const outBuf = execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  console.log(outBuf);

  console.log('===== 完成 =====');
})().catch((e) => { console.log('❌ ' + e.message); process.exit(1); });
