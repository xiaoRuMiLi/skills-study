'use strict';
// 本地静态查看服务器：只暴露 output/ edited/ input/，屏蔽 .env/.hicustom/token.json/.key 等敏感文件。
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8099);
const ALLOWED = ['output', 'edited', 'input'];
const BLOCK = ['.env', '.hicustom', 'token.json', '.key', '.pem', '.p12', '.jks'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function isBlocked(fp) {
  const low = fp.toLowerCase();
  return BLOCK.some((b) => low.includes(b));
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/output/design-area-compare.html';
  const normalized = path.normalize(path.join(root, p));
  if (!normalized.startsWith(path.join(root))) { res.writeHead(403); res.end('forbidden'); return; }
  const rel = path.relative(root, normalized);
  const top = rel.split(path.sep)[0];
  if (!ALLOWED.includes(top)) { res.writeHead(403); res.end('forbidden'); return; }
  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  if (isBlocked(normalized)) { res.writeHead(403); res.end('forbidden'); return; }
  const ext = path.extname(normalized).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(normalized).pipe(res);
});

server.listen(PORT, () => {
  console.log('✅ view server: http://127.0.0.1:' + PORT + '/');
  console.log('   对比页: http://127.0.0.1:' + PORT + '/output/design-area-compare.html');
  console.log('   总览页: http://127.0.0.1:' + PORT + '/output/view-all.html');
});
