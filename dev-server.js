// Local static server + /api/snooze shim (mimics Vercel req/res). node dev-server.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const handler = require('./api/snooze.js'); const PORT = +process.argv[2] || 3000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/snooze')) {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      req.body = b; res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); }; handler(req, res);
    }); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(__dirname, path.normalize(p));
  if (!f.startsWith(__dirname) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
