#!/usr/bin/env node
/**
 * spapi-spec.js — Query the bundled Amazon SP-API Swagger specs (offline, authoritative).
 *
 * The official @amazon-sp-api-release/sp-api-dev-mcp package ships full Swagger 2.0
 * specs for every SP-API in <pkg>/bundled-servers/models/<api>/<version>.json.
 * This script searches them locally (no network needed) so the agent can build
 * Amazon-rule-compliant code against the real endpoint definitions.
 *
 * Usage:
 *   node spapi-spec.js <query>                   # find matching endpoints
 *   node spapi-spec.js <query> --schema <name>   # also print a definition schema
 *   node spapi-spec.js --list                    # list all bundled APIs/versions
 */
const fs = require('fs');
const path = require('path');

// --- resolve the MCP package base dir ---
const { resolveBase } = require('./_base');
const BASE = resolveBase();
const MODELS_DIR = path.join(BASE, 'bundled-servers', 'models');

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// collect every spec file
function collectSpecs() {
  const specs = [];
  if (!fs.existsSync(MODELS_DIR)) {
    console.error('ERROR: models dir not found at ' + MODELS_DIR);
    console.error('Set SPAPI_MCP_PATH to your sp-api-dev-mcp install, or npm install -g @amazon-sp-api-release/sp-api-dev-mcp');
    process.exit(1);
  }
  for (const dir of fs.readdirSync(MODELS_DIR)) {
    const dd = path.join(MODELS_DIR, dir);
    if (!fs.statSync(dd).isDirectory()) continue;
    for (const f of fs.readdirSync(dd)) {
      if (f.endsWith('.json')) specs.push({ api: dir, file: path.join(dd, f), name: f });
    }
  }
  return specs;
}

const argv = process.argv.slice(2);
const wantSchema = argv.indexOf('--schema');
let schemaName = null;
if (wantSchema !== -1) { schemaName = argv[wantSchema + 1]; argv.splice(wantSchema, 2); }
const isList = argv.includes('--list');
const query = argv.join(' ').toLowerCase();

if (isList) {
  const specs = collectSpecs();
  const seen = new Map();
  for (const s of specs) {
    if (!seen.has(s.api)) seen.set(s.api, []);
    seen.get(s.api).push(path.basename(s.name, '.json'));
  }
  console.log('Bundled SP-API specs (' + seen.size + ' APIs):');
  for (const [api, vers] of [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log('  ' + api + ' (' + vers.join(', ') + ')');
  }
  process.exit(0);
}

if (!query) { console.error('Usage: node spapi-spec.js <query> [--schema <name>] | --list'); process.exit(1); }

const specs = collectSpecs();
const results = [];

const STOP = new Set(['list','get','update','create','cancel','delete','post','put','patch','by','the','a','an','for','to','in','of','my','id','fetch','return','obtain','sellers','self','latest','how','what','find']);

function pathScore(p, op, q, api) {
  const opId = (op.operationId || '').toLowerCase();
  const hay = (p + ' ' + opId + ' ' + (op.summary || '') + ' ' + (op.description || '')).toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const nouns = tokens.filter((t) => !STOP.has(t));   // domain words: orders, price, inventory
  const verbs = tokens.filter((t) => STOP.has(t));    // generic verbs
  const isVendor = /^vendor-/.test(api);
  const wantsVendor = q.includes('vendor');
  const apiNorm = api.replace(/-/g, '').toLowerCase();
  const pathNorm = p.toLowerCase();

  let score = 0;
  for (const n of nouns) {
    if (hay.includes(n)) score += 18;
    if (apiNorm.includes(n)) score += 25;  // query names the API family
    if (pathNorm.includes(n)) score += 12;
    if (opId.includes(n)) score += 8;
  }
  for (const v of verbs) if (opId.includes(v) || hay.includes(v)) score += 3;
  if (nouns.length && nouns.every((n) => opId.includes(n))) score += 60; // exact op match
  if (isVendor && !wantsVendor) score -= 30;
  return score;
}

for (const s of specs) {
  let spec;
  try { spec = loadJson(s.file); } catch (e) { continue; }
  if (!spec.paths) continue;
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      const op = ops[method];
      if (!op) continue;
      const sc = pathScore(p, op, query, s.api);
      if (sc > 0) results.push({ api: s.api, version: s.name, path: p, method, op, score: sc });
    }
  }
}

if (results.length === 0) {
  console.log('No endpoint matches for: ' + query);
  console.log('Run: node spapi-spec.js --list   to see available APIs.');
  process.exit(0);
}

results.sort((a, b) => b.score - a.score);
const top = results.slice(0, 6);
console.log('Found ' + results.length + ' matches; showing top ' + top.length + ':');
for (const r of top) {
  const kind = /^vendor-/.test(r.api) ? 'VENDOR' : 'SELLER';
  console.log('## [' + kind + '] ' + r.method.toUpperCase() + ' ' + r.path + '   [api=' + r.api + ' ' + r.version + ']');
  if (r.op.summary) console.log('Summary : ' + r.op.summary);
  if (r.op.operationId) console.log('OpId    : ' + r.op.operationId);
  if (r.op.description) console.log('About   : ' + r.op.description.slice(0, 180));
  if (r.op.parameters && r.op.parameters.length) {
    console.log('Params  :');
    for (const p of r.op.parameters) {
      console.log('  - ' + p.name + ' (' + (p.in || '') + (p.required ? ', required' : '') + '): ' + (p.description || '').slice(0, 150));
    }
  }
  if (r.op.responses) {
    console.log('Resp    : ' + Object.keys(r.op.responses).join(', '));
  }
  console.log('');
}
console.log('SELLER = your own Amazon account (needs your SP-API OAuth). VENDOR = wholesale/supplier endpoints (different authorization).');

if (schemaName) {
  // search all specs for a definition and print it
  for (const s of specs) {
    let spec; try { spec = loadJson(s.file); } catch (e) { continue; }
    if (spec.definitions && spec.definitions[schemaName]) {
      console.log('## definition: ' + schemaName + '  [' + s.api + ']');
      console.log(JSON.stringify(spec.definitions[schemaName], null, 2).slice(0, 2500));
      process.exit(0);
    }
  }
  console.log('(definition "' + schemaName + '" not found in bundled specs)');
}
