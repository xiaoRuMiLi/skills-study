'use strict';
// @ts-nocheck
/**
 * format.js — 展示/聚合辅助。
 */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function money(v, currency = 'USD') {
  if (v == null) return 'N/A';
  return (currency === 'USD' ? '$' : currency + ' ') + num(v).toFixed(2);
}

function hr(title) { console.log('\n========== ' + title + ' =========='); }

function isRetryable(status) { return status === 429 || status === 500 || status === 503; }

module.exports = { num, money, hr, isRetryable };
