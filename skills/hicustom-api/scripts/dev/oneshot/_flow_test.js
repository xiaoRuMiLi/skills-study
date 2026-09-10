const B = 'http://127.0.0.1:8098';
(async () => {
  // 找 12666 的一张成品
  const e = await (await fetch(B + '/api/edited/list?id=12666')).json();
  const img = e.items && e.items[0] && e.items[0].url;
  console.log('edited 成品:', e.items.map(x => x.name).join(' , '), '| 用:', img);
  if (!img) return;

  // 入队 dry-run
  const r = await (await fetch(B + '/api/flow/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'workflow', params: { productId: '12666', images: img, fit: 'cover', dryRun: true } }) })).json();
  console.log('enqueue:', JSON.stringify(r));

  // 轮询
  for (let i = 0; i < 60; i++) {
    const j = await (await fetch(B + '/api/flow/list?flow=workflow')).json();
    const job = (j.jobs || []).find(x => x.id === r.jobId);
    if (job) {
      const steps = (job.steps || []).map(s => s.name + ':' + s.status).join(' | ');
      if (i % 3 === 0) console.log('  ...', job.status, steps);
      if (job.status === 'done' || job.status === 'error') {
        console.log('FINAL status=', job.status);
        console.log('steps=', steps);
        console.log('result=', JSON.stringify(job.result));
        console.log('log尾=', (job.log || []).slice(-4).join(' || '));
        break;
      }
    } else console.log('  ... 未找到任务');
    await new Promise(r => setTimeout(r, 1500));
  }
})().catch(e => console.log('ERR', e.message));
