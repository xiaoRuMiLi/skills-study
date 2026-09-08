#!/usr/bin/env node
'use strict';
// hicustom-api 入口（artisan 式）：bootstrap -> dispatch
const { bootstrap } = require('./core/bootstrap');
const { app, router } = bootstrap();
router.dispatch(process.argv.slice(2)).catch((e) => { console.error('错误: ' + e.message); process.exit(1); });
