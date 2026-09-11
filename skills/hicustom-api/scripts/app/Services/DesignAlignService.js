'use strict';
/**
 * DesignAlignService — 「叠字 / 图案排版对齐」闭环（标定 → 量目标 → 本地评估 → 出图 → 线上复核）。
 *
 * 背景：客户图要适配空白产品印刷区，字加上去的位置/大小应与「空白商品占位文字」基本一致。
 * 过去只能走 workflow 真合成去"碰运气"，且每次都在上游多一条记录。
 * 本服务用「一次标定 + 本地 mockup」把迭代成本降到 0，只在定稿复核时才用 1 次线上预览。
 *
 * 两种排版模式：
 *   - wrap：逐词堆叠、每词铺满块宽（等宽排版，如睡衣的 YOUR/DESIGN/HERE）
 *   - box ：整块贴合目标框（非等宽排版，如包/袋的占位文字）
 *   sweep 默认 'auto'：两种都评估，取 IoU 更高的。
 *
 * 缓存（每产品 × 每面一条）：<stateDir>/align/<productId>-v<view>.json
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const Engine = require('../Support/MockupEngine');
const imageTool = require('../../tools/image');
const textParser = require('./TextStampService');
const { stamp } = textParser;
const { pickDistinctColors } = require('../Support/ContrastColor');

// 标定标记：两遍 3×3（每遍 9 个不同颜色；颜色在同一渲染里唯一 → 无需按顺序配对）
// 两遍错开 fy，合计 18 点，覆盖 fy 0.15 ~ 0.78（包类全面板；睡衣类被领口分裂的点会被稳健拟合剔除）
const CALIB_COLORS = [
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 200, 255],
  [255, 0, 255], [255, 128, 0], [128, 0, 255], [0, 160, 160],
];
const CALIB_FX = [0.25, 0.5, 0.75];
function calibGrid(fys) {
  const out = [];
  fys.forEach((fy) => CALIB_FX.forEach((fx) => {
    const i = out.length;                                   // ★ 按序号分配颜色（每遍 9 个唯一色，不能按列）
    out.push({ fx: fx, fy: fy, rgb: CALIB_COLORS[i % CALIB_COLORS.length], name: 'p' + i });
  }));
  return out;
}
const CALIB_PASSES = [calibGrid([0.15, 0.4, 0.65]), calibGrid([0.28, 0.53, 0.78])];
const CHEST_MARKERS = CALIB_PASSES[0];   // 兼容旧引用
const DEFAULT_CORRECTION = { sx: 0.915, sy: 1.034 };

/** 商品"内容"bbox（非近白像素）——用于比对两张图（营销图 vs 渲染图）的取景/缩放 */
function contentBbox(data, iw, ih, ch, thr = 245) {
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, n = 0;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y * iw + x) * ch;
    if (Math.min(data[i], data[i + 1], data[i + 2]) >= thr) continue;
    n++;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return n > 100 ? { x0: minx, x1: maxx, y0: miny, y1: maxy, n: n } : null;
}

class DesignAlignService {
  constructor(app) {
    this.app = app;
    const config = app.make('config');
    this.config = config;
    this.dir = path.join(path.dirname(config.tokenCachePath), 'align');
    fs.mkdirSync(this.dir, { recursive: true });
  }
  _file(productTypeId, viewId) { return path.join(this.dir, productTypeId + '-v' + viewId + '.json'); }
  load(productTypeId, viewId) { const f = this._file(productTypeId, viewId); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }
  save(c) { fs.writeFileSync(this._file(c.productTypeId, c.viewId), JSON.stringify(c, null, 2), 'utf8'); return c; }

