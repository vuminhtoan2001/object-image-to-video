'use strict';
// Server tinh don gian, chi dung module co san cua Node (khong can npm install).
// Phat toan bo thu muc project nay qua HTTP, lang nghe tren moi dia chi mang (0.0.0.0)
// de may khac trong CUNG WIFI cung mo duoc qua dia chi IP LAN cua may nay.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

function layDiaChiLAN() {
  const ifaces = os.networkInterfaces();
  const ra = [];
  for (const ten in ifaces) {
    for (const i of ifaces[ten]) {
      if (i.family === 'IPv4' && !i.internal) ra.push(i.address);
    }
  }
  return ra;
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath);
    // Chong duyet ra ngoai thu muc goc (vd ../../..).
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error: ' + e.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server dang chay. Mo mot trong cac dia chi sau:`);
  console.log(`  - May nay: http://localhost:${PORT}/bao-cao/index.html`);
  for (const ip of layDiaChiLAN()) {
    console.log(`  - May khac cung WiFi: http://${ip}:${PORT}/bao-cao/index.html`);
  }
  console.log('Nhan Ctrl+C de dung server.');
});
