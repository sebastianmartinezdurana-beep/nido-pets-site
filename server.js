const http = require('http');
const fs = require('fs');
const path = require('path');
const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.png': 'image/png', '.mp4': 'video/mp4', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff'
};
const root = path.join(__dirname, 'nido-pets-site');
http.createServer((req, res) => {
  let p = path.join(root, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(p).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(4000, () => console.log('Server running at http://localhost:4000'));