  /** ① 标定（每产品×每面一次；消耗 2 次上传 + 2 次预览） */
  async calibrate({ productTypeId, viewId = 1, force = false, log = () => {} }) {
    const cached = this.load(productTypeId, viewId);
    if (cached && !force) { log('已有标定缓存: ' + this._file(productTypeId, viewId)); return cached; }
    const product = this.app.make('product'), gallery = this.app.make('gallery'), design = this.app.make('design');
    const r = await product.detail(productTypeId);
    if (!r || r.code !== 200) throw new Error('抓详情失败 HTTP ' + (r && r.status));
    const pd = r.data.product_description || {};
    const face = (pd.print_areas || []).find((f) => String(f.id) === String(viewId)) || (pd.print_areas || [])[0];
    if (!face) throw new Error('该产品无印刷区数据');
    const W = face.width, Hh = face.height;

    const sq = Math.round(Math.min(W, Hh) * 0.04);
    const markerSvg = (marks) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Hh + '"><rect width="' + W + '" height="' + Hh + '" fill="#FFFFFF"/>' +
      marks.map((m) => '<rect x="' + Math.round(W * m.fx - sq / 2) + '" y="' + Math.round(Hh * m.fy - sq / 2) + '" width="' + sq + '" height="' + sq + '" fill="rgb(' + m.rgb.join(',') + ')"/>').join('') + '</svg>';
    const solidSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Hh + '"><rect width="' + W + '" height="' + Hh + '" fill="#FF00FF"/></svg>';

    const mk = async (name, svg) => {
      const f = path.join(this.dir, name + '.jpg');
      await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(f);
      const up = await gallery.upload({ image: f, cn_name: 'CALIB-' + productTypeId, en_name: 'CALIB-' + productTypeId });
      if (!up || up.code !== 200 || !up.data) throw new Error('标定图上传失败: ' + JSON.stringify(up).slice(0, 160));
      const pr = await design.preview({ productTypeId: productTypeId, defaultViewId: Number(viewId), imageWidth: 1600, cfgs: [{ view_id: Number(viewId), gallery_code: up.data.code, width: W, height: Hh, top_x: 0, top_y: 0 }] });
      if (!pr || pr.code !== 200) throw new Error('预览失败: ' + (pr && pr.msg));
      const u = pr.data.colors[0].renderings[0].big_img || pr.data.colors[0].renderings[0].small_img;
      const out = path.join(this.dir, name + '-render.jpg');
      fs.writeFileSync(out, Buffer.from(await (await fetch(u)).arrayBuffer()));
      log('  标定渲染 ' + name + ' -> ' + path.basename(out) + '  (图库码 ' + up.data.code + ')');
      return { file: out, code: up.data.code, url: u };
    };

    // 两遍定位图（各 9 点）
    const pairsAll = [];
    const codes = [];
    let A = null;
    for (let pi = 0; pi < CALIB_PASSES.length; pi++) {
      const marks = CALIB_PASSES[pi];
      const pass = await mk('calibA' + pi + '-' + productTypeId + '-v' + viewId, markerSvg(marks));
      codes.push(pass.code);
      if (pi === 0) A = pass;
      const ps = await Engine.detectMarkers(pass.file, marks);
      log('  第' + (pi + 1) + '遍标记检出 ' + ps.length + '/' + marks.length);
      ps.forEach((p) => pairsAll.push(p));
    }
    const B = await mk('calibB-' + productTypeId + '-v' + viewId, solidSvg);
    const baseFile = path.join(this.dir, 'base-' + productTypeId + '-v' + viewId + '.png');
    const maskFile = path.join(this.dir, 'mask-' + productTypeId + '-v' + viewId + '.png');
    const bm = await Engine.buildBaseAndMask({ renderA: A.file, renderB: B.file, outBase: baseFile, outMask: maskFile });
    log('  遮罩覆盖 ' + (bm.coverage * 100).toFixed(2) + '%');

    if (pairsAll.length < 4) throw new Error('标记检出不足（' + pairsAll.length + '/18），请检查设计是否已渲染或标记被遮挡');
    const dst = pairsAll.map((p) => [W * p.fx, Hh * p.fy]);
    const src = pairsAll.map((p) => [p.px, p.py]);
    const rb = Engine.robustHomography(dst, src);          // 稳健拟合：自动剔除离群点
    const H = rb.H;
    const maxr = rb.maxInlier;
    log('  标记 ' + rb.inliers.length + '/' + pairsAll.length + ' 参与拟合（剔除离群 ' + rb.outliers.length + '），最大残差 ' + maxr.toFixed(2) + 'px (' + (maxr / bm.imageSize[0] * 100).toFixed(2) + '%)');

    try {
      const pc = this.app.make('pendingCleanup');
      pc.add(codes.concat([B.code]).map((c) => ({ code: c, note: 'calib ' + productTypeId + ' v' + viewId })));
    } catch (e) { /* 记录失败不影响标定 */ }
    return this.save({
      productTypeId: productTypeId, viewId: Number(viewId), renderA: A.file, renderB: B.file,
      printArea: { width: W, height: Hh }, imageSize: bm.imageSize, H, baseFile, maskFile,
      coverage: bm.coverage, maxResidual: maxr, markers: rb.inliers.length, outliers: rb.outliers.length,
      target: null, params: null, correction: Object.assign({}, DEFAULT_CORRECTION),
      uploads: codes.concat([B.code]), updatedAt: new Date().toISOString(),
    });
  }

