'use strict';
/**
 * FlowRunner — 进程内「异步流程队列」（串行：1 个在跑，其余排队）。
 * 状态存 JobStore（output/jobs/*.json），页面轮询 /api/flow/list 看多任务。
 * 启动时：把残留的 queued/running 标为「已中断」（服务重启导致）。
 * 支持：enqueue(flow, params) / cancel(id) / list()。
 */
const { JobStore } = require('./JobStore');

class FlowRunner {
  constructor(app) {
    this.app = app;
    this.store = new JobStore(app.make('config'));
    this.queue = [];
    this.running = false;
    this._recover();
  }

  _recover() {
    try {
      for (const j of this.store.list()) {
        if (j.status === 'queued' || j.status === 'running') {
          this.store.update(j.id, { status: 'error', result: { err: '服务重启，任务已中断' } });
          this.store.log(j.id, '服务重启 → 标记为「已中断」');
        }
      }
    } catch (e) { /* ignore */ }
  }

  enqueue(flow, params) {
    const id = (flow || 'flow') + '_' + ((params && params.productId) || '') + '_' + Date.now();
    this.store.create(id, flow, params || {});
    this.store.log(id, '已入队（排队中）');
    this.queue.push(id);
    this._pump();
    return id;
  }

  cancel(id) {
    const job = this.store.get(id);
    if (!job) return { ok: false, err: '任务不存在' };
    if (job.status !== 'queued') return { ok: false, err: '只能取消「排队中」的任务（当前：' + job.status + '）' };
    const i = this.queue.indexOf(id);
    if (i >= 0) this.queue.splice(i, 1);
    this.store.update(id, { status: 'error', result: { err: '已取消' } });
    this.store.log(id, '任务已取消');
    return { ok: true };
  }

  list() {
    return this.store.list().sort((a, b) => String(b.t0 || '').localeCompare(String(a.t0 || '')));
  }

  /** 清理任务（默认删 done/error）。{ flow?, statuses? } */
  clear({ flow, statuses } = {}) {
    const sts = Array.isArray(statuses) && statuses.length ? statuses : ['done', 'error'];
    let removed = 0;
    for (const j of this.store.list()) {
      if (flow && j.flow !== flow) continue;
      if (!sts.includes(j.status)) continue;
      if (this.store.remove(j.id)) removed++;
    }
    return { ok: true, removed };
  }

  async _pump() {
    if (this.running) return;
    const id = this.queue.shift();
    if (!id) return;
    this.running = true;
    this.store.update(id, { status: 'running' });
    try {
      const job = this.store.get(id);
      const params = (job && job.params) || {};
      const FLOWS = { workflow: '../Flows/WorkflowFlow', align: '../Flows/AlignFlow' };
      if (job && FLOWS[job.flow]) {
        const mod = require(FLOWS[job.flow]);
        const Ctor = mod.WorkflowFlow || mod.AlignFlow;
        const flow = new Ctor(this.app);
        const onStep = (name, status) => {
          const j = this.store.get(id) || { steps: [] };
          const steps = j.steps || [];
          const ex = steps.find((s) => s.name === name);
          if (ex) ex.status = status; else steps.push({ name, status });
          this.store.update(id, { steps });
        };
        const result = await flow.run(Object.assign({}, params, { onStep, log: (m) => this.store.log(id, m) }));
        this.store.update(id, { status: 'done', result });
        this.store.log(id, '✅ 完成');
      } else {
        throw new Error('未知流程: ' + (job && job.flow));
      }
    } catch (e) {
      this.store.update(id, { status: 'error', result: { err: e.message } });
      this.store.log(id, '❌ 出错: ' + e.message);
    } finally {
      this.running = false;
      setImmediate(() => this._pump());
    }
  }
}

module.exports = { FlowRunner };
