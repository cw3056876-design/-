import {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType} from 'docx';
import {marked} from 'marked';
import {zipSync,strToU8} from 'fflate';
import {DOCS,exportMarkdown,safeName,prototypeDownload} from '../lib/workbench.mjs';

const plain=t=>String(t).replace(/<[^>]*>/g,'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*|__|`/g,'');
const text=(value,options={})=>new Paragraph({children:[new TextRun(plain(value))],spacing:{after:140},...options});
function paragraphs(tokens){
  return tokens.flatMap(t=>{
    if(t.type==='space')return [];
    if(t.type==='heading')return [text(t.text,{heading:[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3][Math.min(t.depth-1,2)]})];
    if(t.type==='list')return t.items.map((item,i)=>text((t.ordered?`${i+1}. `:'• ')+plain(item.text)));
    if(t.type==='table'){
      const row=(cells,header=false)=>new TableRow({tableHeader:header,children:cells.map(c=>new TableCell({children:[text(c.text,{spacing:{after:90}})]}))});
      return [new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[row(t.header,true),...t.rows.map(r=>row(r))]}),text('')];
    }
    if(t.type==='blockquote')return paragraphs(t.tokens).map(p=>p);
    if(t.type==='hr')return [text('—')];
    return [text(t.text||t.raw||'')];
  });
}
export async function wordBytes(markdown){
  const doc=new Document({creator:'AI 产品需求工作台',title:'产品需求文档',description:'AI 辅助生成，关键判断须由使用者审核。',styles:{default:{document:{run:{font:'Microsoft YaHei',size:22},paragraph:{spacing:{line:320}}}},paragraphStyles:[{id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Microsoft YaHei',size:34,bold:true,color:'304B32'},paragraph:{spacing:{before:320,after:180}}}]},sections:[{properties:{page:{margin:{top:1134,bottom:1134,left:1134,right:1134}}},children:paragraphs(marked.lexer(markdown))}]});
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
export function download(value,name,type='application/octet-stream'){
  const url=URL.createObjectURL(new Blob([value],{type}));const link=document.createElement('a');link.href=url;link.download=safeName(name);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function exportAll(project){
  const files={};for(const id of Object.keys(project.documents)){if(!DOCS[id])continue;const md=exportMarkdown(project,id);files[safeName(DOCS[id])+'.md']=strToU8(md);files[safeName(DOCS[id])+'.docx']=await wordBytes(md);}
  if(project.prototype)files['探索原型-隔离预览.html']=strToU8(prototypeDownload(project.prototype));
  files['阅读说明.txt']=strToU8('AI 产品需求工作台 / PM 套件 V3.0\n草稿不等于已确认需求；用户确认不等于 AI 已实测。请核对每份文档的状态、依据与真实数据。\n密钥不包含在此包中。原型运行在隔离框架中，不允许联网。');
  return zipSync(files,{level:6});
}
