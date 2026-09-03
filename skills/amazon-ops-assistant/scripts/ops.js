#!/usr/bin/env node
'use strict';
// @ts-nocheck
/**
 * ops.js — 亚马逊运营助手 CLI 入口（薄路由）。
 * 实际逻辑全部在 lib/（工厂装配 + 模块化）。本文件只做：组装 app + 分发 + 统一错误处理。
 *
 * 用法: node ops.js <module> <command> [--args]   |   node ops.js list
 */
const { createApp } = require('./lib/app');

const app = createApp();

app.dispatch(process.argv.slice(2))
  .catch((e) => {
    console.error('\nERROR: ' + (e && e.message ? e.message : e));
    if (e && e.code === 'NOT_FOUND') console.error('提示: 用 `node ops.js system list-ops` 查可用 operationId。');
    process.exit(1);
  });
