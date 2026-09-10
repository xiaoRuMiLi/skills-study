const B = 'http://127.0.0.1:8098';
const run = () => fetch(B + '/api/flow/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ flow: 'workflow', params: { productId: '12666', images: '/edited/12666/pattern-2026-09-10T12-30-38-287Z.clean.jpg', dryRun: true } }) }).then(r => r.json());
const cancel = (id) => fetch(B + '/api/flow/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).then(r => r.json());
(async () => {
  const a = await run();
  const b = await run();
  const c = await run();
  console.log('enqueued:', a.jobId, b.jobId, c.jobId);
  console.log('cancel c (应排队中→ok):', JSON.stringify(await cancel(c.jobId)));
  console.log('cancel a (可能在跑/已完成):', JSON.stringify(await cancel(a.jobId)));
  await new Promise(r => setTimeout(r, 4000));
  const j = await (await fetch(B + '/api/flow/list?flow=workflow')).json();
  for (const job of j.jobs.slice(0, 4)) console.log('  job', job.id, '->', job.status, (job.result && job.result.err) || '');
})().catch(e => console.log('ERR', e.message));
