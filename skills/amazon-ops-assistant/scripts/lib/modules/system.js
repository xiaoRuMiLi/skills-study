'use strict';
// @ts-nocheck
/**
 * system — 环境/规范/元信息：check、init-env、spec、list-ops、list-modules。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

module.exports = function createSystemModule(ctx) {
  const { env, spec, client, format } = ctx;
  const { hr } = format;

  async function check() {
    hr('环境检查');
    const meta = spec.specsMeta();
    console.log('SP-API MCP 包: ' + (meta.base || '(未找到)'));
    console.log('本地规范数量: ' + meta.count + ' 个 JSON');
    console.log('沙盒模式: ' + (env.isSandbox() ? 'ON (sandbox.sellingpartnerapi-<region>)' : 'OFF (生产)'));
    console.log('区域: ' + env.region());

    const list = client.runSpecCli(['--list']);
    console.log('\n' + (list || '(spec --list 失败)'));

    hr('凭证状态 (只显示 ✅/❌)');
    for (const s of env.envStatus()) {
      console.log('  ' + s.key.padEnd(24) + ' = ' + (s.ok ? '✅ 已填' : '❌ 缺失'));
    }
    const placeholders = env.scanEnv();
    if (placeholders.length) {
      console.log('\n⚠️ 检测到模板占位符未替换（这些不是真实凭证）：');
      for (const k of placeholders) console.log('   - ' + k + ' 仍是占位值，请填入真实沙盒凭证。');
    }
  }

  async function initEnv() {
    hr('初始化凭证环境');
    const ws = path.join(__dirname, '..', '..', '..', '..'); // skills -> workspace-dev
    const amazonDev = path.join(ws, 'amazon-dev');
    fs.mkdirSync(amazonDev, { recursive: true });
    const envFile = path.join(amazonDev, '.env');
    console.log('项目工作区: ' + amazonDev);
    if (fs.existsSync(envFile)) {
      console.log('.env 已存在（未覆盖），跳过拷贝。');
    } else {
      const tpl = path.join(__dirname, '..', '..', '..', 'spapi-dev-assistant', 'references', '.env.example');
      if (fs.existsSync(tpl)) { fs.copyFileSync(tpl, envFile); console.log('已从模板创建 .env。'); }
      else { fs.writeFileSync(envFile, '# SP-API 沙盒凭证\nSP_API_CLIENT_ID=\nSP_API_CLIENT_SECRET=\nSP_API_REFRESH_TOKEN=\nSP_API_REGION=fe\nSP_API_MARKETPLACE_IDS=\nSP_API_SANDBOX=true\n', 'utf8'); console.log('已创建 .env（空模板）。'); }
    }
    const out = client.runClientCli(['--env-check']);
    console.log('\n' + (out || '(env-check 失败)'));
    const placeholders = env.scanEnv();
    if (placeholders.length) {
      console.log('\n⚠️ 请填写真实凭证：' + placeholders.join(', ') + '（agent 不读明文值）。');
    }
  }

  async function specCmd(opts, rest) {
    const args = (rest && rest.length ? rest : []);
    const out = client.runSpecCli(args);
    if (!out) { hr('规范查询'); console.log(spec.listAllOps().slice(0, 40).join('\n')); }
    else console.log(out);
  }

  async function listOps() {
    hr('全部 operationId');
    console.log(spec.listAllOps().join('\n'));
    console.log('\n共 ' + spec.listAllOps().length + ' 个 operationId。');
  }

  // 依赖漏洞自检（npm audit）——用于「发布前扫描代码漏洞」，让问卷声称可落地
  async function audit(opts) {
    hr('依赖漏洞扫描 (npm audit)');
    const dir = opts.dir || process.cwd();
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      console.log('当前目录无 package.json，无法直接 npm audit：' + dir);
      console.log('请在含 Node 依赖的项目根目录运行：');
      console.log('  node scripts/ops.js system audit --dir <项目路径>');
      return;
    }
    try {
      const out = execFileSync('npm', ['audit', '--audit-level=high'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      console.log(out);
    } catch (e) {
      if (e.stdout) console.log(e.stdout);   // npm audit 有漏洞时返回非0，stdout 仍是报告
      else console.log('npm audit 执行失败：' + (e.message || e));
    }
  }

  return {
    name: 'system',
    title: '系统',
    describe: '环境/规范/元信息检查',
    commands: {
      check: { usage: '', run: check },
      'init-env': { usage: '', run: initEnv },
      spec: { usage: '<opId或家族> --list', run: specCmd },
      'list-ops': { usage: '', run: listOps },
      audit: { usage: '[--dir <项目路径>]', run: audit },
    },
  };
};
