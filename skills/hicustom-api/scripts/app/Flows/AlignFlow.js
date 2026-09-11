'use strict';
/**
 * AlignFlow — 「贴字对齐」编排（design:align 的流程壳；命令/网页共用）。
 * ★ 贴字首选方案（优于 design-area）。
 * 步骤：标定 → 量占位目标 → 定参数(多行=按占位框；单行=本地扫描) → 出图 → (可选)线上复核。
 *
 * 档1「优雅降级」：本流程只适用于**正面平铺 / 平面印刷区 / 占位文字可量**的商品。
 * 对曲面、强遮挡、视角异常、占位单行等**不适用**的品：**不报红色错误**，而是返回 `skipped:true + reason`（页面显示“跳过·不适用”）。
 */
const fs = require('fs');
const path = require('path');

const STEPS = ['标定', '量占位目标', '定参数', '出图', '(可选)线上复核'];

function noop() { }

/** 把「不适用」类报错翻译成人话；返回 null 表示是真的错误（应抛出） */
function classifyAlignError(msg) {
  const m = String(msg || '');
  if (/量到占位文字|bands=/.test(m)) return '占位文字不可量（单行/被遮挡/主图非正面平铺）';
  if (/标记检出不足|标记检出|标定退化|homograph/i.test(m)) return '标定失败（曲面/强遮挡/视角异常，有效标记不足）';
  if (/该产品无印刷区|无印刷区数据|无主图/.test(m)) return '该产品缺少印刷区或主图';
  return null;
}

/** 输入可为物理路径 / 相对路径 / URL（/edited/…、/input/…、/patterns/…、/<id>/…）→ 物理文件 */
function resolveInput(src, config) {
  const s = String(src || '');
  try { if (s && fs.existsSync(s) && fs.statSync(s).isFile()) return s; } catch (e) { /* ignore */ }
  let rel = s.replace(/^\/+/, '').split('?')[0];
  try { rel = decodeURIComponent(rel); } catch (e) { /* 用原样 */ }
  const SKILL = path.join(__dirname, '..', '..', '..');
  for (const b of [SKILL, config.outputDir, config.inputDir, config.editedDir, path.join(SKILL, 'patterns')]) {
    if (!b) continue;
    const f = path.join(b, rel);
    try { if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; } catch (e) { /* ignore */ }
  }
  return s;
}

class AlignFlow {
  constructor(app) { this.app = app; }

  async run(params = {}) {
    const log = typeof params.log === 'function' ? params.log : noop;
    try {
      return await this._run(params);
    } catch (e) {
      const reason = classifyAlignError(e && e.message);
      if (reason) {                                    // 档1：不适用 → 跳过，不报错
        log('⚠️ 不适用（跳过）：' + reason);
        return { productId: params.productId, face: Number(params.face || 1), skipped: true, reason: reason, detail: String(e && e.message || '') };
      }
      throw e;                                           // 真错误照抛
    }
  }

  async _run(params = {}) {
    const app = this.app;
    const config = app.make('config');
    const svc = app.make('designAlign');
    const onStep0 = typeof params.onStep === 'function' ? params.onStep : noop;
    const log = typeof params.log === 'function' ? params.log : noop;
    let cur = '';
    const onStep = (name, status) => { cur = name; onStep0(name, status); };
    const productId = params.productId;
    if (!productId) throw new Error('缺少 productId');
    const view = Number(params.face || params.viewId || 1);
    const text = params.text || 'YOUR DESIGN HERE';
    const pattern = params.pattern ? resolveInput(params.pattern, config) : '';
    if (!pattern || !fs.existsSync(pattern)) throw new Error('缺少或找不到图案：' + (params.pattern || '(空)'));

    try {
      // ① 标定（每产品×每面一次；复用缓存）
      onStep('标定', 'running');
      let c = svc.load(productId, view);
      if (!c) { log('① 标定中（一次性：2~3 次上传 + 预览）…'); c = await svc.calibrate({ productTypeId: productId, viewId: view, log: log }); }
      else log('① 标定缓存命中（残差 ' + (c.maxResidual || 0).toFixed(2) + 'px）');
      onStep('标定', 'done');

      // ② 量占位目标
      onStep('量占位目标', 'running');
      if (!c.target) { log('② 量占位目标…'); c = await svc.measureTarget({ productTypeId: productId, viewId: view, log: log }); }
      else log('② 目标缓存命中 宽' + c.target.norm.w.toFixed(3) + ' 高' + c.target.norm.h.toFixed(3));
      onStep('量占位目标', 'done');

      // ③ 定参数：多行文案按占位框布局；单行做本地扫描
      onStep('定参数', 'running');
      const isMulti = String(text).split(/\s*\|\s*|\r?\n/).filter((s) => s.trim()).length >= 2;
      if (isMulti) { c.params = svc.boxParams(c); svc.save(c); log('③ 多行文案 → 按占位目标框布局'); }
      else { log('③ 本地扫描参数（零成本）…'); c = await svc.sweep({ productTypeId: productId, viewId: view, image: pattern, text: text, mode: params.mode || 'auto', log: log }); }
      onStep('定参数', 'done');

      // ④ 出图（design + mockup + 无字版）
      onStep('出图', 'running');
      const outDir = path.join(config.outputDir, String(productId), 'align');
      fs.mkdirSync(outDir, { recursive: true });
      const built = await svc.buildDesign({
        productTypeId: productId, viewId: view, image: pattern, text: text, color: params.color,
        lineColors: params.lineColors, lineScales: params.lineScales, font: params.font, lineFonts: params.lineFonts,
        outFile: path.join(outDir, 'design.jpg'), log: log,
      });
      await svc.mockup({ productTypeId: productId, viewId: view, designFile: built.file, outFile: path.join(outDir, 'mockup.jpg') });
      const plain = path.join(outDir, 'design-plain.jpg');
      try { fs.copyFileSync(built.canvas, plain); } catch (e) { /* ignore */ }
      log('④ 出图 → design.jpg / mockup.jpg / design-plain.jpg   字号 ' + (built.fontSize || []).join('/') + '   色 ' + (built.colors || []).join('/'));
      onStep('出图', 'done');

      // ⑤ 线上复核（可选）
      let verifyResult = null;
      if (params.verify) {
        onStep('(可选)线上复核', 'running');
        log('⑤ 线上复核（1 次上传 + 1 次预览）…');
        try { verifyResult = await svc.verify({ productTypeId: productId, viewId: view, designFile: built.file, log: log }); log('  真实渲染 → ' + verifyResult.realFile); }
        catch (e) { log('  ⚠️ 复核失败: ' + e.message); }
        onStep('(可选)线上复核', 'done');
      }

      const base = '/' + productId + '/align/';
      return {
        productId: productId, face: view, mode: built.mode,
        design: base + 'design.jpg', mockup: base + 'mockup.jpg', plain: base + 'design-plain.jpg',
        colors: built.colors || [built.color], fonts: built.font, fontSize: built.fontSize,
        verifyIou: verifyResult ? verifyResult.iou : null,
        next: 'listing:generate --product-id ' + productId + ' --images "' + base + 'design.jpg:' + view + ',' + base + 'design-plain.jpg:all"',
      };
    } catch (e) {
      if (cur) onStep0(cur, 'done');                       // 避免卡在 running
      throw e;
    }
  }
}

module.exports = { AlignFlow, STEPS, classifyAlignError };
