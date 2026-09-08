import {validateRequest,reserve,checkKey,generate,PublicError} from '../lib/prd-service.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const fail=(status,message)=>{if(!res.headersSent){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:message}));}else if(!res.writableEnded){res.write(JSON.stringify({type:'error',error:message})+'\n');res.end();}};
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'请通过工作台发起请求。');}
  let release=()=>{},timer,key='',beat;const controller=new AbortController();
  const cancel=()=>controller.abort();res.on('close',cancel);
  try{
    const origin=req.headers.origin;const host=req.headers.host;
    let same=false;try{const url=new URL(origin);same=url.host===host&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)));}catch{}
    if(!same||req.headers['sec-fetch-site']==='cross-site')throw new PublicError(403,'请从本站工作台使用此功能。');
    if(!String(req.headers['content-type']).startsWith('application/json'))throw new PublicError(415,'请求格式不正确。');
    if(Number(req.headers['content-length']||0)>220000)throw new PublicError(413,'请求内容过大。');
    key=String(req.headers.authorization||'').replace(/^Bearer /,'');
    let body;try{body=req.body;if(typeof body==='string')body=JSON.parse(body);}catch{throw new PublicError(400,'请求 JSON 格式错误。');}
    validateRequest(body,key);
    release=reserve(String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim());
    timer=setTimeout(cancel,105000);
    if(body.action==='connect'){await checkKey(key,controller.signal);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true}));}
    res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('X-Accel-Buffering','no');
    const send=data=>{if(!res.writableEnded&&!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    send({type:'progress',characters:0});beat=setInterval(()=>send({type:'heartbeat'}),15000);
    let previous=0;const result=await generate(body,key,controller.signal,n=>{if(n-previous>=400){previous=n;send({type:'progress',characters:n});}});
    send({type:'result',...result});res.end();
  }catch(error){
    if(!res.destroyed)fail(error instanceof PublicError?error.status:error?.name==='AbortError'?504:502,error instanceof PublicError?error.message:error?.name==='AbortError'?'请求已超时或取消，请稍后重试。':'请求暂时未能完成，请稍后重试。');
  }finally{clearTimeout(timer);clearInterval(beat);release();key='';controller.abort();res.off('close',cancel);}
}
