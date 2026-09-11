#!/usr/bin/env node
'use strict';
/**
 * ERP 服务起停器 —— 对应 SKILL.md「ERP 服务起停规范」。
 *
 * “ERP” = 本地页服务 serve.js（托管 output/ + app/pages/，默认端口 8098）。
 *
 * 用法：
 *   node scripts/server/erp.js start     # 启动 ERP（= 用户说「启动ERP」）
 *   node scripts/server/erp.js stop      # 停掉 ERP（= 用户说「停掉ERP」）
 *   node scripts/server/erp.js restart
 *   node scripts/server/erp.js status    # 查看运行状态
 *
 * 状态/日志：.hicustom/erp.pid、.hicustom/erp.log
 * 说明：同步/替换项目文件前请先 stop，否则 serve 会锁住 node_modules 下的 lib 等目录。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const SERVER_DIR = __dirname;
const SKILL_ROOT = path.join(SERVER_DIR, '..', '..');
const SERVE_ENTRY = path.join(SERVER_DIR, 'serve.js');
const STATE_DIR = path.join(SKILL_ROOT, '.hicustom');
const PID_FILE = path.join(STATE_DIR, 'erp.pid');
const LOG_FILE = path.join(STATE_DIR, 'erp.log');
const PORT = Number(process.env.HICUSTOM_SERVE_PORT || 8098);
const IS_WIN = process.platform === 'win32';

/** 用 -EncodedCommand 调 PowerShell，规避引号转义地狱；静音进度流、丢弃 stderr */
function ps(script) {
  const wrapped = "$ProgressPreference='SilentlyContinue';" + script;
  const b64 = Buffer.from(wrapped, 'utf16le').toString('base64');
  return execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** 找出所有 serve.js 进程 pid */
function findServePids() {
  if (IS_WIN) {
    try {
      const out = ps(
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
        "Where-Object { $_.CommandLine -like '*serve.js*' } | " +
        "Select-Object -ExpandProperty ProcessId"
      );
      return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    } catch (e) {
      return [];
    }
  }
  try {
    return execSync("pgrep -f 'scripts/server/serve.js'", { encoding: 'utf8' })
      .split(/\s+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
  } catch (e) {
    return [];
  }
}

function readPid() {
  try {
    const n = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

function currentPids() {
  const set = new Set(findServePids());
  const saved = readPid();
  if (saved) set.add(String(saved));
  // 只保留真实存在的
  const alive = [];
  for (const pid of set) {
    try { process.kill(Number(pid), 0); alive.push(pid); } catch (e) { /* dead */ }
  }
  return alive;
}

function stop() {
  const pids = currentPids();
  if (!pids.length) { console.log('ERP 未在运行。'); return 0; }
  for (const pid of pids) {
    try {
      if (IS_WIN) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      else execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    } catch (e) { /* 已退出 */ }
  }
  try { fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
  console.log('ERP 已停止 (pid: ' + pids.join(', ') + ')。');
  return 0;
}

function start() {
  const running = currentPids();
  if (running.length) {
    console.log('ERP 已在运行 (pid: ' + running.join(', ') + ') → http://127.0.0.1:' + PORT + '/');
    return 0;
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [SERVE_ENTRY], {
    cwd: SKILL_ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log('ERP 已启动 (pid: ' + child.pid + ') → http://127.0.0.1:' + PORT + '/');
  console.log('日志: ' + LOG_FILE);
  return 0;
}

function status(cb) {
  const pids = currentPids();
  if (!pids.length) { console.log('ERP 状态: 未运行'); return cb && cb(); }
  const pid = pids[0];
  let done = false;
  const finish = (msg) => { if (done) return; done = true; console.log(msg); cb && cb(); };
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/products.json', timeout: 3000 }, (res) => {
    res.resume();
    finish('ERP 状态: 运行中 (pid: ' + pid + '), HTTP ' + res.statusCode + ' → http://127.0.0.1:' + PORT + '/');
  });
  req.on('timeout', () => { req.destroy(); finish('ERP 状态: 进程存活 (pid: ' + pid + ') 但 HTTP 无响应 (: ' + PORT + ')'); });
  req.on('error', () => finish('ERP 状态: 进程存活 (pid: ' + pid + ') 但端口 ' + PORT + ' 未监听'));
}

const cmd = (process.argv[2] || 'status').toLowerCase();
switch (cmd) {
  case 'start': process.exit(start()); break;
  case 'stop': process.exit(stop()); break;
  case 'restart': stop(); setTimeout(() => process.exit(start()), 800); break;
  case 'status': status(); break;
  default:
    console.log('用法: node scripts/server/erp.js <start|stop|restart|status>');
    process.exit(1);
}
