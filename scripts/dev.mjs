import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import handler from '../api/prd.js';
const root=resolve('dist');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const config=JSON.parse(await readFile('vercel.json','utf8'));
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/prd'){
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>220000){res.writeHead(413,{'Content-Type':'application/json'});return res.end('{"error":"请求过大"}');}}
      try{req.body=JSON.parse(raw||'{}');}catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end('{"error":"请求格式错误"}');}
      return handler(req,res);
    }
    let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')&&path!==root){res.writeHead(403);return res.end();}
    if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    if(url.pathname.startsWith('/tools/ai-prd/'))for(const item of config.headers){if(item.source.includes('(.*)')||url.pathname===item.source)for(const h of item.headers)res.setHeader(h.key,h.value);}
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173/tools/ai-prd/'));
