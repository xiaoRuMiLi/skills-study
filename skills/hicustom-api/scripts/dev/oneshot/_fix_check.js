const B = 'http://127.0.0.1:8098';
(async () => {
  // 1) 保存成品 → 检查命名后缀
  const src = '/input/12666/pattern-2026-09-10T12-33-15-212Z.fit.jpg';
  const cfg = await (await fetch(B + '/api/stamp/config')).json();
  const r1 = await fetch(B + '/api/stamp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '12666', src, save: true, lines: cfg.config.defaults.lines, block: cfg.config.defaults.block, background: { enabled: false } }) });
  const j1 = await r1.json();
  console.log('save ok=', j1.ok, '| 成品名 =', j1.saved && j1.saved.name, '| url =', j1.saved && j1.saved.url);

  // 2) 用该成品 URL 入队 workflow（dry-run）→ 看是否解析成功
  const url = j1.saved && j1.saved.url;
  const r2 = await (await fetch(B + '/api/flow/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'workflow', params: { productId: '12666', images: url, dryRun: true } }) })).json();
  console.log('enqueue:', JSON.stringify(r2));
  for (let i = 0; i < 40; i++) {
    const j = await (await fetch(B + '/api/flow/list?flow=workflow')).json();
    const job = (j.jobs || []).find(x => x.id === r2.jobId);
    if (job && (job.status === 'done' || job.status === 'error')) {
      console.log('status=', job.status, '| steps=', (job.steps || []).map(s => s.name + ':' + s.status).join(' | '));
      console.log('log=', (job.log || []).join(' || '));
      break;
    }
    await new Promise(r => setTimeout(r, 1200));
  }
})().catch(e => console.log('ERR', e.message));
