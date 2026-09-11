'use strict';
/**
 * DesignAlignCommand — design:align
 * 让「图案 + 叠字」在商品上的位置/大小与空白商品占位文字一致（标定 → 量目标 → 本地扫描 → 出图 → 可选线上复核）。
 *
 * 用法：
 *   node scripts/hi.js design:align --product-id 12659 --image input/x.jpg --text "Custom Pajama Set"
 *   node scripts/hi.js design:align --product-id 12659 --calibrate          # 强制重新标定（2 次上传）
 *   node scripts/hi.js design:align --product-id 12659 --sweep              # 只做本地参数扫描
 *   node scripts/hi.js design:align --product-id 12659 --image x.jpg --verify   # 出图并线上复核（1 次上传）
 * 缓存：<stateDir>/align/<产品id>-v<面>.json（标定 + 目标 + 参数 + 修正系数）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../../tools/node_modules/sharp');

class DesignAlignCommand {
  constructor(app) {
    this.app = app;
    this.signature = 'design:align';
    this.description = '叠字/图案排版对齐(标定+本地mockup迭代+出图, 可选线上复核)';
    this.usage = '--product-id <id> [--face 1] [--image 素材] [--text "文案"] [--faces main|all] [--no-plain] [--color #RRGGBB] [--line-colors "c1,c2"] [--line-scales "1,0.5"] [--font bold|modern|elegant|script|comic] [--mode wrap|box] [--calibrate] [--sweep] [--verify] [--iterate N] [--no-iterate] [--retarget] [--pick-main]';
  }

  async handle(opts) {
    const svc = this.app.make('designAlign');
    const config = this.app.make('config');
    const id = opts.productId;
    const face = opts.face || 1;
    if (!id) { console.log('需要 --product-id <空白产品id>'); return; }
    const log = (m) => console.log(m);

    console.log('========== design:align ==========');
    console.log('产品 ' + id + ' 面 ' + face);

    // ① 标定
    let c = svc.load(id, face);
    if (!c || opts.calibrate) {
      console.log('① 标定中（2 次上传 + 2 次预览，一次性成本）…');
      c = await svc.calibrate({ productTypeId: id, viewId: face, force: !!opts.calibrate, log: log });
    } else { console.log('① 标定缓存命中（残差 ' + (c.maxResidual || 0).toFixed(2) + 'px）'); }

    // ② 目标
    if (opts.retarget || !c.target) { console.log('② 量目标…'); c = await svc.measureTarget({ productTypeId: id, viewId: face, pickMain: !!opts.pickMain, log: log }); }
    else console.log('② 目标缓存命中 宽' + c.target.norm.w.toFixed(3) + ' 高' + c.target.norm.h.toFixed(3));

    const text = opts.text || 'YOUR DESIGN HERE';
    const isMulti = String(text).split(/\s*\|\s*|\r?\n/).filter((s) => s.trim()).length >= 2;

    // ③ 参数：多行自定义文案 → 按占位目标框布局（跳过 wrap/box 扫描；IoU 对自定义文案无意义）
    if (isMulti) {
      console.log('③ 多行文案：按占位目标框布局（跳过参数扫描）');
      c.params = svc.boxParams(c); svc.save(c);
    } else if (opts.sweep || opts.retarget || !c.params || (opts.mode && c.params.mode !== opts.mode)) {
      console.log('③ 本地扫描参数（零成本）…');
      c = await svc.sweep({ productTypeId: id, viewId: face, image: opts.image, text: text, mode: opts.mode || 'auto', log: log });
    } else console.log('③ 参数缓存: mode=' + (c.params.mode || 'wrap') + ' ' + JSON.stringify(c.params));

    const outDir = path.resolve(opts.out || path.join(config.outputDir, String(id), 'align'));
    fs.mkdirSync(outDir, { recursive: true });

    // ④ 出图（含多面策略：默认「只主面加字 + 另出一张无字版」）
    const facesMode = (opts.faces === 'all') ? 'all' : 'main';
    let built = null, plainFile = null;

    const doBuild = async (label) => {
      console.log('④ 出图' + (label ? '（' + label + '）' : '') + '（素材 ' + path.basename(String(opts.image)) + '，文案 "' + text + '"，多面策略: ' + (facesMode === 'all' ? '全部面都加字' : '只主面加字') + '）…');
      built = await svc.buildDesign({
        productTypeId: id, viewId: face, image: opts.image, text: text,
        color: opts.color, widthRatio: opts.widthRatio, rowGap: opts.rowGap, nudgeUp: opts.nudgeUp,
        lineColors: opts.lineColors, lineScales: opts.lineScales, font: opts.font,
        outFile: path.join(outDir, 'design.jpg'), log: log,
      });
      const mock = await svc.mockup({ productTypeId: id, viewId: face, designFile: built.file, outFile: path.join(outDir, 'mockup.jpg') });
      console.log('  设计图(带字) → ' + built.file + '   色 ' + (built.colors ? built.colors.join('/') : built.color) + '   字号 ' + built.fontSize.join('/'));
      console.log('  本地效果图   → ' + mock.outFile + '  (贴 ' + mock.painted + ' px)');
      // 多面策略：其余面用「无字版」= 同一个 cover 适配画布（不叠字）
      if (facesMode === 'main' && !opts.noPlain) {
        plainFile = path.join(outDir, 'design-plain.jpg');
        fs.copyFileSync(built.canvas, plainFile);
        console.log('  设计图(无字) → ' + plainFile + '   ← 给其余面用（避免"裤腿上也有字"）');
      }
    };

    const doCompare = async () => {
      const panels = [path.join(svc.dir, 'blank-' + id + '-v' + face + '.jpg'), built.file, path.join(outDir, 'mockup.jpg')];
      if (opts.verify) panels.push(path.join(svc.dir, 'verify-real-' + id + '-v' + face + '.jpg'));
      const W = 620, Hh = 620, comps = [];
      for (let i = 0; i < panels.length; i++) {
        if (!fs.existsSync(panels[i])) continue;
        const img = await sharp(panels[i]).resize(W, Hh, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
        comps.push({ input: img, left: i * (W + 10), top: 0 });
      }
      if (comps.length) {
        const cmp = path.join(outDir, 'compare.jpg');
        await sharp({ create: { width: comps.length * (W + 10), height: Hh, channels: 3, background: '#DDDDDD' } }).composite(comps).jpeg({ quality: 90 }).toFile(cmp);
        console.log('\n对比图（左→右: 空白 / 设计图 / 本地mockup' + (opts.verify ? ' / 真实渲染' : '') + '）→ ' + cmp);
      }
    };

    if (opts.image) await doBuild();
    else console.log('④ 未指定 --image，跳过出图（仅标定/量目标/扫描）。');

    // ⑤ 线上复核 + ★D 迭代收敛：correction 回写后 → 重扫参数 → 重出图 → 再复核（每轮 +1 上传）
    if (opts.verify) {
      if (!built) { console.log('⑤ --verify 需要 --image（先用素材出图）'); return; }
      if (isMulti) {
        console.log('⑤ 线上复核（1 次上传 + 1 次预览）…');
        const mm = await svc.verify({ productTypeId: id, viewId: face, designFile: built.file, log: log });
        console.log('  真实渲染 → ' + mm.realFile + '\n  ' + mm.url);
        console.log('  （自定义多行文案：IoU 不适用，跳过达标判定与迭代）');
      } else {
      const maxIter = opts.noIterate ? 0 : (opts.iterate != null ? Math.max(0, Number(opts.iterate)) : 1);
      const realFile = path.join(svc.dir, 'verify-real-' + id + '-v' + face + '.jpg');
      let it = 0, v, curParams = c.params;
      let best = { iou: -1, params: null, realBuf: null };       // ★保最优：迭代不改善则回滚
      for (;;) {
        console.log('⑤ 线上复核（1 次上传 + 1 次预览）' + (it ? ' · 第 ' + it + ' 轮迭代' : '') + '…');
        v = await svc.verify({ productTypeId: id, viewId: face, designFile: built.file, log: log });
        console.log('  真实渲染 IoU = ' + v.iou.toFixed(3) + (v.iou >= 0.9 ? '  ✅ 达标(≥0.9)' : '  ⚠️ 未达标'));
        console.log('  真实渲染 → ' + v.realFile + '\n  ' + v.url);
        if (v.iou > best.iou) best = { iou: v.iou, params: curParams, realBuf: fs.existsSync(realFile) ? fs.readFileSync(realFile) : null };
        if (it >= maxIter || v.iou >= 0.9 || !v.correctionChanged) break;
        it++;
        console.log('  ↻ 迭代 ' + it + '：correction 已更新，重扫参数 → 重出图…');
        c = await svc.sweep({ productTypeId: id, viewId: face, image: opts.image, text: text, mode: opts.mode || 'auto', log: log });
        curParams = c.params;
        await doBuild('迭代 ' + it);
      }
      if (it > 0) {
        if (best.params && JSON.stringify(best.params) !== JSON.stringify(c.params)) {
          console.log('  ↺ 迭代未优于最优（最优 IoU=' + best.iou.toFixed(3) + '，末轮更低）→ 回滚到最优参数');
          c.params = best.params; svc.save(c);
          await doBuild('回滚');
          if (best.realBuf) fs.writeFileSync(realFile, best.realBuf);
        }
        console.log('  （本次共迭代 ' + it + ' 轮，保留最优真实 IoU=' + best.iou.toFixed(3) + '）');
      }
      }   // ← end else（非多行文案）
    }

    // 对比图 + 下一步真合成命令
    if (built) {
      await doCompare();
      const designImg = path.join(outDir, 'design.jpg');
      const spec = (facesMode === 'main' && plainFile)
        ? '"' + designImg + ':' + face + ',' + plainFile + ':all"'
        : '"' + designImg + ':all"';
      console.log('\n下一步（真合成入库）:\n  node scripts/hi.js listing:generate --product-id ' + id + ' --images ' + spec);
      if (facesMode === 'main' && plainFile) console.log('  ↑ 面' + face + ' 用带字版，其余面自动用无字版');
    }
  }
}

module.exports = { DesignAlignCommand };
