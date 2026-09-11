'use strict';
const path = require('path');
const sharp = require('../../tools/node_modules/sharp');
const Engine = require('../../app/Support/MockupEngine');
const { stamp } = require('../../app/Services/TextStampService');
const ROOT = path.join(__dirname, '..', '..', '..');
const AL = path.join(ROOT, '.hicustom', 'align');
const t = async (label, fn) => { const t0 = Date.now(); const r = await fn(); console.log('  ' + label + ': ' + (Date.now() - t0) + 'ms'); return r; };

(async () => {
  const c = JSON.parse(require('fs').readFileSync(path.join(AL, '12453-v1.json'), 'utf8'));
  const PA = c.printArea;
  const q = 0.25;
  const SW = Math.round(PA.width * q), SH = Math.round(PA.height * q);
  const canvas = path.join(AL, 'bench-canvas.jpg');
  await sharp({ create: { width: SW, height: SH, channels: 3, background: '#FFFFFF' } }).jpeg({ quality: 95 }).toFile(canvas);
  console.log('canvas ' + SW + 'x' + SH);
  const design = path.join(AL, 'bench-design.jpg');
  const mk = path.join(AL, 'bench-mock.jpg');

  await t('stamp(wrap)', () => stamp(canvas, {
    lines: [{ text: 'Custom Yoga Bag', color: '#FF0000', font: 'bold', weight: 800, posV: 'middle', size: 'wrap', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
    block: { widthRatio: 0.397, heightRatio: 0.95, vAlign: 'middle', nudgeUp: -0.31, rowGap: 0.2 },
    background: { enabled: false }, outFile: design, format: 'jpeg', quality: 88,
  }));
  await t('mockup(0.25)', () => Engine.renderMockup({ H: c.H, printArea: PA, baseFile: c.baseFile, maskFile: c.maskFile, designFile: design, outFile: mk, quality: 82, scale: 0.25 }));
  await t('measure', () => Engine.measureBbox(mk, (r, g, b) => r > 190 && g < 70 && b < 70, 4));
  await t('stamp(box)', () => stamp(canvas, {
    lines: [{ text: 'Custom Yoga Bag', color: '#FF0000', font: 'bold', weight: 800, posV: 'middle', size: 'box', letterSpacing: 0.02, outline: { color: '#000000', width: 0 } }],
    block: { widthRatio: 0.397, heightRatio: 0.295, vAlign: 'middle', nudgeUp: -0.31, nudgeX: -0.057, rowGap: 0.12 },
    background: { enabled: false }, outFile: design, format: 'jpeg', quality: 88,
  }));
})();