  /** ② 量目标：空白营销图上占位文字（蓝色）的标题块 → 印刷区坐标 */
  async measureTarget({ productTypeId, viewId = 1, log = () => {} }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    const product = this.app.make('product');
    const r = await product.detail(productTypeId);
    const d = r.data || {};
    const rinfo = ((d.renderings_info || [])[0] || {}).renderings || [];
    const url = rinfo[0] || '';
    if (!url) throw new Error('该产品无主图 renderings');
    const blankF = path.join(this.dir, 'blank-' + productTypeId + '-v' + viewId + '.jpg');
    fs.writeFileSync(blankF, Buffer.from(await (await fetch(url)).arrayBuffer()));
    const img = await sharp(blankF).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const dd = img.data, iw = img.info.width, ih = img.info.height, ch = img.info.channels;
    const rowCnt = new Int32Array(ih), rowMinX = new Int32Array(ih).fill(1e9), rowMaxX = new Int32Array(ih).fill(-1);
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const i = (y * iw + x) * ch, rr = dd[i], gg = dd[i + 1], bb = dd[i + 2];
      if (!(bb - rr > 45 && bb > 95 && rr < 140 && gg < 150)) continue;
      rowCnt[y]++; if (x < rowMinX[y]) rowMinX[y] = x; if (x > rowMaxX[y]) rowMaxX[y] = x;
    }
    const bands = [];
    for (let y = 0; y < ih; y++) {
      if (rowCnt[y] < 2) continue;
      const last = bands[bands.length - 1];
      if (last && y - last.maxy <= 3) { last.maxy = y; last.n += rowCnt[y]; last.minx = Math.min(last.minx, rowMinX[y]); last.maxx = Math.max(last.maxx, rowMaxX[y]); }
      else bands.push({ miny: y, maxy: y, n: rowCnt[y], minx: rowMinX[y], maxx: rowMaxX[y] });
    }
    if (bands.length < 2) throw new Error('未能在空白主图上量到占位文字（bands=' + bands.length + '）');
    const title = bands.slice(0, 3);
    const bbox = { x0: Math.min.apply(null, title.map((b) => b.minx)), x1: Math.max.apply(null, title.map((b) => b.maxx)), y0: title[0].miny, y1: title[title.length - 1].maxy };

