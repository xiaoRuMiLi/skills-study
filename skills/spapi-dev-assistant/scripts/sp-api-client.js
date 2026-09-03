#!/usr/bin/env node
/**
 * sp-api-client.js — Authenticate to and call the Amazon Selling Partner API (SP-API).
 *
 * Handles the two-step auth SP-API requires:
 *   1. LWA (Login with Amazon) refresh-token grant -> access token
 *   2. AWS Signature Version 4 signing of the request (service="execute-api")
 *
 * Credentials come from the environment or a local `.env` file (NEVER from chat):
 *   SP_API_CLIENT_ID, SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN, SP_API_REGION
 *
 * Reusable as a module (require) or a CLI:
 *   node sp-api-client.js get /orders/v0/orders --region fe --query MarketplaceIds=A2VIGQ35RCS4UG
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- creds: env vars first, then .env file(s) ---
const ENV_CANDIDATES = [
  () => process.env.SPAPI_ENV_FILE,                                   // explicit override
  () => path.join(process.cwd(), '.env'),                             // cwd
  () => path.join(__dirname, '..', '..', '..', 'amazon-dev', '.env'), // skill -> workspace-dev/amazon-dev
];
function loadDotEnvAny() {
  for (const get of ENV_CANDIDATES) {
    const f = get();
    if (f && fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
function getCreds() {
  loadDotEnvAny();
  const region = (process.env.SP_API_REGION || 'na').toLowerCase();
  return {
    client_id: process.env.SP_API_CLIENT_ID,
    client_secret: process.env.SP_API_CLIENT_SECRET,
    refresh_token: process.env.SP_API_REFRESH_TOKEN,
    region,
    host: { na: 'sellingpartnerapi-na.amazon.com', eu: 'sellingpartnerapi-eu.amazon.com', fe: 'sellingpartnerapi-fe.amazon.com' }[region] || 'sellingpartnerapi-na.amazon.com',
  };
}

function getAccessToken(c) {
  return fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id, client_secret: c.client_secret }),
  }).then(async (r) => {
    if (!r.ok) { const t = await r.text(); throw new Error('LWA token failed ' + r.status + ': ' + t.slice(0, 200)); }
    const j = await r.json();
    return j.access_token;
  });
}

// AWS SigV4 signing (service = 'execute-api', as SP-API requires)
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hmac(key, s) { return crypto.createHmac('sha256', key).update(s).digest(); }
function hmacHex(key, s) { return crypto.createHmac('sha256', key).update(s).digest('hex'); }

function signRequest({ method, path, query, payload, host, region, accessKey, secretKey }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');   // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const service = 'execute-api';

  const canonicalQuery = Object.entries(query || {}).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).sort().join('&');
  const body = payload == null ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload));
  const payloadHash = sha256(body);
  const canonicalHeaders = 'host:' + host + '\n' + 'x-amz-content-sha256:' + payloadHash + '\n' + 'x-amz-date:' + amzDate + '\n' + 'x-amz-security-token:\n' + 'x-amz-user-agent:sp-api-client\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token;x-amz-user-agent';
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + scope + '\n' + sha256(canonicalRequest);

  const kDate = hmac('AWS4' + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmacHex(kSigning, stringToSign);

  const authorization = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return { amzDate, payloadHash, authorization };
}

async function callSPAPI({ method = 'GET', path, query = {}, body = null }) {
  const c = getCreds();
  const accessToken = await getAccessToken(c);
  const s = signRequest({ method, path, query, payload: body, host: c.host, region: c.region, accessKey: c.client_id, secretKey: c.client_secret });
  const headers = {
    'Authorization': s.authorization,
    'x-amz-date': s.amzDate,
    'x-amz-content-sha256': s.payloadHash,
    'x-amz-access-token': accessToken,
    'x-amz-user-agent': 'sp-api-client',
    'Content-Type': 'application/json',
  };
  const url = 'https://' + c.host + path + (canonicalQuery(query) ? '?' + canonicalQuery(query) : '');
  const resp = await fetch(url, { method, headers, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await resp.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = text; }
  return { status: resp.status, headers: Object.fromEntries(resp.headers), data: json };
}
function canonicalQuery(query) { return Object.entries(query || {}).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).sort().join('&'); }

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--env-check') {
    const c = getCreds();
    const keys = ['SP_API_CLIENT_ID', 'SP_API_CLIENT_SECRET', 'SP_API_REFRESH_TOKEN', 'SP_API_REGION', 'SP_API_MARKETPLACE_IDS'];
    console.log('SP-API 凭证检查：');
    console.log('  region             = ' + (c.region || '(空)'));
    for (const k of keys) {
      const v = process.env[k];
      const target = k === 'SP_API_REGION' ? c.region : v;
      console.log('  ' + k.padEnd(24) + ' = ' + (target ? '✅ 已填' : '❌ 缺失'));
    }
    process.exit(0);
  }
  const method = (args[0] || 'get').toUpperCase();
  const pathArg = args[1] || '/';
  let query = {}; let body = null; let region;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--region') region = args[++i];
    else if (args[i] === '--query') query = Object.fromEntries(args[++i].split('&').map(p => p.split('=')));
    else if (args[i] === '--body') body = args[++i];
  }
  process.env.SP_API_REGION = region || process.env.SP_API_REGION;
  callSPAPI({ method, path: pathArg, query, body }).then((r) => {
    console.log('HTTP ' + r.status);
    console.log(JSON.stringify(r.data, null, 2).slice(0, 4000));
  }).catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
}

module.exports = { callSPAPI, getAccessToken, getCreds };
