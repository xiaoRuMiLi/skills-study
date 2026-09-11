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
    this.usage = '--product-id <id> [--face 1] [--image 素材] [--text "文案"] [--faces main|all] [--no-plain] [--color #RRGGBB] [--calibrate] [--sweep] [--verify]';
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
    if (opts.retarget || !c.target) { console.log('② 量目标…'); c = await svc.measureTarget({ productTypeId: id, viewId: face, log: log }); }
    else console.log('② 目标缓存命中 宽' + c.target.norm.w.toFixed(3) + ' 高' + c.target.norm.h.toFixed(3));

    // ③ 参数（本地扫描）
    if (opts.sweep || !c.params) {
      console.log('③ 本地扫描参数（零成本）…');
      c = await svc.sweep({ productTypeId: id, viewId: face, image: opts.image, text: opts.text || 'YOUR DESIGN HERE', mode: opts.mode || 'auto', log: log });
    } else console.log('③ 参数缓存: mode=' + (c.params.mode || 'wrap') + ' ' + JSON.stringify(c.params));

    const outDir = path.resolve(opts.out || path.join(config.outputDir, String(id), 'align'));
    fs.mkdirSync(outDir, { recursive: true });

    // ④ 出图（含多面策略：默认「只主面加字 + 另出一张无字版」）
    const facesMode = (opts.faces === 'all') ? 'all' : 'main';
    let built = null, plainFile = null;
    if (opts.image) {
      console.log('④ 出图（素材 ' + path.basename(String(opts.image)) + '，文案 "' + (opts.text || 'YOUR DESIGN HERE') + '"，多面策略: ' + (facesMode === 'all' ? '全部面都加字' : '只主面加字') + '）…');
      built = await svc.buildDesign({
        productTypeId: id, viewId: face, image: opts.image, text: opts.text || 'YOUR DESIGN HERE',
        color: opts.color, widthRatio: opts.widthRatio, rowGap: opts.rowGap, nudgeUp: opts.nudgeUp,
        outFile: path.join(outDir, 'design.jpg'), log: log,
      });
      const mock = await svc.mockup({ productTypeId: id, viewId: face, designFile: built.file, outFile: path.join(outDir, 'mockup.jpg') });
      console.log('  设计图(带字) → ' + built.file + '   色 ' + built.color + '   字号 ' + built.fontSize.join('/'));
      console.log('  本地效果图   → ' + mock.outFile + '  (贴 ' + mock.painted + ' px)');
      // 多面策略：其余面用「无字版」= 同一个 cover 适配画布（不叠字）
      if (facesMode === 'main' && !opts.noPlain) {
        plainFile = path.join(outDir, 'design-plain.jpg');
        require('fs').copyFileSync(built.canvas, plainFile);
        console.log('  设计图(无字) → ' + plainFile + '   ← 给其余面用（避免"裤腿上也有字"）');
      }
    } else {
      console.log('④ 未指定 --image，跳过出图（仅标定/量目标/扫描）。');
    }

    // ⑤ 线上复核
    if (opts.verify) {
      if (!built) { console.log('⑤ --verify 需要 --image（先用素材出图）'); return; }
      console.log('⑤ 线上复核（1 次上传 + 1 次预览）…');
      const v = await svc.verify({ productTypeId: id, viewId: face, designFile: built.file, log: log });
      console.log('  真实渲染 IoU = ' + v.iou.toFixed(3) + (v.iou >= 0.9 ? '  ✅ 达标(≥0.9)' : '  ⚠️ 未达标'));
      console.log('  真实渲染 → ' + v.realFile + '\n  ' + v.url);
    }

    // 产出对比图（空白 / 设计图 / 本地mockup / [真实]）
    if (built) {
      const panels = [
        path.join(svc.dir, 'blank-' + id + '-v' + face + '.jpg'),
        built.file,
        path.join(outDir, 'mockup.jpg'),
      ];
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
      // 多面策略 → 下一步真合成命令（带字图给主面，无字图给其余面）
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
