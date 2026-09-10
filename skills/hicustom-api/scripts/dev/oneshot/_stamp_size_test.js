const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8098';
const dir = path.join(__dirname, '..', '..', '..', 'input', '12666');
(async () => {
  const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f) && !/_add_text/.test(f));
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  const src = '/input/12666/' + encodeURIComponent(files[0]);
  for (const sizes of [[200, 40], [40, 200]]) {
    const body = { id: '12666', src, block: { widthRatio: 0.8, heightRatio: 0.95 },
      lines: [ { text: 'BIG', size: sizes[0], color: '#FFE873', font: 'bold', weight: 800, posV: 'top' },
               { text: 'small', size: sizes[1], color: '#9AD8FF', font: 'bold', weight: 800, posV: 'bottom' } ] };
    const j = await (await fetch(B + '/api/stamp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    console.log('输入字号', sizes.join('/'), '=> 实际渲染字号', j.ok ? j.meta.lines.map(x => x.fontSize).join('/') : ('ERR ' + j.err));
  }
})().catch(e => console.log('ERR', e.message));
