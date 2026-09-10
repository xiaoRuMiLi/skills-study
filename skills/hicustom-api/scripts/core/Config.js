'use strict';
/**
 * Config.js — 配置加载：config/hicustom.json（端点）+ .env（密钥）。
 * 纯读取，不打印密钥；.env 解析与 spapi-dev-assistant 一致。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function loadConfig() {
  loadDotEnv(path.join(ROOT, '.env'));
  const cfgPath = path.join(ROOT, 'config', 'hicustom.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return {
    baseUrl: process.env.HICUSTOM_BASE_URL || cfg.baseUrl,
    endpoints: cfg.endpoints,
    appKey: process.env.HICUSTOM_APP_KEY || '',
    appSecret: process.env.HICUSTOM_APP_SECRET || '',
    refreshToken: process.env.HICUSTOM_REFRESH_TOKEN || '',
    inputDir: process.env.HICUSTOM_INPUT_DIR || cfg.paths.input,
    outputDir: process.env.HICUSTOM_OUTPUT_DIR || cfg.paths.output,
    tokenCachePath: process.env.HICUSTOM_TOKEN_CACHE || path.join(ROOT, '.hicustom', 'token.json'),
    merchant: cfg.merchant || {},
    merchantBaseUrl: process.env.HICUSTOM_MERCHANT_BASE_URL || (cfg.merchant && cfg.merchant.baseUrl) || 'https://www.hicustom.com',
    merchantCookie: process.env.HICUSTOM_MERCHANT_COOKIE || '',
    listing: cfg.listing || {},   // 上架流程用：templatePath 等
    databasePath: process.env.HICUSTOM_DATABASE || path.join(ROOT, 'database', 'products.csv'),
    editedDir: process.env.HICUSTOM_EDITED_DIR || path.join(ROOT, 'edited'),
    zhipuApiKey: process.env.ZHIPU_API_KEY || '',
  };
}

function envStatus(cfg) {
  const keys = ['HICUSTOM_APP_KEY', 'HICUSTOM_APP_SECRET', 'HICUSTOM_REFRESH_TOKEN'];
  return keys.map((k) => ({ key: k, ok: !!process.env[k] }));
}

module.exports = { loadConfig, envStatus, ROOT };
