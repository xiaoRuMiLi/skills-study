const fs = require('fs');
const path = require('path');
const B = 'http://127.0.0.1:8098';
const dir = path.join(__dirname, '..', '..', '..', 'input', '12666');
(async () => {
  // 找一张源图
  let src = null;
  try {
    const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f) && !/_add_text/.test(f));
    files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
    src = '/input/12666/' + encodeURIComponent(files[0]);
  } catch (e) { console.log('no input imgs:', e.message); }

  const c = await (await fetch(B + '/api/stamp/config')).json();
  console.log('config.ok=', c.ok, 'presets=', Object.keys(c.config.presets || {}).join(','), 'lines=', (c.config.defaults.lines || []).length, 'fonts=', Object.keys(c.config.fonts || {}).join(','));

  if (!src) { console.log('skip render'); return; }
  console.log('src =', src);

  const r = await fetch(B + '/api/stamp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '12666', src, lines: c.config.defaults.lines, block: c.config.defaults.block, background: { enabled: false } }) });
  const j = await r.json();
  console.log('stamp.ok=', j.ok, 'url=', j.url, 'meta=', j.meta && { W: j.meta.W, H: j.meta.H, dark: j.meta.dark, sizes: j.meta.lines.map(x => x.fontSize) });

  if (j.ok) {
    const pr = await fetch(B + j.url);
    console.log('preview GET', j.url, '->', pr.status, pr.headers.get('content-type'), (await pr.arrayBuffer()).byteLength + 'B');
  }

  const col = await (await fetch(B + '/api/stamp/colors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, n: 2 }) })).json();
  console.log('colors=', col.colors);
})().catch(e => console.log('ERR', e.message));
