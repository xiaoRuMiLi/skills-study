'use strict';
/**
 * JobStore — 异步任务存储（FILE based）。
 * 位置：output/jobs/<jobId>.json（数据）。供 serve 的 /api/* 异步跑流程 + 页面轮询状态。
 */
const fs = require('fs');
const path = require('path');

class JobStore {
  constructor(config) { this.dir = path.join(config.outputDir, 'jobs'); }
  _p(id) { return path.join(this.dir, id + '.json'); }
  create(id, flow, params) {
    const job = { id, flow, params: params || {}, status: 'queued', steps: [], log: [], result: null, t0: new Date().toISOString(), t1: null };
    this.save(job); return job;
  }
  save(job) { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this._p(job.id), JSON.stringify(job, null, 2), 'utf8'); }
  get(id) { try { return JSON.parse(fs.readFileSync(this._p(id), 'utf8')); } catch (e) { return null; } }
  update(id, patch) { const j = this.get(id) || { id }; Object.assign(j, patch); if (patch && (patch.status === 'done' || patch.status === 'error')) j.t1 = j.t1 || new Date().toISOString(); this.save(j); return j; }
  log(id, line) { const j = this.get(id) || { id, log: [] }; j.log = j.log || []; j.log.push('[' + new Date().toLocaleTimeString() + '] ' + line); this.save(j); return j; }
  list() { try { return fs.readdirSync(this.dir).filter((f) => /\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))); } catch (e) { return []; } }
  remove(id) { try { fs.rmSync(this._p(id), { force: true }); return true; } catch (e) { return false; } }
}

module.exports = { JobStore };