    // 取景归一化：营销图 与 渲染图 的取景/缩放可能不同 → 先用"商品内容 bbox"对齐
    let norm = { sx: 1, sy: 1, ox: 0, oy: 0, applied: false };
    if (c.renderB && fs.existsSync(c.renderB)) {
      const b2 = await sharp(c.renderB).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const bb2 = contentBbox(b2.data, b2.info.width, b2.info.height, b2.info.channels);
      const bb1 = contentBbox(dd, iw, ih, ch);
      if (bb1 && bb2) {
        const sx = (bb2.x1 - bb2.x0 + 1) / (bb1.x1 - bb1.x0 + 1);
        const sy = (bb2.y1 - bb2.y0 + 1) / (bb1.y1 - bb1.y0 + 1);
        if (Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02) {
          norm = { sx: sx, sy: sy, ox: bb2.x0 - bb1.x0 * sx, oy: bb2.y0 - bb1.y0 * sy, applied: true };
          log('  取景归一化: x' + sx.toFixed(3) + ' / x' + sy.toFixed(3) + '（营销图与渲染图取景不同，已对齐）');
        }
      }
    }
    const SCALE = c.imageSize[0] / iw;
    const Hinv = Engine.invert(c.H);
    const toRender = (mx, my) => norm.applied ? [mx * norm.sx + norm.ox, my * norm.sy + norm.oy] : [mx * SCALE, my * SCALE];
    const q0 = toRender(bbox.x0, bbox.y0), q1 = toRender(bbox.x1, bbox.y1);
    const p0 = Engine.apply(Hinv, q0[0], q0[1]);
    const p1 = Engine.apply(Hinv, q1[0], q1[1]);
    const PA = c.printArea;
    c.target = {
      bboxPrint: { x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] },
      norm: { w: (p1[0] - p0[0]) / PA.width, h: (p1[1] - p0[1]) / PA.height, cx: (p0[0] + p1[0]) / 2 / PA.width, cy: (p0[1] + p1[1]) / 2 / PA.height },
      lines: title.length, framing: norm,
      bands: bands.map((b) => ({ miny: b.miny, maxy: b.maxy, minx: b.minx, maxx: b.maxx })),
    };
    log('  目标(归一化): 宽 ' + c.target.norm.w.toFixed(3) + ' 高 ' + c.target.norm.h.toFixed(3) + ' 中心(' + c.target.norm.cx.toFixed(3) + ',' + c.target.norm.cy.toFixed(3) + ') 行数 ' + title.length);
    return this.save(c);
  }

  _targetBboxInMockup(c, scaleX = 1, scaleY = 1) {
    const tb = c.target.bboxPrint;
    const corners = [[tb.x0, tb.y0], [tb.x1, tb.y0], [tb.x1, tb.y1], [tb.x0, tb.y1]].map((cc) => Engine.apply(c.H, cc[0], cc[1]));
    const minx = Math.min.apply(null, corners.map((p) => p[0])), maxx = Math.max.apply(null, corners.map((p) => p[0]));
    const miny = Math.min.apply(null, corners.map((p) => p[1])), maxy = Math.max.apply(null, corners.map((p) => p[1]));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, hw = (maxx - minx) / 2 * scaleX, hh = (maxy - miny) / 2 * scaleY;
    return { minx: Math.round(cx - hw), maxx: Math.round(cx + hw), miny: Math.round(cy - hh), maxy: Math.round(cy + hh) };
  }

  /** box 模式参数：直接由目标框导出（无需网格搜索） */
  boxParams(c) {
    const t = c.target.norm;
    return {
      mode: 'box', w: Math.round(t.w * 1000) / 1000, h: Math.round(t.h * 1000) / 1000,
      n: Math.round((t.cy - 0.5) * 1000) / 1000, x: Math.round((t.cx - 0.5) * 1000) / 1000, g: 0.12,
    };
  }

  /** 单个候选参数的本地评估（红字 + 半尺寸快渲）→ { iou, bbox, target, params } */
  /** 预处理：解码 base/mask 一次 + 建各分辨率白底画布（供 evalCandidate 复用） */
  async prepare({ productTypeId, viewId = 1, q = 0.5 }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    const PA = c.printArea;
    const pre = {
      base: await sharp(c.baseFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      mask: await sharp(c.maskFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    };
    const SW = Math.max(120, Math.round(PA.width * q)), SH = Math.max(120, Math.round(PA.height * q));
    const canvas = path.join(this.dir, 'canvas-sweep-' + productTypeId + '-v' + viewId + '-q' + String(q).replace('.', '') + '.jpg');
    if (!fs.existsSync(canvas)) await sharp({ create: { width: SW, height: SH, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 92 }).toFile(canvas);
    return { c: c, pre: pre, canvas: canvas, q: q, SW: SW, SH: SH, metrics: textParser.makeMeasureCache() };
  }

  async evalCandidate({ productTypeId, viewId = 1, text = 'YOUR DESIGN HERE', color = '#FF0000', params, q = 0.5, session, fast = true, log = () => {} }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    const corr = c.correction || DEFAULT_CORRECTION;
    const PA = c.printArea, SC = q;
    const tgtFull = this._targetBboxInMockup(c, corr.sx, corr.sy);   // 全分辨率 mockup 坐标
    const tgt = tgtFull;
    if (fast) {
      // 快速路径：只算布局 bbox（dryRun），再经 H 映射 → 完全不做图像运算
      const r = await stamp(session && session.canvas ? session.canvas : path.join(this.dir, 'canvas-sweep-' + productTypeId + '-v' + viewId + '.jpg'), {
        lines: [{ text: text, color: color, font: 'bold', weight: 800, posV: 'middle', size: params.mode === 'box' ? 'box' : 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
        block: params.mode === 'box'
          ? { widthRatio: params.w, heightRatio: params.h, vAlign: 'middle', nudgeUp: params.n, nudgeX: params.x || 0, rowGap: params.g }
          : { widthRatio: params.w, heightRatio: 0.95, vAlign: 'middle', nudgeUp: params.n, rowGap: params.g },
        dryRun: true, W: session ? session.SW : undefined, H: session ? session.SH : undefined,
        metrics: session ? session.metrics : undefined,
      });
      const kx = PA.width / r.W, ky = PA.height / r.H;
      const cs = [[r.bbox.minx, r.bbox.miny], [r.bbox.maxx, r.bbox.miny], [r.bbox.maxx, r.bbox.maxy], [r.bbox.minx, r.bbox.maxy]]
        .map((p) => Engine.apply(c.H, p[0] * kx, p[1] * ky));
      const bbox = {
        minx: Math.round(Math.min.apply(null, cs.map((p) => p[0]))), maxx: Math.round(Math.max.apply(null, cs.map((p) => p[0]))),
        miny: Math.round(Math.min.apply(null, cs.map((p) => p[1]))), maxy: Math.round(Math.max.apply(null, cs.map((p) => p[1]))),
      };
      return { iou: Engine.iou(bbox, tgt), bbox: bbox, target: tgt, params: params, mode: 'fast' };
    }
    const SW = Math.max(120, Math.round(PA.width * q)), SH = Math.max(120, Math.round(PA.height * q));
    const canvas = (session && session.canvas) || path.join(this.dir, 'canvas-sweep-' + productTypeId + '-v' + viewId + '-q' + String(q).replace('.', '') + '.jpg');
    if (!fs.existsSync(canvas)) await sharp({ create: { width: SW, height: SH, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 92 }).toFile(canvas);
    const isBox = params.mode === 'box';
    // 设计图：只回 buffer（不落盘）
    const res = await stamp(canvas, {
      lines: [{ text: text, color: color, font: 'bold', weight: 800, posV: 'middle', size: isBox ? 'box' : 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
      block: isBox
        ? { widthRatio: params.w, heightRatio: params.h, vAlign: 'middle', nudgeUp: params.n, nudgeX: params.x || 0, rowGap: params.g }
        : { widthRatio: params.w, heightRatio: 0.95, vAlign: 'middle', nudgeUp: params.n, rowGap: params.g },
      background: { enabled: false }, bufferOnly: true, format: 'jpeg', quality: 88,
    });
    const mock = await Engine.renderMockup({
      H: c.H, printArea: PA, baseFile: c.baseFile, maskFile: c.maskFile,
      designBuffer: res.buffer, bufferOnly: true, scale: SC, pre: session ? session.pre : undefined,
    });
    const o0 = Engine.measureBboxRaw(mock.buffer, mock.info.width, mock.info.height, mock.info.channels, (r, g, b) => r > 190 && g < 70 && b < 70, Math.max(6, Math.round(12 * SC / 0.5)));
    const o = o0 ? { minx: Math.round(o0.minx / SC), maxx: Math.round(o0.maxx / SC), miny: Math.round(o0.miny / SC), maxy: Math.round(o0.maxy / SC), n: o0.n } : null;
    return { iou: o ? Engine.iou(o, tgt) : 0, bbox: o, target: tgt, params: params, mode: 'render' };
  }

  /** 生成设计图（素材 cover 适配 + 按参数叠字） */
  async buildDesign({ productTypeId, viewId = 1, image, text = 'YOUR DESIGN HERE', color, widthRatio, rowGap, nudgeUp, outFile, log = () => {} }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    const PA = c.printArea;
    const p = c.params || {};
    const isBox = (p.mode === 'box') && widthRatio == null && rowGap == null && nudgeUp == null;
    const wr = widthRatio != null ? Number(widthRatio) : (p.w != null ? p.w : 0.288);
    const rg = rowGap != null ? Number(rowGap) : (p.g != null ? p.g : 0.52);
    const nu = nudgeUp != null ? Number(nudgeUp) : (p.n != null ? p.n : -0.044);
    const canvas = path.join(this.dir, 'canvas-' + productTypeId + '-v' + viewId + '.jpg');
    const buf = await imageTool.fitImage({ input: image, targetW: PA.width, targetH: PA.height, fit: 'cover', quality: 94 });
    imageTool.save(buf, canvas);
    let col = color;
    if (!col) { try { const cc = await pickDistinctColors(canvas, 1, {}); col = (cc.colors && cc.colors[0]) || '#FFFFFF'; } catch (e) { col = '#FFFFFF'; } }
    const out = outFile || path.join(this.dir, 'design-' + productTypeId + '-v' + viewId + '.jpg');
    const res = await stamp(canvas, {
      lines: [{ text: text, color: col, font: 'bold', weight: 800, posV: 'middle', size: isBox ? 'box' : 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0.035 } }],
      block: isBox
        ? { widthRatio: p.w, heightRatio: p.h, vAlign: 'middle', nudgeUp: p.n, nudgeX: p.x || 0, rowGap: p.g }
        : { widthRatio: wr, heightRatio: 0.95, vAlign: 'middle', nudgeUp: nu, rowGap: rg },
      background: { enabled: false }, outFile: out, format: 'jpeg', quality: 94,
    });
    c.lastParams = { mode: isBox ? 'box' : 'wrap', w: wr, g: rg, n: nu, x: p.x || 0, text: text };
    this.save(c);
    return { file: out, canvas, color: col, mode: isBox ? 'box' : 'wrap', params: c.lastParams, fontSize: res.lines.map((l) => l.fontSize) };
  }

  /** 本地渲染 mockup */
  async mockup({ productTypeId, viewId = 1, designFile, outFile }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    return Engine.renderMockup({ H: c.H, printArea: c.printArea, baseFile: c.baseFile, maskFile: c.maskFile, designFile: designFile, outFile: outFile });
  }

  /** ③ 本地扫描：wrap 用网格搜索；box 直接由目标导出；mode='auto' 取更优。全本地、零成本。 */
  async sweep({ productTypeId, viewId = 1, image, text = 'YOUR DESIGN HERE', color = '#FF0000', mode = 'auto', log = () => {} }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    if (!c.target) throw new Error('请先 measureTarget');
    let bestParams = null, bestIou = -1;

    if (mode !== 'box') {
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const wrSeed = clamp(c.target.norm.w, 0.12, 0.9);
      const nuSeed = clamp(c.target.norm.cy - 0.5, -0.45, 0.45);
      const WR = [wrSeed * 0.85, wrSeed, wrSeed * 1.15].map((v) => Math.round(v * 1000) / 1000);
      const NU = [nuSeed - 0.08, nuSeed, nuSeed + 0.08].map((v) => Math.round(v * 1000) / 1000);
      const RG = [0.1, 0.5, 0.9];
      log('  wrap 扫描域: WR ' + WR.join('/') + '  NU ' + NU.join('/'));
      const sess = await this.prepare({ productTypeId: productTypeId, viewId: viewId, q: 0.5 });
      const evFast = (w, g, n) => this.evalCandidate({ productTypeId: productTypeId, viewId: viewId, text: text, color: color, params: { mode: 'wrap', w: w, g: g, n: n, x: 0 }, session: sess, fast: true });
      const coarse = [];
      for (const w of WR) for (const g of RG) for (const n of NU) coarse.push(await evFast(w, g, n));
      coarse.sort((a, b) => b.iou - a.iou);
      let bw = coarse[0].params.w, bg = coarse[0].params.g, bn = coarse[0].params.n, bi = coarse[0].iou;
      // 坐标下降（步长逐轮收缩）——纯布局计算，极快
      const steps = { w: 0.03, g: 0.15, n: 0.04 };
      let nEval = coarse.length;
      for (let round = 0; round < 3; round++) {
        for (const k of ['w', 'g', 'n']) {
          for (const d of [-1, 1]) {
            let w = bw, g = bg, n = bn;
            if (k === 'w') w = Math.round((bw + d * steps.w) * 1000) / 1000;
            if (k === 'g') g = Math.max(0.05, Math.round((bg + d * steps.g) * 100) / 100);
            if (k === 'n') n = Math.round((bn + d * steps.n) * 1000) / 1000;
            const r = await evFast(w, g, n); nEval++;
            if (r.iou > bi) { bi = r.iou; bw = w; bg = g; bn = n; }
          }
        }
        steps.w *= 0.6; steps.g *= 0.6; steps.n *= 0.6;
      }
      bestParams = { mode: 'wrap', w: bw, g: bg, n: bn, x: 0 }; bestIou = bi;
      const conf = await this.evalCandidate({ productTypeId: productTypeId, viewId: viewId, text: text, color: color, params: bestParams, session: sess, fast: false });
      log('  wrap 最优: w=' + bw + ' rowGap=' + bg + ' nudgeUp=' + bn + '  IoU(布局)=' + bi.toFixed(3) + '  IoU(实渲)=' + conf.iou.toFixed(3) + '  (共 ' + nEval + ' 次评估)');
      bestIou = conf.iou;
    }

    if (mode !== 'wrap') {
      const bp = this.boxParams(c);
      const sessB = await this.prepare({ productTypeId: productTypeId, viewId: viewId, q: 0.5 });
      const r = await this.evalCandidate({ productTypeId: productTypeId, viewId: viewId, text: text, color: color, params: bp, q: 0.5, session: sessB, log: log });
      log('  box  评估: w=' + bp.w + ' h=' + bp.h + ' nudgeUp=' + bp.n + ' nudgeX=' + bp.x + '  IoU(等效目标)=' + r.iou.toFixed(3));
      if (mode === 'box' || r.iou > bestIou) { bestParams = bp; bestIou = r.iou; }
    }

    log('  → 采用模式: ' + bestParams.mode + '  IoU=' + bestIou.toFixed(3));
    c.params = bestParams;
    c.sweepIou = bestIou;
    return this.save(c);
  }

  /** ④ 线上复核：真实渲染 → 量红字 → 与目标比 IoU；并按实测更新 correction */
  async verify({ productTypeId, viewId = 1, designFile, log = () => {} }) {
    const c = this.load(productTypeId, viewId);
    if (!c) throw new Error('请先 calibrate');
    designFile = designFile || path.join(this.dir, 'design-' + productTypeId + '-v' + viewId + '.jpg');
    if (!fs.existsSync(designFile)) throw new Error('请先 buildDesign（未找到 ' + designFile + '）');
    const gallery = this.app.make('gallery'), design = this.app.make('design');
    const lp = c.lastParams || c.params || { mode: 'wrap', w: 0.288, g: 0.52, n: -0.044, x: 0 };
    // 复核用「纯白底 + 红字」孪生图：只验几何，避免素材本身的红色像素污染测量
    const canvas = path.join(this.dir, 'verify-white-' + productTypeId + '-v' + viewId + '.jpg');
    if (!fs.existsSync(canvas)) {
      await sharp({ create: { width: c.printArea.width, height: c.printArea.height, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 92 }).toFile(canvas);
    }
    {
      const twin = path.join(this.dir, 'verify-twin-' + productTypeId + '-v' + viewId + '.jpg');
      const isBox = lp.mode === 'box';
      await stamp(canvas, {
        lines: [{ text: lp.text || 'YOUR DESIGN HERE', color: '#FF0000', font: 'bold', weight: 800, posV: 'middle', size: isBox ? 'box' : 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
        block: isBox
          ? { widthRatio: lp.w, heightRatio: lp.h, vAlign: 'middle', nudgeUp: lp.n, nudgeX: lp.x || 0, rowGap: lp.g }
          : { widthRatio: lp.w, heightRatio: 0.95, vAlign: 'middle', nudgeUp: lp.n, rowGap: lp.g },
        background: { enabled: false }, outFile: twin, format: 'jpeg', quality: 94,
      });
      designFile = twin;
    }
    const up = await gallery.upload({ image: designFile, cn_name: 'ALIGN-' + productTypeId, en_name: 'ALIGN-' + productTypeId });
    if (!up || up.code !== 200 || !up.data) throw new Error('上传失败');
    const pr = await design.preview({ productTypeId: productTypeId, defaultViewId: Number(viewId), imageWidth: 1600, cfgs: [{ view_id: Number(viewId), gallery_code: up.data.code, width: c.printArea.width, height: c.printArea.height, top_x: 0, top_y: 0 }] });
    const u = pr.data.colors[0].renderings[0].big_img || pr.data.colors[0].renderings[0].small_img;
    const realF = path.join(this.dir, 'verify-real-' + productTypeId + '-v' + viewId + '.jpg');
    fs.writeFileSync(realF, Buffer.from(await (await fetch(u)).arrayBuffer()));
    const ours = await Engine.measureBbox(realF, (r, g, b) => r > 190 && g < 70 && b < 70, 50);
    const tgt = this._targetBboxInMockup(c, 1, 1);
    // 本地也渲染同一张白底孪生图 → 得到可比的本地 bbox
    const mockF = path.join(this.dir, 'verify-mock-' + productTypeId + '-v' + viewId + '.jpg');
    await Engine.renderMockup({ H: c.H, printArea: c.printArea, baseFile: c.baseFile, maskFile: c.maskFile, designFile: designFile, outFile: mockF });
    const mockBox = await Engine.measureBbox(mockF, (r, g, b) => r > 190 && g < 70 && b < 70, 50);
    const result = {
      productTypeId: productTypeId, viewId: Number(viewId), code: up.data.code, url: u, realFile: realF,
      iou: ours ? Engine.iou(ours, tgt) : 0, ours: ours, target: tgt, mockup: mockBox,
    };
    if (mockBox && ours) {
      const sx = (ours.maxx - ours.minx + 1) / (mockBox.maxx - mockBox.minx + 1);
      const sy = (ours.maxy - ours.miny + 1) / (mockBox.maxy - mockBox.miny + 1);
      c.correction = { sx: sx, sy: sy };
      log('  correction 更新为 x' + sx.toFixed(3) + ' / x' + sy.toFixed(3));
    }
    try { this.app.make('pendingCleanup').add([{ code: up.data.code, note: 'verify ' + productTypeId + ' v' + viewId }]); } catch (e) { /* ignore */ }
    c.verify = { mode: (lp.mode || 'wrap'), iou: result.iou, code: up.data.code, at: new Date().toISOString() };
    c.uploads = (c.uploads || []).concat([up.data.code]);
    this.save(c);
    return result;
  }
}

module.exports = { DesignAlignService, CHEST_MARKERS };
