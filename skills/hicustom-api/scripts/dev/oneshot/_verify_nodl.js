const fs = require('fs'), path = require('path');
const B = 'http://127.0.0.1:8098';
const skill = path.join(__dirname, '..', '..', '..');
(async () => {
  const e = await (await fetch(B + '/api/edited/list?id=12666')).json();
  const img = e.items && e.items[0] && e.items[0].url;
  console.log('成品:', img);
  const r = await (await fetch(B + '/api/flow/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'workflow', params: { productId: '12666', images: img, dryRun: false, allColors: false } }) })).json();
  console.log('enqueue:', JSON.stringify(r));
  for (let i = 0; i < 60; i++) {
    const j = await (await fetch(B + '/api/flow/list?flow=workflow')).json();
    const job = (j.jobs || []).find(x => x.id === r.jobId);
    if (job && (job.status === 'done' || job.status === 'error')) {
      console.log('status=', job.status);
      console.log('LOG:\n' + (job.log || []).join('\n'));
      console.log('result=', JSON.stringify(job.result));
      break;
    }
    await new Promise(x => setTimeout(x, 1500));
  }
  const imgDir = path.join(skill, 'output', '12666', 'images');
  console.log('\noutput/12666/images/ 内容:');
  try { fs.readdirSync(imgDir).forEach(f => console.log('  ' + f)); } catch (e2) { console.log('  (无)'); }
})().catch(e => console.log('ERR', e.message));
