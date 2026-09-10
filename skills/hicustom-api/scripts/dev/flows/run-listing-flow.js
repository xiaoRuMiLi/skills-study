'use strict';
/**
 * run-listing-flow.js — 上架文案流程原型（一次跑通）：按 xlsm 字段 → 关键词 → LLM文案 → 填表 → 检查 → 渲染HTML
 * 目标：12664 男仿真丝睡衣套装 → amazon.co.uk (en_GB / A1F83G8C2ARO7P)
 * 产出（数据）：output/<id>/listing/{keywords.json, record.json, check_report.json, listing_upload.csv}
 * 预览页为通用模板 pages/listing.html?id=<id>（HTML 只放 pages/，output/ 只放数据）
 */
const fs = require('fs');
const path = require('path');
const { bootstrap } = require('../../core/bootstrap');
const { app } = bootstrap();
const sharp = require('../../tools/node_modules/sharp');
const config = app.make('config');
const repo = app.make('productRepo');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PROD_ID = process.argv[2] || '12664';
const MID = 'A1F83G8C2ARO7P'; // amazon.co.uk
const LANG = 'en_GB';
const BRAND = 'Generic'; // 无牌，按用户要求
const OUTDIR = path.join(config.outputDir, PROD_ID, 'listing');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const { readTemplateProductTypes, matchProductType } = require('../../app/Support/TemplateProductTypes');
const { readTemplateStructure } = require('../../app/Support/TemplateFields');
const { buildListingSheet, findDesignedImages } = require('../../app/Support/ListingSheet');

