'use strict';
// @ts-nocheck
/**
 * app.js — 应用工厂（工厂模式 + 依赖注入）。
 * createApp() 组装核心依赖 -> 注册模块 -> 依赖注入实例化 -> 返回 { ctx, modules, dispatch }。
 * 新增模块：写 modules/<name>.js 工厂 + 在 registerModules() 加一行即可（开闭原则）。
 */
const env = require('./env');
const spec = require('./spec');
const client = require('./client');
const retry = require('./retry');
const response = require('./response');
const format = require('./format');
const parse = require('./parse');
const errors = require('./errors');
const { ModuleRegistry } = require('./registry');

function registerModules(registry) {
  registry.register('system', require('./modules/system'));
  registry.register('orders', require('./modules/orders'));
  registry.register('profit', require('./modules/profit'));
  registry.register('inventory', require('./modules/inventory'));
  registry.register('pricing', require('./modules/pricing'));
  registry.register('sellers', require('./modules/sellers'));
  registry.register('reports', require('./modules/reports'));
  registry.register('workflow', require('./modules/workflow'));
  registry.register('listings', require('./modules/listings'));   // 改价/上架
  registry.register('messaging', require('./modules/messaging')); // 买家消息
  registry.register('restock', require('./modules/restock'));     // 补货建议
  registry.register('competitor', require('./modules/competitor')); // 竞品监控
  registry.register('fulfillment', require('./modules/fulfillment')); // FBA 履约
  registry.register('notifications', require('./modules/notifications')); // 通知订阅
  registry.register('sales', require('./modules/sales')); // 销售表现
}

// 注入到每个模块的核心上下文（依赖倒置：模块不直接碰底层/全局）
function buildCtx() {
  return {
    env: {
      isSandbox: env.isSandbox,
      region: env.region,
      marketplaceIds: env.marketplaceIds,
      marketplace: env.marketplace,
      sellerId: env.sellerId,
      envStatus: env.envStatus,
      scanEnv: env.scanEnv,
    },
    spec: {
      resolveOp: spec.resolveOp,
      listAllOps: spec.listAllOps,
      specsMeta: spec.specsMeta,
      base: spec.base,
      modelsDir: spec.modelsDir,
      getSpecs: spec.getSpecs,
    },
    callOp: client.callOp,       // 适配底层 + 限流 + 规范解析
    client: { runClientCli: client.runClientCli, runSpecCli: client.runSpecCli, getClient: client.getClient },
    format,
    parse: parse.parseArgv,
    unwrap: response.unwrap,
    errors,
  };
}

function createApp() {
  env.loadEnv();                 // 确保沙盒开关等可见
  const ctx = buildCtx();
  const registry = new ModuleRegistry();
  registerModules(registry);
  const modules = registry.create(ctx);   // 依赖注入并实例化

  function help() {
    console.log('亚马逊运营助手 (amazon-ops-assistant)\n');
    console.log('用法: node ops.js <module> <command> [--args]  |  node ops.js list\n');
    for (const mod of Object.values(modules)) {
      if (!mod || !mod.describe) continue;
      console.log('  ' + mod.name.padEnd(12) + ' ' + mod.title + ' — ' + mod.describe);
      for (const [cmdName, cmd] of Object.entries(mod.commands || {})) {
        console.log('      ' + (mod.name + ' ' + cmdName).padEnd(26) + (cmd.usage || ''));
      }
    }
    console.log('\n  list      列出全部模块与命令');
  }

  function listModules() {
    console.log('可用模块与命令：\n');
    for (const mod of Object.values(modules)) {
      if (!mod || !mod.describe) continue;
      console.log('  ' + mod.name.padEnd(12) + ' ' + mod.title + ' — ' + mod.describe);
      for (const [cmdName, cmd] of Object.entries(mod.commands || {})) {
        console.log('      ' + (mod.name + ' ' + cmdName).padEnd(26) + (cmd.usage || ''));
      }
    }
  }

  // 路由
  async function dispatch(argv) {
    const [moduleName, command, ...rest] = argv;
    if (!moduleName) { help(); return; }
    if (moduleName === 'list' || moduleName === 'modules') { listModules(); return; }

    const mod = modules[moduleName];
    if (!mod) { console.log('未知模块: "' + moduleName + '"。用 `node ops.js list` 查看。'); return; }
    const cmd = mod.commands && mod.commands[command];
    if (!cmd) {
      console.log('模块 "' + moduleName + '" 无命令 "' + command + '"（或未指定命令）。');
      console.log('可用命令: ' + Object.keys(mod.commands || {}).join(', '));
      return;
    }
    const opts = parse.parseArgv(rest);
    await cmd.run(opts, rest);   // opts = 解析后的开关；rest = 原始参数（供 spec 等用）
  }

  return { ctx, modules, dispatch, help, listModules };
}

module.exports = { createApp };
