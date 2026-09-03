'use strict';
// @ts-nocheck
/**
 * env.js — 环境：加载 .env、沙盒/区域/市场判断。
 * 凭证只读，不打印明文；只暴露状态与元信息。
 */
const fs = require('fs');
const path = require('path');

// .env 候选路径（与 spapi-dev-assistant 一致）
const ENV_CANDIDATES = [
  () => process.env.SPAPI_ENV_FILE,
  () => path.join(process.cwd(), '.env'),
  // scripts/lib -> scripts -> amazon-ops-assistant -> skills -> workspace-dev -> amazon-dev/.env
  () => path.join(__dirname, '..', '..', '..', '..', 'amazon-dev', '.env'),
];

function loadDotEnv(f) {
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function loadEnv() {
  for (const get of ENV_CANDIDATES) {
    const f = get();
    if (f && fs.existsSync(f)) loadDotEnv(f);
  }
}

const truthy = (v) => v === 'true' || v === '1' || v === 'yes' || v === 'on';
function isSandbox() { return truthy(process.env.SP_API_SANDBOX); }
function region() { return (process.env.SP_API_REGION || 'na').toLowerCase(); }
function marketplaceIds() { return (process.env.SP_API_MARKETPLACE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean); }
function marketplace() { return marketplaceIds()[0] || ''; }
function sellerId() { return process.env.SP_API_SELLER_ID || ''; }

// 只报告哪些键已填/缺失（不显示值）
const TRACKED = ['SP_API_CLIENT_ID', 'SP_API_CLIENT_SECRET', 'SP_API_REFRESH_TOKEN', 'SP_API_REGION', 'SP_API_MARKETPLACE_IDS'];
function envStatus() {
  return TRACKED.map((k) => ({ key: k, ok: !!process.env[k] }));
}

// 检测 .env 里的模板占位符（不显示值，只报键名）
const PLACEHOLDER = /(你的|your[_-]?|changeme|change[_-]?me|example|sample|xxx|fill[_-]?in|todo)/i;
function scanEnv() {
  const bad = [];
  for (const get of ENV_CANDIDATES) {
    const f = get();
    if (!f || !fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S.*?)\s*$/);
      if (m && m[2] !== '' && PLACEHOLDER.test(m[2])) bad.push(m[1]);
    }
  }
  return [...new Set(bad)];
}

module.exports = { loadEnv, isSandbox, region, marketplaceIds, marketplace, sellerId, envStatus, scanEnv, ENV_CANDIDATES, TRACKED };
