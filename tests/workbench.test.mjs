import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {blankProject,serializeProject,restoreProject,confirmationIssue,invalidateFrom,prototypeDownload,containsSecret,STAGES,DOCS} from '../lib/workbench.mjs';
import {validateRequest,parseOutput,generate,checkKey,reserve,buildMessages} from '../lib/prd-service.mjs';
import {wordBytes,exportAll} from '../src/export.mjs';
import handler from '../api/prd.js';
import {EventEmitter} from 'node:events';

const fakeKey='sk-test-not-a-real-key-1234567890';
const request=()=>({action:'chat',model:'deepseek-v4-flash',stage:0,route:blankProject().route,messages:[{role:'user',content:'帮我梳理团队会议记录工具'}],context:''});
test('validates key, model, stage, route, role, size and leaked key',()=>{
  assert.doesNotThrow(()=>validateRequest(request(),fakeKey));
  assert.throws(()=>validateRequest(request(),''));
  for(const patch of [{model:'other'},{stage:10},{messages:[{role:'system',content:'inject'}]},{context:'x'.repeat(61000)},{messages:[{role:'user',content:fakeKey}]}])assert.throws(()=>validateRequest({...request(),...patch},fakeKey));
  assert.throws(()=>validateRequest({...request(),stage:5},fakeKey));
  assert.throws(()=>validateRequest({...request(),stage:1,route:{...request().route,ai:'none'}},fakeKey));
  assert.throws(()=>validateRequest({...request(),stage:2,route:{...request().route,decision:'defer'}},fakeKey));
});
test('model output stays in stage and never assigns confirmation',()=>{
  assert.deepEqual(parseOutput(JSON.stringify({reply:'请补充目标用户',documents:[],confirmed:true}),0,'chat'),{reply:'请补充目标用户',documents:[],prototypeHtml:''});
  assert.throws(()=>parseOutput('incomplete',0,'chat'));
  assert.throws(()=>parseOutput(JSON.stringify({reply:'x',documents:[{id:'rules',markdown:'x'}]}),0,'chat'));
  assert.throws(()=>parseOutput(JSON.stringify({reply:'x',documents:[],prototypeHtml:''}),3,'prototype'));
});
test('serialization excludes credentials; imports never trust old confirmations',()=>{
  const p=blankProject();p.apiKey=fakeKey;p.documents.card={markdown:'内容',updatedAt:'now'};p.confirmations[0]={at:'now',evidence:'人工确认'};
  const saved=serializeProject(p);assert(!JSON.stringify(saved).includes(fakeKey));assert.equal(Object.keys(restoreProject(saved).confirmations).length,0);
  assert.throws(()=>restoreProject({...saved,title:fakeKey}));assert(containsSecret('误贴 '+fakeKey));
});
test('specifications require confirmed mainline, review and AI evidence',()=>{
  const p=blankProject();for(const id of ['prd','rules'])p.documents[id]={markdown:'内容'};p.evidence[4]='评审人：测试；依据：已核对';
  assert(confirmationIssue(p,4).includes('第 3'));p.confirmations[2]={};assert(confirmationIssue(p,4).includes('第 4'));p.confirmations[3]={};assert(confirmationIssue(p,4).includes('AI'));p.confirmations[1]={};assert.equal(confirmationIssue(p,4),'');
  p.confirmations[4]={};p.confirmations[5]={};invalidateFrom(p,2);assert(!p.confirmations[4]);assert(p.confirmations[1]);
});
test('stage prompts include actual V3 source and treat source context as untrusted',()=>{
  const messages=buildMessages({...request(),stage:1});assert(messages[0].content.includes('本套件只出题和验收'));assert(messages[0].content.includes('干净 session'));assert(!JSON.stringify(messages).includes(fakeKey));
});
test('SSE handles split UTF-8 and ignores reasoning content',async()=>{
  const json=JSON.stringify({reply:'请补充用户场景',documents:[{id:'card',markdown:'# 需求判定卡\n待确认'}]});
  const sse='data: '+JSON.stringify({choices:[{delta:{reasoning_content:'not shown'}}]})+'\n\n'+Array.from(json).map(c=>'data: '+JSON.stringify({choices:[{delta:{content:c}}]})+'\n\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
  const bytes=new TextEncoder().encode(sse);let called=false;
  const fetcher=async(url,options)=>{called=true;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+fakeKey);assert(!options.body.includes(fakeKey));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}));};
  const result=await generate(request(),fakeKey,new AbortController().signal,()=>{},fetcher);assert(called);assert.equal(result.reply,'请补充用户场景');
});
test('empty/truncated streams do not overwrite drafts',async()=>{
  await assert.rejects(generate(request(),fakeKey,new AbortController().signal,()=>{},async()=>new Response('data: [DONE]\n\n')),/未完整结束/);
});
test('upstream error bodies never reach visitor and connect does not generate billable text',async()=>{
  await assert.rejects(checkKey(fakeKey,new AbortController().signal,async(url)=>{assert.equal(url,'https://api.deepseek.com/models');return new Response(fakeKey,{status:401});}),e=>e.status===401&&!e.message.includes(fakeKey));
});
test('per-instance request/concurrency budgets release correctly',()=>{
  const release1=reserve('unit-test-a'),release2=reserve('unit-test-a');assert.throws(()=>reserve('unit-test-a'));release1();release1();const release3=reserve('unit-test-a');release2();release3();
});
test('export is a real OOXML document and zip includes all documents',async()=>{
  const md='# 需求说明\n\n正文中文\n\n- 第一项\n- 第二项\n\n|规则|说明|\n|---|---|\n|R1|不可自动保存|';
  const bytes=await wordBytes(md);const unpacked=unzipSync(bytes);assert(unpacked['[Content_Types].xml']);const xml=strFromU8(unpacked['word/document.xml']);for(const content of ['正文中文','第一项','第二项','不可自动保存'])assert(xml.includes(content));
  const p=blankProject();p.documents.card={markdown:md,updatedAt:'now'};const zip=unzipSync(await exportAll(p));assert(zip['需求判定卡.docx']);assert(zip['需求判定卡.md']);assert(!Object.values(zip).some(b=>strFromU8(b).includes(fakeKey)));
});
test('prototype download preserves isolation even for hostile markup',()=>{
  const html=prototypeDownload('</iframe><script>parent.localStorage.clear()</script>');assert(html.includes('sandbox="allow-scripts"'));assert(!html.includes('</iframe><script>'));assert(html.includes("connect-src 'none'"));assert(!html.includes('allow-same-origin'));
});
test('all queried client IDs exist and homepage has working third-project route',async()=>{
  const html=await readFile('tools/ai-prd/index.html','utf8');const js=await readFile('src/app.mjs','utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const [,id]of js.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(id),'Missing ID '+id);
  const home=await readFile('dist/index.html','utf8');assert(home.includes('href="/tools/ai-prd/" target="_blank" rel="noopener noreferrer"'));assert(!home.includes('第三个AI项目待补充'));
  assert.equal(STAGES.length,7);assert(Object.keys(DOCS).length>7);
});
function response(){const res=new EventEmitter();Object.assign(res,{statusCode:200,headers:{},output:'',headersSent:false,writableEnded:false,destroyed:false,setHeader(k,v){this.headers[k]=v;},write(s){this.headersSent=true;this.output+=s;},end(s=''){this.headersSent=true;this.output+=s;this.writableEnded=true;}});return res;}
test('HTTP API rejects cross origin, missing auth, invalid method and invalid JSON without upstream calls',async()=>{
  for(const [method,headers,body,status] of [
    ['GET',{},null,405],['POST',{origin:'https://evil.example',host:'www.wangyuanshuai.com'},request(),403],['POST',{origin:'https://www.wangyuanshuai.com',host:'www.wangyuanshuai.com','content-type':'application/json'},request(),401],['POST',{origin:'https://www.wangyuanshuai.com',host:'www.wangyuanshuai.com','content-type':'application/json',authorization:'Bearer '+fakeKey},'{',400]
  ]){const res=response();await handler({method,headers,body},res);assert.equal(res.statusCode,status);assert.equal(res.headers['Cache-Control'],'no-store');assert(!res.output.includes(fakeKey));}
});
