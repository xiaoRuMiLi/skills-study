#!/usr/bin/env node
/**
 * spapi-freshness.js — Report how fresh the bundled SP-API spec index is.
 *
 * The official MCP package ships a pre-built doc index plus a metadata.json that
 * records when it was last built/crawled. This is the authoritative freshness
 * signal: if it's old, or if Amazon shipped a new API version, we should pull a
 * supplement before generating code.
 *
 * Usage:
 *   node spapi-freshness.js                    # show freshness report
 *   node spapi-freshness.js --stale-days 14    # exit 1 if older than N days (for scripts)
 */
const fs = require('fs');
const path = require('path');

const { resolveBase } = require('./_base');
const BASE = resolveBase();
const META = path.join(BASE, 'bundled-servers', 'sp-api-dev-assistant-data', 'data', 'metadata.json');

const argv = process.argv.slice(2);
let staleDays = null;
const di = argv.indexOf('--stale-days');
if (di !== -1) { staleDays = parseInt(argv[di + 1] || '0', 10); argv.splice(di, 2); }

if (!fs.existsSync(META)) {
  console.error('metadata.json not found at ' + META);
  console.error('Install the MCP package or set SPAPI_MCP_PATH.');
  process.exit(2);
}

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));

console.log('SP-API spec bundle freshness');
console.log('  path            : ' + path.dirname(META));
console.log('  lastIndexedAt   : ' + meta.lastSuccessfulIndex);
console.log('  documentCount   : ' + meta.documentCount);
if (meta.crawlHistory) {
  console.log('  crawlHistory    :');
  for (const c of meta.crawlHistory) {
    console.log('    - ' + c.source + ' @ ' + c.timestamp + ' (' + c.documentsCrawled + ' docs)');
  }
}

const last = new Date(meta.lastSuccessfulIndex).getTime();
const ageMs = Date.now() - last;
const ageDays = ageMs / 86400000;
console.log('  age             : ' + (ageDays).toFixed(1) + ' days');

const THRESHOLD_DEFAULT_DAYS = 30;
const threshold = staleDays != null ? staleDays : THRESHOLD_DEFAULT_DAYS;
const stale = ageDays > threshold;

console.log('  verdict         : ' + (stale
  ? 'STALE (older than ' + threshold + 'd) — consider refreshing specs before generating code'
  : 'OK (within ' + threshold + 'd freshness window)'));

if (staleDays != null && stale) process.exit(1); // for automated gates
process.exit(0);