const { ZhipuClient } = require('../../app/Services/ZhipuClient');
let _zc = null;
function zhipu() { if (!_zc) _zc = new ZhipuClient(config); return _zc; }
async function zhipuChat(sys, user) { return zhipu().chat(sys, user); }
async function zhipuVision(url, instruction) { return zhipu().chatVision(url, instruction); }

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  console.log('===== 上架文案流程（12664 → amazon.co.uk）=====');
  const pj = JSON.parse(fs.readFileSync(path.join(config.outputDir, PROD_ID, 'product.json'), 'utf8'));
  const p = pj.profile || {};
  const ident = p.identity || {}, attr = p.attributes || {};
  const enName = ident.enName || '';
  const material = attr.materialEn || attr.materialCn || '';
  const desc = (attr.description || '').replace(/\n+/g, ' ').slice(0, 500);
  const features = (attr.productFeatures || []).map((f) => f.title + ': ' + f.value).join('；');
  const style = (attr.designStyle && attr.designStyle.recommendStyle) || '';
  const sizes = (p.sizes || []).map((s) => s.name).join(', ');
  const colors = (p.colors || []).map((c) => c.enName || c.cnName).join(', ');
  const effImgs = (pj.customization && pj.customization.effectImages) || [];
  const renderImgs = ((p.images && p.images.renderings) || []).flatMap((x) => x.renderings || []);
  const prodImgs = effImgs.concat(renderImgs).filter(Boolean);
  const prodcost = p.pricing && p.pricing.minPrice;
  console.log('🔍 数据源: ' + enName + ' | 材质 ' + material + ' | 尺码 ' + sizes + ' | 颜色 ' + colors);

  // ① 关键词（大模型理解品类 → 核心词 → 亚马逊联想词 → LLM 综合选词；不再用正则机械匹配类目）
  const { KeywordResearch } = require('../../app/Services/KeywordResearch');
  const kr = new KeywordResearch(app.make('zhipuClient'));
  const kwRes = await kr.research({ enName: ident.enName, cnName: ident.cnName, alias: ident.alias, material, size: sizes, color: colors });
  const keywords = kwRes.keywords;
  console.log('🔑 核心词(LLM): ' + (kwRes.coreTerms || []).join(', ') + ' | 关键词 ' + keywords.length + ' 条: ' + keywords.slice(0, 12).join(', '));

  // ② LLM 生成文案（glm-4）——遵循上架规范 + 只用真实属性
  const sys = 'You are an expert Amazon UK/CA listing writer for custom-printed products (POD). Write in British English. RULES (follow strictly):\n'
    + '1) Title <= 70 characters, core keywords at front, no word repeated >3 times (excl. prepositions/conjunctions).\n'
    + '2) 5 bullet points, each <= 400 chars, EACH starts with a DIFFERENT core product keyword/phrase, and each includes material + size + colour, a real usage scenario, plus a "Customized Now" guide to upload image/text/logo. One bullet must cover gift occasions (mention pet lovers / corporate teams if applicable). One bullet must cover an extra/other use. Do NOT start bullets with "-" or "•".\n'
    + '3) generic_keyword <= 250 chars, space-separated (NO commas or symbols), no word repeated >3 times, include buyer-search terms not already in the title.\n'
    + '4) product_description <= 1500 chars, list/bullet style with core info first, paragraphs separated by </br> only (no other HTML), no "•" (use "-"), answer "what the product is + who + which scenario", prefer info NOT repeating the bullets. Include the "Customized Now" guide.\n'
    + '5) Adults only; NEVER mention children/minors. 6) NEVER use: promotion, promotional, environment friendly, brand, branded, advertising, advertised, advertisement, vendors, vendor, any trademark (e.g. Mac), or superlative claims: best, #1, top-rated, number one, best-selling, guaranteed. 7) Brand = "Generic".\n'
    + '8) Use ONLY the provided facts; do NOT invent material, colour, size, or features. Return ONLY JSON: {"item_name":"...","bullet_points":["...","...","...","...","..."],"product_description":"...","generic_keyword":"..."}';
  let facts = 'FACTS FROM PRODUCT DATA (ONLY these are true; never invent others):\n'
    + 'Item: ' + enName + ' (' + ident.cnName + ')\n'
    + 'Material: ' + material + '\n'
    + 'Sizes: ' + sizes + '\n'
    + 'Colour: ' + colors + '\n'
    + 'Full-surface print available (custom).\n'
    + 'Style keywords: ' + style + '\n'
    + 'Source description (Chinese, base facts on it — includes material/features/use/care/size): ' + desc + '\n'
    + 'Product features: ' + features + '\n'
    + 'Consider keywords (from Amazon UK suggestions): ' + keywords.slice(0, 18).join(', ') + '. Embed at least 3 DIFFERENT core product-word expressions based on the ACTUAL product (e.g. for a sleep mask: "sleep mask", "eye mask", "sleeping mask").';
  const hasCustom = !!(pj.customization || ((p.images && p.images.renderings && p.images.renderings.length) || 0) > 0); // 有定制/渲染图即视为定制商品
  // 以 database/product.csv 的 is_custom 为准（官方口径）
  const dbRec = repo.products().find((x) => String(x.id) === String(PROD_ID));
  const isCustom = dbRec ? (String(dbRec.is_custom) === '1' || !!dbRec.compositeCode) : hasCustom;
  if (isCustom) facts += '\nCUSTOM ATTRIBUTES (MUST include in copy): This is a fully customisable product — customer can choose ANY COLOUR and ANY PATTERN/design (full-surface print). Guide them to click "Customized Now" to upload their own image, text, or logo to personalise it.';
  const genUser = 'Write the Amazon UK (amazon.co.uk) listing for the product below, following ALL rules above. Include high-conversion keywords and at least 3 different core product-word expressions. Use ONLY provided facts.\n\n' + facts;
  let gen = {};
  try {
    const raw = await zhipuChat(sys, genUser);
    const m = raw && raw.match(/\{[\s\S]*\}/);
    gen = JSON.parse(m ? m[0] : raw);
  } catch (e) { console.log('⚠️ 解析文案失败', e.message); gen = {}; }
  if (!Array.isArray(gen.bullet_points)) gen.bullet_points = gen.bullet_points ? [String(gen.bullet_points)] : [];
  while (gen.bullet_points.length < 5) gen.bullet_points.push('');

  // —— 保真修正：材质 silk→satin；确保 Customized Now 定制引导；描述 </br> 分段 ——
  if (gen.item_name) gen.item_name = gen.item_name.replace(/\bsilk\b/gi, 'Satin');
  const cta = 'Click "Customized Now" to upload your image, text, or logo';
  if (!gen.bullet_points.some((b) => /customize|Customized now/i.test(b))) {
    const b5 = gen.bullet_points[4] || '';
    gen.bullet_points[4] = (b5 ? b5 + ' ' : '') + cta + ' to get your custom design.';
  }
  if (gen.product_description) {
    let d = gen.product_description.replace(/\bsilk\b/gi, 'satin');
    if (!/<\/br/i.test(d)) d = d.replace(/(\.\s+)(?=[A-Z])/g, '$1</br>');
    if (!/customize|Customized now/i.test(d)) d += '</br>' + cta + '.';
    gen.product_description = d;
  }
  // 定制商品：强制补「可定制任意颜色/图案」属性；非定制：则绝对去掉定制描述
  if (isCustom && !(gen.bullet_points || []).some((b) => /any colour|any color|any pattern|any design|any image/i.test(b))) {
    const b4 = gen.bullet_points[4] || '';
    gen.bullet_points[4] = (b4 ? b4 + ' ' : '') + 'Fully customisable: choose ANY COLOUR and ANY PATTERN/design to make it truly yours.';
  }
  if (!isCustom) {
    const strip = (s) => s && String(s).replace(/Customized Now/gi, '').replace(/upload your (own )?(image|text|logo)[^.]*\./gi, '').replace(/customi[sz](e|ed|ing|able|ation)?/gi, '').replace(/\s{2,}/g, ' ').replace(/^\s*[.,;:-]\s*/, '').trim();
    gen.item_name = gen.item_name ? strip(gen.item_name) : '';
    gen.bullet_points = (gen.bullet_points || []).map(strip);
    if (gen.product_description) gen.product_description = strip(gen.product_description);
  }
  // 清洗最高级/禁词（如 best→ideal, 去掉 #1 等）
  const cleanSuper = (s) => s && String(s).replace(/\b#\s?1\b/gi, '').replace(/\bbest[- ]selling\b/gi, 'popular').replace(/\bbest\b/gi, 'ideal').replace(/\btop[- ]rated\b/gi, 'well-loved').replace(/\bnumber one\b/gi, 'a favourite').replace(/\bguaranteed\b/gi, 'assured').replace(/100\s?%/gi, 'premium').replace(/\s{2,}/g, ' ').trim();
  if (gen.item_name) gen.item_name = cleanSuper(gen.item_name);
  if (Array.isArray(gen.bullet_points)) gen.bullet_points = gen.bullet_points.map(cleanSuper);
  if (gen.product_description) gen.product_description = cleanSuper(gen.product_description);

  // ③ 组装 record（图片 URL = 合成后的「设计效果图」customization.effectImages，绝不能是指纹科技空白商品图）
  //   POD 定制商品的 listing 图必须是设计后的效果图；dry-run 未合成 → 无设计图，标注缺失（不填空白图）
  // Product Type = 模板下拉合法值（只读提取）按商品名自动匹配；匹配不到留空进缺失清单
  const ptRead = readTemplateProductTypes(process.env.LISTING_TEMPLATE_PATH || (config.listing && config.listing.templatePath) || '');
  const productType = matchProductType((ident.enName || '') + ' ' + (ident.cnName || ''), ptRead.options);
  console.log('🏷️ Product Type 下拉合法值(模板只读): [' + ptRead.options.join(', ') + '] → 匹配: ' + (productType || '(未匹配，进缺失清单)'));
  const des = findDesignedImages(config.outputDir, PROD_ID);
  const hasDesignedImg = !!des.main;
  const record = {
    marketplace: MID, language: LANG, product_type: productType, brand: BRAND,
    item_name: gen.item_name || enName, title_differentiation: '',
    bullet_point: gen.bullet_points.slice(0, 5),
    product_description: gen.product_description || desc,
    generic_keyword: (gen.generic_keyword || keywords.slice(0, 15).join(' ')).replace(/[,\uFF0C]/g, ' ').replace(/\s+/g, ' ').trim(),
    material, color: colors, size: sizes, model_number: SPU(), model_name: enName,
    main_image_url: des.main,
    other_image_urls: des.others,
    image_url_source: des.source === 'cdn' ? 'design composite 效果图 (customization.effectImages)' : des.source === 'local' ? '本地设计图 (output/<id>/images 合成效果图)' : '无设计图（需先 design:composite 合成）—— 未用空白商品图',
    source: { keywords: keywords, core_terms: kwRes.coreTerms, keyword_freq: kwRes.freq, keyword_source: kwRes.source },
  };

  // —— 自动补「可填」必填项 + 生成缺失清单 ——
  const var0 = (p.variants || [])[0] || {};
  record.fabric_type = 'Polyester';
  record.country_of_origin = 'CN';
  record.dangerous_goods = 'No';
  record.package = { L: var0.length, W: var0.width, H: var0.height, volume: var0.volume, weight: var0.weight };
  record.fulfillment_channel = 'AMAZON_EU';
  record.quantity = '1';
  record.number_of_boxes = '1';
  const missing = [];
  if (!record.product_type) missing.push({ field: 'Product Type', label: '产品类型码', why: '需选账号有效类目码（Valid Values/后台类目）', action: 'user/account' });
  if (!hasDesignedImg) missing.push({ field: 'Images', label: '设计后图片(main/other)', why: '该商品未合成设计效果图（dry-run），不能用空白商品图；需先 design:composite 生成设计图', action: 'run composite' });
  const missingReport = {
    auto_filled: { fabric_type: record.fabric_type, country_of_origin: record.country_of_origin, dangerous_goods: record.dangerous_goods, package: record.package, fulfillment_channel: record.fulfillment_channel, quantity: record.quantity, number_of_boxes: record.number_of_boxes },
    missing_required: missing,
    note: '其余条件必填（服饰尺码/电池/物流等）多不适用；Item Condition / Fulfillment / Quantity 等账户发货侧字段需账号配置。',
  };
  fs.writeFileSync(path.join(OUTDIR, 'listing_missing.json'), JSON.stringify(missingReport, null, 2), 'utf8');
  console.log('🗂️ 缺失清单: ' + path.join(OUTDIR, 'listing_missing.json') + (missing.length ? '  · 待补: ' + missing.map((m) => m.label).join(', ') : '  · 无必填缺失'));

  // —— 定价（目标站点，默认 UK）——计入 record，便于上架/预览 ——
  try {
    const { PricingService } = require('../../app/Services/PricingService');
    const svc = new PricingService();
    const LIST_COUNTRY = 'UK'; // 本流程为 amazon.co.uk (A1F83G8C2ARO7P)
    const dbP = repo.products().find((x) => String(x.id) === String(PROD_ID));
    const procurement = Number(p.pricing && p.pricing.minPrice) || (dbP && Number(dbP.minPrice)) || 0;
    const shipping = Number((dbP && dbP.specs && dbP.specs[0] && dbP.specs[0].shipping && dbP.specs[0].shipping[LIST_COUNTRY])) || 0;
    // ⚠️ 前置校验：无物流费时价格会被严重低估（如 £3.35）。必须先跑 shipping:backfill 再跑本流程。
    if (!shipping) {
      console.log('⚠️⚠️ 未获取到物流费(运费)！当前会按 0 运费定价，售价' + LIST_COUNTRY + '将严重偏低。');
      console.log('   正确顺序：先执行  node scripts/hi.js shipping:backfill --ids ' + PROD_ID + '  → 再跑本流程。');
      console.log('   （若 HICUSTOM_MERCHANT_COOKIE 失效，请先重新登录指纹商家后台更新 .env 再跑 shipping:backfill）');
    }
    const cp = await svc.computePrice({ country: LIST_COUNTRY, procurement, shipping, force: true });
    record.price = cp.price;
    record.currency = cp.currency;
    record.price_source = cp.source + (cp.date ? ' (' + cp.date + ')' : '');
    record.price_rate = cp.rate;
    record.pricing = { procurement, shipping, baseLocal: cp.baseLocal, denominator: cp.denominator, profitRate: cp.profitRate, platformCost: cp.platformCost };
    console.log('💰 建议售价(' + LIST_COUNTRY + '): ' + record.price + ' ' + record.currency + '  (汇率 ' + cp.rate + ', ' + cp.source + (cp.date ? ' ' + cp.date : '') + ')');
  } catch (e) { console.log('⚠️ 定价失败: ' + e.message); }

  // ④ 新建「上架表格」listing_upload.csv —— 列由模板动态导出（Data Definitions 的 Required/Recommended + 上架必需列），
  //    亚马逊模板 xlsm 只读做字段规范参考，绝不回填。不同类目/模板字段不同，故不写死固定列。
  const tplPath = process.env.LISTING_TEMPLATE_PATH || (config.listing && config.listing.templatePath) || '';
  let tplStructure = { columns: [], productTypes: [] };
  try { tplStructure = readTemplateStructure(tplPath); } catch (e) { console.log('⚠️ 读取模板结构失败: ' + e.message); }
  const sheet = buildListingSheet({ columns: tplStructure.columns }, record, { targetMarket: MID });
  const uploadCols = sheet.columns;
  const uploadRow = sheet.row;
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const uploadCsv = '\uFEFF' + uploadCols.map(csvCell).join(',') + '\r\n' + uploadCols.map((c) => csvCell(uploadRow[c])).join(',') + '\r\n';
  const uploadCsvFile = path.join(OUTDIR, 'listing_upload.csv');
  fs.writeFileSync(uploadCsvFile, uploadCsv, 'utf8');
  fs.writeFileSync(path.join(OUTDIR, 'listing_upload.json'), JSON.stringify(uploadRow, null, 2), 'utf8');
  console.log('📋 文案已生成 | 🧾 上架表格(模板动态导出 ' + uploadCols.length + ' 列): ' + uploadCsvFile + '  (图片URL来源: ' + record.image_url_source + ')');

  // ④ 检查：平台政策（规则） + 图片侵权（glm-4v 主图）
  const issues = [];
  const t = record.item_name || '';
  if (t.length > 200) issues.push('标题超200字符 (' + t.length + ')');
  if (!record.bullet_point.some((b) => b && b.trim().length > 10)) issues.push('三点文案缺失');
  ['#1', '100%', 'best', 'guarantee', 'free shipping', 'satisfaction', 'cheapest'].forEach((w) => { if (new RegExp(w, 'i').test(t + record.product_description + record.bullet_point.join(' '))) issues.push('疑似违规词: ' + w); });
  let imgRisk = '';
  if (record.main_image_url) { try { imgRisk = await zhipuVision(record.main_image_url, '这是商品图。若图中出现真实人物肖像、名人、品牌商标、受版权保护的角色/标识，输出"RISK: <说明>"；否则输出"OK"。'); } catch (e) { imgRisk = '审查失败: ' + e.message; } }
  const copyText = ((gen.item_name || '') + ' ' + (gen.bullet_points || []).join(' ') + ' ' + (gen.product_description || '')).toLowerCase();
  const copyMentionsCustom = /customi[sz]|customized now/i.test(copyText);
  const check = { policy: { passed: issues.length === 0, issues }, image: { main: record.main_image_url, conclusion: imgRisk, passed: !/RISK/i.test(imgRisk) },
    custom_consistency: { is_custom: isCustom ? '1' : '0', copy_mentions_custom: copyMentionsCustom, consistent: (isCustom === copyMentionsCustom), note: isCustom ? '定制商品必须包含定制说明(任意颜色/图案 + Customized Now)' : '非定制商品绝对不能描述为定制' } };

  // ⑤b 主图规范化（纯 sharp，无 AI/费用）：白底、≥1600px、留白居中 → images/main-amazon.jpg
  async function makeAmazonMain(id) {
    const imagesDir = path.join(config.outputDir, String(id), 'images');
    let src = null;
    const walk = (d) => { let items = []; try { items = fs.readdirSync(d); } catch (e) { return; } for (const it of items) { const f = path.join(d, it); try { if (fs.statSync(f).isDirectory()) walk(f); else if (/main-1\.jpg$/i.test(it)) src = f; } catch (e) {} } };
    walk(imagesDir);
    let tmp = null;
    if (!src && record.main_image_url) { tmp = path.join(config.outputDir, '.tmp-main.jpg'); fs.writeFileSync(tmp, Buffer.from(await (await fetch(record.main_image_url)).arrayBuffer())); src = tmp; }
    if (!src) return null;
    const out = path.join(imagesDir, 'main-amazon.jpg');
    try {
      await sharp(src).rotate().flatten({ background: '#ffffff' }).resize(1600, 1600, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 95 }).toFile(out);
      return '/images/main-amazon.jpg';
    } finally { if (tmp) fs.rmSync(tmp, { force: true }); }
  }
  try { const mn = await makeAmazonMain(PROD_ID); if (mn) { record.main_image_normalized = '/' + PROD_ID + '/images/main-amazon.jpg'; console.log('🖼️ 主图已规范化(白底1600 无AI) → ' + record.main_image_normalized); } } catch (e) { console.log('⚠️ 主图规范化失败: ' + e.message); }

  // ⑤ 渲染亚马逊详情页风格 HTML
  const html = renderPDP(record, keywords);
  fs.writeFileSync(path.join(OUTDIR, 'keywords.json'), JSON.stringify({ core_terms: kwRes.coreTerms, source: kwRes.source, keywords, freq: kwRes.freq }, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUTDIR, 'record.json'), JSON.stringify(record, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUTDIR, 'check_report.json'), JSON.stringify(check, null, 2), 'utf8');
  console.log('\n📦 已写入 output\\' + PROD_ID + '\\listing\\  (keywords.json / record.json / check_report.json)');

  // ⑤c 写入 listing 表（database/listing.csv）→ 首页/listing-list.html 可见
  try {
    const { ListingRepository } = require('../../app/Support/ListingRepository');
    const { loadConfig } = require('../../core/Config');
    const repo = new ListingRepository(loadConfig());
    repo.upsert(PROD_ID, {
      cn_name: (pj.profile && pj.profile.identity && pj.profile.identity.cnName) || '',
      title: record.item_name || '',
      image: './' + PROD_ID + '/images/main-amazon.jpg',
      status: (check.policy && check.policy.passed) ? 'ready' : 'draft',
      preview_url: '/listing.html?id=' + PROD_ID,
      notes: record.main_image_normalized || '',
    });
    console.log('🗃️ 已写入 database/listing.csv（Listing 列表可见）');
  } catch (e) { console.log('⚠️ listing 表写入失败: ' + e.message); }

  // ④b 回填「亚马逊原始模板」→ 输出可上传的 .xlsx（必须在 record.json 写入之后，否则用的是旧数据）
  try {
    const py = path.join(__dirname, '..', 'py', 'tmp_fill_xlsm.py');
    const tplFill = process.env.LISTING_TEMPLATE_PATH || (config.listing && config.listing.templatePath) || '';
    const out = require('child_process').execSync('python "' + py + '" ' + PROD_ID + ' "' + tplFill + '"', { encoding: 'utf8', stdio: 'pipe' });
    console.log((out || '').trim().split('\n').map((l) => '  ' + l).join('\n'));
  } catch (e) { console.log('⚠️ 回填原模板失败(需 python+openpyxl): ' + (e.stdout || e.message)); }

  console.log('✅ 完成 | 预览(通用模板): http://127.0.0.1:8098/listing.html?id=' + PROD_ID);
  console.log('   上架表格: output\\' + PROD_ID + '\\listing\\listing_upload.csv  (亚马逊模板 xlsm 仅作字段规范只读参考，不回填)');
  console.log('   检查: policy.passed=' + check.policy.passed + ' | image.passed=' + check.image.passed + ' | 定制一致性=' + check.custom_consistency.consistent + ' (is_custom=' + check.custom_consistency.is_custom + ', copy_mentions_custom=' + check.custom_consistency.copy_mentions_custom + ')');
  if (!check.policy.passed) console.log('   policy issues: ' + check.policy.issues.join('; '));
  console.log('   image: ' + check.image.conclusion);

  function SPU() { return (ident.spuCode || '') + '-' + PROD_ID + '-UK'; }

  function renderPDP(rec, kws) {
    const imgs = [rec.main_image_url].concat(rec.other_image_urls).filter(Boolean);
    const bullets = rec.bullet_point.map((b) => '<li><b class="b">' + esc(b.split(':')[0] || b) + '</b>: ' + esc(b) + '</li>').join('');
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>` + esc(rec.item_name) + `</title><style>
body{font-family:"Amazon Ember",Arial,sans-serif;margin:0;background:#fff;color:#0F1111}
.topbar{background:#131921;color:#fff;padding:12px 24px;font-size:14px}
.wrap{max-width:1300px;margin:0 auto;padding:24px;display:grid;grid-template-columns:1fr 1.2fr;gap:32px}
.gal img{width:100%;max-height:520px;object-fit:contain;background:#fff}
.thumb{border:2px solid transparent;padding:4px;border-radius:8px}
.title h1{font-size:24px;font-weight:400;margin:0 0 6px}
.title .brand{color:#565959;font-size:14px}
.title .price{margin:10px 0;font-size:24px;color:#B12704}
.bullets ul{padding-left:20px;line-height:1.7;font-size:14px}
.desc{grid-column:1/-1;border-top:1px solid #e7e7e7;padding-top:16px}
.kws{grid-column:1/-1;color:#565959;font-size:12px;padding:8px 0;border-top:1px solid #e7e7e7}
.grid2{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.grid2 img{width:100%}
</style></head><body>
<div class="topbar">amazon.co.uk · 上架预览（同步自 listing 表格）</div>
<div class="wrap">
  <div class="gal"><img src="` + esc(imgs[0] || '') + `" alt="main"/><div class="grid2" style="margin-top:8px">` + imgs.slice(1, 5).map((u, i) => `<img class="thumb" src="` + esc(u) + `" alt="img${i + 1}"/>`).join('') + `</div></div>
  <div class="title"><h1>` + esc(rec.item_name) + `</h1>
    <div class="brand">Visit the ` + esc(rec.brand) + ` Store</div>
    <div class="price">£` + (prodcost ? (Number(prodcost) * 0.9).toFixed(2) : '--') + ` (参考)</div>
    <div class="bullets"><h3>About this item</h3><ul>` + bullets + `</ul></div>
    <div><b>材质:</b> ` + esc(rec.material) + ` &nbsp; <b>尺码:</b> ` + esc(rec.size) + ` &nbsp; <b>颜色:</b> ` + esc(rec.color) + `</div>
  </div>
  <div class="desc"><h3>Product description</h3><p>` + esc(rec.product_description).replace(/\n/g, '<br/>') + `</p></div>
  <div class="kws"><b>搜索词:</b> ` + esc(rec.generic_keyword) + `</div>
</div></body></html>`;
  }
})().catch((e) => { console.log('❌ ' + (e && e.stack || e)); process.exit(1); });
