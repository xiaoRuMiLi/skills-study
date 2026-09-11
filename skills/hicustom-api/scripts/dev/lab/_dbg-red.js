'use strict';
const sharp = require('../../tools/node_modules/sharp');
const path = require('path');
(async () => {
  const f = path.join(__dirname, 'out', 'mockup-12659-v1-chest.jpg');
  const raw = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data, iw = raw.info.width, ih = raw.info.height, ch = raw.info.channels;
  const test = (r, g, b) => r > 150 && g < 110 && b < 110;
  const seen = new Uint8Array(iw * ih); const st = []; const cs = [];
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const p = y * iw + x;
    const i = p * ch;
    if (seen[p] || !test(d[i], d[i + 1], d[i + 2])) continue;
    st.length = 0; st.push(p); seen[p] = 1;
    let n = 0, ax = 1e9, bx = -1, ay = 1e9, by = -1, sr = 0, sg = 0, sb = 0;
    while (st.length) {
      const q = st.pop(), qx = q % iw, qy = (q - qx) / iw;
      const qi = q * ch; n++; sr += d[qi]; sg += d[qi + 1]; sb += d[qi + 2];
      if (qx < ax) ax = qx; if (qx > bx) bx = qx; if (qy < ay) ay = qy; if (qy > by) by = qy;
      for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dd[0], ny = qy + dd[1];
        if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const q2 = ny * iw + nx; if (seen[q2]) continue;
        const q2i = q2 * ch; if (!test(d[q2i], d[q2i + 1], d[q2i + 2])) continue;
        seen[q2] = 1; st.push(q2);
      }
    }
    cs.push({ n: n, x: [ax, bx], y: [ay, by], rgb: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] });
  }
  cs.sort((a, b) => b.n - a.n);
  console.log('红色连通域 top10:');
  cs.slice(0, 10).forEach((c) => console.log('  n=' + c.n + ' x[' + c.x + '] y[' + c.y + '] 平均RGB=' + c.rgb.join(',')));
  console.log('总域数', cs.length, '；≥20 像素的域', cs.filter((c) => c.n >= 20).length);
})();
