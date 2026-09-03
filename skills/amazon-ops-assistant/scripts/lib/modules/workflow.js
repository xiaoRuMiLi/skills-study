'use strict';
// @ts-nocheck
/**
 * workflow — 多步流程编排：委托 spapi-dev-assistant 的 workflow 引擎（ASL 状态机）。
 * 触发：串行、依赖、需人工审批的运营流程。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const WF_SCRIPT = path.join(__dirname, '..', '..', '..', 'spapi-dev-assistant', 'scripts', 'spapi-workflow.js');

module.exports = function createWorkflowModule(ctx) {
  const { format } = ctx;
  const { hr } = format;

  function check() {
    if (!fs.existsSync(WF_SCRIPT)) console.log('未找到 workflow 脚本: ' + WF_SCRIPT + '。请挂载 spapi-dev-assistant。');
  }

  async function help() {
    hr('多步 workflow 编排');
    console.log('委托 spapi-dev-assistant 的 workflow 引擎（ASL 状态机）。');
    console.log('启动 daemon:   node scripts/ops.js workflow daemon');
    console.log('核心流程:      建 workflow -> execute -> tail -> input_state 审批 -> submit_callback -> resume');
    console.log('\n参考: spapi-dev-assistant SKILL.md「多步工作流」与 scripts/spapi-workflow.js。');
  }

  async function daemon() {
    hr('启动 workflow daemon');
    if (!fs.existsSync(WF_SCRIPT)) { console.log('未找到 ' + WF_SCRIPT); return; }
    console.log('以常驻 daemon 运行 workflow server，输入一行一条 JSON 命令。');
    console.log('按 Ctrl+C 退出。\n');
    try {
      const child = spawn(process.execPath, [WF_SCRIPT, '--daemon'], { stdio: 'inherit' });
      child.on('close', (code) => console.log('\n(daemon 退出, code=' + code + ')'));
    } catch (e) { console.error('daemon 启动失败: ' + e.message); }
  }

  return {
    name: 'workflow',
    title: '流程',
    describe: '多步运营流程编排（可审批）',
    commands: {
      help: { usage: '', run: help },
      daemon: { usage: '', run: daemon },
    },
  };
};
