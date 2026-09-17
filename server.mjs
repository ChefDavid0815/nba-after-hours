import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
let port = Number(process.env.PORT || 28024);
let attempts=0;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req, res) => {
  let requestPath;
  try { requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end('Bad request'); return; }
  const file = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  });
});
server.on('error',error=>{
  if(error.code==='EADDRINUSE'&&attempts++<10){port++;server.listen(port,'127.0.0.1');}
  else {console.error(`Unable to start NBA After Hours: ${error.message}`);process.exitCode=1;}
});
server.on('listening',()=>{
  const url=`http://127.0.0.1:${port}`;
  console.log(`NBA After Hours: ${url}\nKeep this window open while playing. Press Ctrl+C to stop.`);
  if(process.argv.includes('--open')){
    if(process.platform==='win32')execFile('cmd.exe',['/c','start','',url],{windowsHide:true});
    else execFile(process.platform==='darwin'?'open':'xdg-open',[url]);
  }
});
server.listen(port,'127.0.0.1');
