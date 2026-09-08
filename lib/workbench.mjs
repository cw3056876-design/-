export const STAGES = [
  {name:'判定与路由',hint:'判断做什么、值不值得做',docs:['card','profile','ledger'],welcome:'说说你想做的产品：给谁用，解决什么问题？我会先问最多三个关键问题。'},
  {name:'AI 能力预验证',hint:'有 AI 节点时按需插入',docs:['validation'],welcome:'这里生成验证任务包，并整理你带回的真实结果。请在独立的新会话或算法环境中执行验证；这里不模拟测试成绩。'},
  {name:'方案与主线',hint:'收敛第一版的核心路径',docs:['mainline'],welcome:'我们来确定第一版的主流程、成功标准，以及 AI、规则和人的责任边界。'},
  {name:'原型与评审',hint:'试用界面，记录评审结论',docs:['review'],welcome:'描述终端、界面要求和评审范围。点击“生成交互原型”可生成可操作的离线 HTML。未确认的内容保留探索版标记。'},
  {name:'规格沉淀',hint:'生成 PRD 和产品规则集',docs:['prd','rules'],welcome:'把已确认的主线和评审记录沉淀为 PRD 与规则集。AI 尚未验证时，只形成非 AI 部分草稿，不编造能力规格。'},
  {name:'构建交接',hint:'明确要开发时才进入',docs:['build'],welcome:'请先明确开发意图、技术栈及现有工程限制。构建包仅转译已确认的需求，不新增产品决策。'},
  {name:'验证与回流',hint:'用上线后的真实数据复盘',docs:['feedback'],welcome:'请提供上线日期、观察窗口、指标数据和真实失败案例。没有数据就如实标记未回填。'}
];
export const DOCS = {card:'需求判定卡',profile:'产品档案卡',ledger:'需求台账',validation:'AI能力预验证任务包与结果记录',mainline:'主线与方案卡',review:'决策与换版记录',prd:'PRD',rules:'产品规则集',build:'构建交接包',feedback:'验证回流单'};
export const MODELS = ['deepseek-v4-flash','deepseek-v4-pro'];
export const LIMITS = {body:220000, input:8000, history:48, context:60000, document:45000};
export const blankProject = () => ({version:1,title:'未命名需求',route:{size:'L',ai:'core',surface:'web',decision:'do',build:false},stage:0,conversations:STAGES.map(()=>[]),documents:{},confirmations:{},evidence:{},prototype:'',updatedAt:new Date().toISOString()});
export function containsSecret(value, key='') {return (key.length>10 && value.includes(key)) || /sk-[A-Za-z0-9_-]{16,}/.test(value);}
export function safeName(value){return String(value).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').slice(0,80) || '需求文档';}
export function serializeProject(project){
  const p=blankProject(); p.title=String(project.title).slice(0,80);p.route={...project.route};p.stage=project.stage;
  p.conversations=project.conversations.map(turns=>turns.map(t=>({role:t.role,content:t.content})));
  for(const [id,d] of Object.entries(project.documents))if(DOCS[id])p.documents[id]={markdown:d.markdown,updatedAt:d.updatedAt};
  p.confirmations={...project.confirmations};p.evidence={...project.evidence};p.prototype=project.prototype;p.updatedAt=new Date().toISOString();
  return p;
}
export function restoreProject(value){
  if(!value || value.version!==1 || !Array.isArray(value.conversations) || value.conversations.length!==7)throw new Error('不支持的项目文件。');
  if(containsSecret(JSON.stringify(value)))throw new Error('项目文件疑似包含密钥，请先移除。');
  const p=blankProject();p.title=typeof value.title==='string'?value.title.slice(0,80):p.title;
  const r=value.route||{};
  if(['S','M','L'].includes(r.size))p.route.size=r.size;
  if(['none','assist','core'].includes(r.ai))p.route.ai=r.ai;
  if(['web','mobile','backend'].includes(r.surface))p.route.surface=r.surface;
  if(['do','defer','no'].includes(r.decision))p.route.decision=r.decision;
  p.route.build=r.build===true;
  p.stage=Number.isInteger(value.stage)&&value.stage>=0&&value.stage<7?value.stage:0;
  p.conversations=value.conversations.map(turns=>(Array.isArray(turns)?turns:[]).slice(-48).filter(t=>t&&['user','assistant'].includes(t.role)&&typeof t.content==='string').map(t=>({role:t.role,content:t.content.slice(0,16000)})));
  for(const id of Object.keys(DOCS)){const d=value.documents?.[id];if(d&&typeof d.markdown==='string')p.documents[id]={markdown:d.markdown.slice(0,LIMITS.document),updatedAt:String(d.updatedAt||'')};}
  for(let i=0;i<7;i++){const e=value.evidence?.[i];if(typeof e==='string')p.evidence[i]=e.slice(0,4000);}
  // Imported confirmations are not trusted as current review decisions.
  p.prototype=typeof value.prototype==='string'?value.prototype.slice(0,100000):'';
  return p;
}
export function invalidateFrom(project,stage){for(let i=stage;i<7;i++)delete project.confirmations[i];delete project.confirmations[4];delete project.confirmations[5];}
export function confirmationIssue(project,stage){
  if(!STAGES[stage].docs.every(id=>project.documents[id]?.markdown))return '请先生成并检查本阶段的文档。';
  if(!project.evidence[stage]?.trim())return '请填写确认人、依据或评审记录；不能仅凭 AI 输出确认。';
  if(stage===4 && !project.confirmations[2])return '请先确认第 3 阶段主线，再确认正式规格。';
  if(stage===4 && !project.confirmations[3])return '请先完成第 4 阶段评审并记录结论。';
  if(stage===4 && project.route.ai!=='none' && !project.confirmations[1])return 'AI 节点的真实验证记录尚未确认；当前仅保留草稿。';
  if(stage===5 && (!project.route.build || !project.confirmations[4]))return '构建交接需要明确开发意图及已确认的规格。';
  return '';
}
export function exportMarkdown(project,id){
  const stage=STAGES.findIndex(s=>s.docs.includes(id));const c=project.confirmations[stage];
  return `# ${project.title} · ${DOCS[id]}\n\n> ${c?'用户确认版本':'草稿 · 待确认'}\n> 更新：${project.documents[id]?.updatedAt||project.updatedAt}\n> AI 辅助生成，需人工审核。\n${c?`> 确认时间：${c.at}\n> 确认依据：${c.evidence}\n`:''}\n${project.documents[id]?.markdown||''}`;
}
export function prototypeFrame(html){
  const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p style="padding:8px;background:#fff4d6;color:#61481c;font:14px sans-serif">探索原型 · AI 生成内容需核对 · 演示数据不代表验证通过</p>${html}</body></html>`;
}
export function prototypeDownload(html){
  const inner=prototypeFrame(html).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>交互原型 · 隔离预览</title><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><iframe title="隔离的 AI 生成原型" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${inner}"></iframe></body></html>`;
}
