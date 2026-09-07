import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {STAGES,DOCS,blankProject,serializeProject,restoreProject,invalidateFrom,confirmationIssue,exportMarkdown,prototypeFrame,prototypeDownload,containsSecret,safeName} from '../lib/workbench.mjs';
import {wordBytes,exportAll,download} from './export.mjs';

const $=id=>document.getElementById(id);const STORAGE='prd-workbench-v1';
let project=blankProject(),key='',connected=false,connecting=false,busy=false,controller=null,selectedDoc='card',editing=false,localSave=false,noticeTimer,exporting=false;
const notify=message=>{clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,6500);};
function safeMarkup(markdown){return DOMPurify.sanitize(marked.parse(markdown),{ALLOWED_TAGS:['p','br','strong','em','del','ul','ol','li','h1','h2','h3','h4','blockquote','pre','code','table','thead','tbody','tr','th','td','hr'],ALLOWED_ATTR:[]});}
function renderMarkdown(target,markdown){target.innerHTML=safeMarkup(markdown);for(const table of target.querySelectorAll('table')){const wrap=document.createElement('div');wrap.className='table-wrap';table.replaceWith(wrap);wrap.append(table);}}
function persist(){
  project.updatedAt=new Date().toISOString();
  if(localSave){try{const serialized=JSON.stringify(serializeProject(project));if(containsSecret(serialized,key))throw new Error('secret');localStorage.setItem(STORAGE,serialized);$('save-state').textContent='已保存到本设备 · 不含密钥';}catch{$('save-state').textContent='本地保存失败，请下载项目文件。';}}
  else $('save-state').textContent='草稿仅在本次页面中，请及时保存项目文件。';
}
function context(){return JSON.stringify({title:project.title,documents:project.documents,confirmations:project.confirmations,evidence:project.evidence});}
function isBlocked(stage){return (stage===1&&project.route.ai==='none')||(stage===5&&!project.route.build)||(stage>0&&project.route.decision!=='do');}
function updateBusy(value){busy=value;$('stop').hidden=!value;for(const id of ['send','generate-docs','generate-prototype','confirm-stage','new-project','settings-button','clear-history','project-title','route-size','route-ai','route-surface','route-decision','build-intent','evidence','document-select','apply-edit'])$(id).disabled=value;$('toggle-edit').disabled=value||!project.documents[selectedDoc];$('import-project').disabled=value;document.querySelectorAll('.stage').forEach(b=>b.disabled=value||isBlocked(Number(b.dataset.stage)));}
function renderDocument(){
  const ids=STAGES[project.stage].docs;if(!ids.includes(selectedDoc))selectedDoc=ids[0];
  $('document-select').replaceChildren(...ids.map(id=>new Option(DOCS[id]+(project.documents[id]?'':' · 未生成'),id)));$('document-select').value=selectedDoc;
  const document=project.documents[selectedDoc];
  if(document){renderMarkdown($('document-preview'),exportMarkdown(project,selectedDoc));$('document-editor').value=document.markdown;}
  else{$('document-preview').textContent='开始对话后，在这里查看生成的文档。你可以先梳理问题，也可以根据已有资料生成草稿。';$('document-editor').value='';}
  $('document-preview').hidden=editing;$('document-editor').hidden=!editing;$('apply-edit').hidden=!editing;$('toggle-edit').textContent=editing?'返回预览':'编辑 Markdown';
  for(const id of ['download-word','download-markdown','toggle-edit'])$(id).disabled=!document||exporting||(id==='toggle-edit'&&busy);
  $('prototype-section').hidden=project.stage!==3||!project.prototype;
}
function render(){
  $('project-title').value=project.title;for(const part of ['size','ai','surface','decision'])$('route-'+part).value=project.route[part];$('build-intent').checked=project.route.build;
  $('stages').replaceChildren(...STAGES.map((stage,i)=>{
    const button=document.createElement('button');button.className='stage';button.type='button';button.dataset.stage=i;button.disabled=busy||isBlocked(i);if(i===project.stage)button.setAttribute('aria-current','step');
    const num=document.createElement('b');num.textContent=project.confirmations[i]?'✓':String(i+1).padStart(2,'0');
    const label=document.createElement('span');label.textContent=stage.name;const small=document.createElement('small');small.textContent=isBlocked(i)?'当前路由不需要':project.confirmations[i]?'用户已确认':stage.hint;label.append(small);button.append(num,label);return button;
  }));
  $('stage-title').textContent=STAGES[project.stage].name;$('stage-hint').textContent='阶段 '+(project.stage+1)+' / '+STAGES[project.stage].hint;
  $('stage-state').textContent=project.confirmations[project.stage]?'用户已确认':STAGES[project.stage].docs.some(id=>project.documents[id])?'草稿 · 待确认':'待梳理';
  $('messages').replaceChildren();const turns=project.conversations[project.stage];
  for(const turn of [{role:'assistant',content:STAGES[project.stage].welcome},...turns]){
    const article=document.createElement('article');article.className='message '+turn.role;const label=document.createElement('div');label.className='message-label';label.textContent=turn.role==='user'?'你':'AI 产品伙伴';const content=document.createElement('div');content.className='message-content';
    if(turn.role==='user')content.textContent=turn.content;else renderMarkdown(content,turn.content);article.append(label,content);$('messages').append(article);
  }
  $('messages').scrollTop=$('messages').scrollHeight;
  $('evidence').value=project.evidence[project.stage]||'';
  $('evidence-hint').textContent=project.stage===1?'仅在独立环境完成真实测试后记录结论：需包含事先标准、样本、结果表和基线 prompt。任务包生成不等于能力达标。':project.stage===6?'请写明真实上线日期、观察窗口、数据来源和复盘结论。无数据不能确认实际效果。':'确认会记录当前时间和你提供的依据；修改上游资料后，相关确认会撤回。';
  $('generate-prototype').hidden=project.stage!==3||project.route.surface==='backend';
  $('confirm-stage').textContent=project.confirmations[project.stage]?'撤回本阶段确认':'记录用户确认';renderDocument();updateBusy(busy);
}
function resetConnection(){
  controller?.abort();controller=null;key='';connected=false;connecting=false;$('api-key').value='';$('api-key').type='password';$('show-key').textContent='显示';$('show-key').setAttribute('aria-pressed','false');$('consent').checked=false;$('workspace').hidden=true;$('connection').hidden=false;$('disconnect').hidden=true;$('connection-status').textContent='尚未连接';$('connect-button').disabled=false;
}
async function request(action,messages){
  controller=new AbortController();const response=await fetch('/api/prd',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({action,model:$('model').value,stage:project.stage,route:project.route,messages,context:context()}),signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
  if(!response.ok){let data;try{data=await response.json();}catch{}if(response.status===401)resetConnection();throw new Error(data?.error||'服务器暂时不可用，请稍后重试。');}
  if(!response.body)throw new Error('没有收到响应，请重试。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',result=null;
  const consume=line=>{if(!line.trim())return;const data=JSON.parse(line);if(data.type==='error')throw new Error(data.error);if(data.type==='result')result=data;if(data.type==='progress')$('request-status').textContent=data.characters?'正在整理文档…已接收 '+data.characters+' 字符':'已发送，正在等待 DeepSeek…';};
  try{while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let position;while((position=pending.indexOf('\n'))>=0){consume(pending.slice(0,position));pending=pending.slice(position+1);}}pending+=decoder.decode();consume(pending);}finally{await reader.cancel().catch(()=>{});}
  if(!result)throw new Error('响应中断，已有文档未改变，请重试。');return result;
}
async function run(action,input){
  if(!connected||busy)return;if(isBlocked(project.stage))return notify('当前路由不需要这个阶段。');
  if(editing)return notify('请先保存文档修改或返回预览。');
  if(containsSecret(input,key)||containsSecret(context(),key))return notify('输入中疑似有密钥，请删除后再发送。');
  const stage=project.stage;const turns=project.conversations[stage];
  if(turns.length>=46)return notify('对话较长，请先保存项目文件，再精简本阶段对话。');
  turns.push({role:'user',content:input});render();updateBusy(true);$('request-status').classList.remove('error');$('request-status').textContent='准备请求…';
  try{
    const result=await request(action,turns);
    if(!connected)throw new DOMException('Cancelled','AbortError');
    invalidateFrom(project,stage);
    turns.push({role:'assistant',content:result.reply});
    for(const doc of result.documents)project.documents[doc.id]={markdown:doc.markdown,updatedAt:new Date().toISOString()};
    if(result.prototypeHtml){project.prototype=result.prototypeHtml;loadPrototype();}
    $('request-status').textContent='已更新，文档仍需你审核。';$('message-input').value='';persist();
  }catch(error){
    turns.pop();$('request-status').classList.add('error');$('request-status').textContent=error.name==='AbortError'?'生成已停止；已有文档保留。':error.message;notify($('request-status').textContent);
  }finally{controller=null;updateBusy(false);render();persist();}
}
function loadPrototype(){const frame=$('prototype-preview');frame.onload=()=>frame.contentWindow.postMessage({type:'prd-prototype',html:prototypeFrame(project.prototype)},'*');if(frame.getAttribute('src'))frame.contentWindow?.postMessage({type:'prd-prototype',html:prototypeFrame(project.prototype)},'*');else frame.src='/tools/ai-prd/prototype.html';}
async function guardExport(task){if(exporting)return;exporting=true;renderDocument();try{const all=JSON.stringify(serializeProject(project));if(containsSecret(all,key))throw new Error('资料疑似包含密钥，已阻止导出。');await task();}catch(error){notify(error.message||'导出失败，请重试。');}finally{exporting=false;renderDocument();}}

$('connect-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||connecting)return;key=$('api-key').value.trim();if(!/^sk-[A-Za-z0-9_-]{16,200}$/.test(key)){$('connection-error').textContent='请填写有效的 DeepSeek API Key。';key='';return;}connecting=true;
  $('connect-button').disabled=true;$('connection-error').textContent='';controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),20000);
  try{const response=await fetch('/api/prd',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({action:'connect',model:$('model').value}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});let data;try{data=await response.json();}catch{throw new Error('连接服务不可用，请稍后重试。');}if(!response.ok||!data.ok)throw new Error(data.error||'连接失败。');connected=true;$('api-key').value='';$('connection').hidden=true;$('workspace').hidden=false;$('disconnect').hidden=false;$('connection-status').textContent='DeepSeek · '+($('model').value.endsWith('pro')?'Pro':'Flash');render();if(project.prototype)loadPrototype();}
  catch(error){key='';$('api-key').value='';$('connection-error').textContent=error.name==='AbortError'?'连接超时，请稍后重试。':error.message;}
  finally{clearTimeout(timer);controller=null;connecting=false;$('connect-button').disabled=false;}
});
$('show-key').addEventListener('click',()=>{const show=$('api-key').type==='password';$('api-key').type=show?'text':'password';$('show-key').textContent=show?'隐藏':'显示';$('show-key').setAttribute('aria-pressed',String(show));});
$('disconnect').addEventListener('click',()=>{persist();resetConnection();});
$('message-form').addEventListener('submit',event=>{event.preventDefault();const input=$('message-input').value.trim();if(input)run('chat',input);});
$('message-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('message-form').requestSubmit();}});
$('stop').addEventListener('click',()=>controller?.abort());
$('generate-docs').addEventListener('click',()=>run('generate','请基于当前资料生成或更新本阶段的完整文档。事实不足时明确标待确认，并提出关键问题。'));
$('generate-prototype').addEventListener('click',()=>{if(project.prototype&&!confirm('重新生成会替换当前原型。请先下载旧版，并在对话中写清本次变更许可。继续吗？'))return;run('prototype','请依据已给出的主线、界面要求和变更许可，生成探索版交互原型及决策与换版记录；所有假设与演示数据显著标记。');});
$('stages').addEventListener('click',event=>{const button=event.target.closest('[data-stage]');if(!button||busy)return;if(editing&&!confirm('尚未保存的编辑将丢弃，继续切换吗？'))return;project.stage=Number(button.dataset.stage);editing=false;$('request-status').textContent='';render();persist();});
$('document-select').addEventListener('change',()=>{if(editing&&!confirm('尚未保存的编辑将丢弃，继续吗？')){$('document-select').value=selectedDoc;return;}selectedDoc=$('document-select').value;editing=false;renderDocument();});
$('toggle-edit').addEventListener('click',()=>{editing=!editing;renderDocument();});
$('apply-edit').addEventListener('click',()=>{const content=$('document-editor').value;if(content.length>45000)return notify('文档过长，请精简至 45000 字符以内。');if(containsSecret(content,key))return notify('文档疑似包含密钥，请移除。');project.documents[selectedDoc]={markdown:content,updatedAt:new Date().toISOString()};invalidateFrom(project,project.stage);editing=false;persist();render();});
$('evidence').addEventListener('change',()=>{const value=$('evidence').value;if(containsSecret(value,key)){notify('确认依据不能包含密钥。');$('evidence').value='';return;}project.evidence[project.stage]=value;invalidateFrom(project,project.stage);persist();});
$('confirm-stage').addEventListener('click',()=>{if(project.confirmations[project.stage]){invalidateFrom(project,project.stage);persist();render();return;}project.evidence[project.stage]=$('evidence').value;if(containsSecret(project.evidence[project.stage],key))return notify('依据中不能包含密钥。');const issue=confirmationIssue(project,project.stage);if(issue)return notify(issue);if([1,6].includes(project.stage)&&!confirm('我确认依据来自真实测试或上线数据，而不是 AI 模拟结果。继续记录吗？'))return;project.confirmations[project.stage]={at:new Date().toISOString(),evidence:project.evidence[project.stage]};persist();render();});
$('project-title').addEventListener('change',()=>{if(containsSecret($('project-title').value,key))return notify('名称中不能包含密钥。');project.title=$('project-title').value.trim()||'未命名需求';invalidateFrom(project,0);persist();renderDocument();});
$('settings-button').addEventListener('click',()=>{$('project-settings').hidden=!$('project-settings').hidden;$('settings-button').setAttribute('aria-expanded',String(!$('project-settings').hidden));});
for(const part of ['size','ai','surface','decision'])$('route-'+part).addEventListener('change',()=>{project.route[part]=$('route-'+part).value;invalidateFrom(project,0);if(isBlocked(project.stage))project.stage=0;persist();render();});
$('build-intent').addEventListener('change',()=>{project.route.build=$('build-intent').checked;invalidateFrom(project,5);if(isBlocked(project.stage))project.stage=0;persist();render();});
$('local-save').addEventListener('change',()=>{localSave=$('local-save').checked;if(!localSave){try{localStorage.removeItem(STORAGE);}catch{notify('浏览器未允许清除本地数据，请在浏览器设置中检查。');}}persist();});
$('clear-history').addEventListener('click',()=>{if(!confirm('清除本阶段的对话，只保留文档与确认依据。尚未写入文档的内容会丢失，是否已保存项目文件？'))return;project.conversations[project.stage]=[];persist();render();});
$('new-project').addEventListener('click',()=>{if(!confirm('新需求会替换当前工作区。请先保存项目文件，继续吗？'))return;project=blankProject();editing=false;selectedDoc='card';$('message-input').value='';$('prototype-preview').removeAttribute('src');persist();render();});
$('save-project').addEventListener('click',()=>guardExport(async()=>download(JSON.stringify(serializeProject(project),null,2),safeName(project.title)+'.json','application/json')));
$('import-project').addEventListener('change',async()=>{const file=$('import-project').files[0];if(!file)return;try{if(file.size>2000000)throw new Error('项目文件不能超过 2 MB。');const restored=restoreProject(JSON.parse(await file.text()));if(!confirm('导入将替换当前工作区。是否已保存当前项目？'))return;project=restored;editing=false;persist();render();if(project.prototype)loadPrototype();notify('项目已导入。历史确认已撤回，请重新核对。');}catch(error){notify(error.message||'无法读取项目文件。');}finally{$('import-project').value='';}});
$('download-markdown').addEventListener('click',()=>guardExport(async()=>download(exportMarkdown(project,selectedDoc),safeName(project.title+'-'+DOCS[selectedDoc])+'.md','text/markdown;charset=utf-8')));
$('download-word').addEventListener('click',()=>guardExport(async()=>download(await wordBytes(exportMarkdown(project,selectedDoc)),safeName(project.title+'-'+DOCS[selectedDoc])+'.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')));
$('export-all').addEventListener('click',()=>{if(!Object.keys(project.documents).length)return notify('请先生成至少一份文档。');guardExport(async()=>download(await exportAll(project),safeName(project.title)+'-文档包.zip','application/zip'));});
$('download-prototype').addEventListener('click',()=>guardExport(async()=>download(prototypeDownload(project.prototype),safeName(project.title)+'-探索原型.html','text/html;charset=utf-8')));
window.addEventListener('pagehide',()=>{persist();resetConnection();});window.addEventListener('pageshow',event=>{if(event.persisted)resetConnection();});
window.addEventListener('beforeunload',event=>{if(connected&&(busy||(!localSave&&Object.keys(project.documents).length))){event.preventDefault();event.returnValue='';}});
try{const saved=localStorage.getItem(STORAGE);if(saved){project=restoreProject(JSON.parse(saved));localSave=true;$('local-save').checked=true;}}catch{notify('本地草稿无法读取，可重新导入项目文件。');}
render();persist();
