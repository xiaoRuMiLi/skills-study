#!/usr/bin/env node
/**
 * Shared, cross-platform resolver for the official SP-API MCP package location.
 * Used by all scripts so the package path logic lives in ONE place.
 *
 * Tries, in order:
 *   1. SPAPI_MCP_PATH env var (explicit override)
 *   2. `npm root -g` global root (works on Windows/macOS/Linux)
 *   3. common global node_modules roots (homebrew, nvm, apt, npm-global, AppData)
 *   4. legacy hardcoded path (this machine)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PKG = '@amazon-sp-api-release/sp-api-dev-mcp';

function resolveBase() {
  // 1. explicit override
  if (process.env.SPAPI_MCP_PATH && fs.existsSync(process.env.SPAPI_MCP_PATH)) return process.env.SPAPI_MCP_PATH;

  // 2. npm global root (suppress stderr noise, capture stdout only)
  try {
    const out = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out) {
      const p = path.join(out.trim(), PKG);
      if (fs.existsSync(path.join(p, 'bundled-servers', 'models'))) return p;
    }
  } catch (e) { /* ignore */ }

  // 3. common global install roots (macOS/Linux/Windows)
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const roots = [
    path.join(home, '.npm-global', 'lib', 'node_modules'),
    path.join(home, '.nvm', 'versions', 'node', 'lib', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
    '/opt/homebrew/lib/node_modules',
    path.join(process.env.APPDATA || '', 'npm', 'node_modules'),
    'D:/node/node_cache/node_modules', // legacy/this machine
  ];
  for (const r of roots) {
    const p = path.join(r, PKG);
    if (fs.existsSync(path.join(p, 'bundled-servers', 'models'))) return p;
  }
  return process.env.SPAPI_MCP_PATH || '';
}

module.exports = { resolveBase, PKG };
